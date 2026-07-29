import { z } from 'zod'
import {
  projectSchema,
  DEFAULT_RULER_ORIGIN,
  SCHEMA_VERSION,
  createEmptyProject,
  type HengoppProject,
} from '@/models/project'
import { newProjectId } from '@/utils/ids'

export const STORAGE_KEY = 'hengopp.project.v1'
export const BACKUP_KEY = 'hengopp.project.v1.backup'

export const HISTORY_LIMIT = 10

const envelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  /** Must be an object — this is what distinguishes an envelope from a bare project. */
  project: z.object({}).passthrough(),
  history: z
    .object({ past: z.array(z.unknown()).default([]), future: z.array(z.unknown()).default([]) })
    .optional(),
})

export type StoredEnvelope = {
  schemaVersion: number
  project: HengoppProject
  history: { past: HengoppProject[]; future: HengoppProject[] }
}

export type LoadResult = {
  project: HengoppProject
  history: { past: HengoppProject[]; future: HengoppProject[] }
  /** Set when stored data was missing, invalid, or had to be recovered. */
  notice: string | null
  /** True when nothing usable was found and a fresh project was created. */
  isNew: boolean
}

/**
 * Migrate a raw parsed project towards the current schema version. Unknown or
 * missing fields are filled with defaults so old documents keep working.
 */
export function migrateProject(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const doc = { ...(raw as Record<string, unknown>) }
  // Only repair values that actually look like a Hengopp document. Arbitrary
  // objects must fail validation rather than be filled in with defaults.
  const looksLikeProject = 'schemaVersion' in doc || 'surface' in doc || 'objects' in doc
  if (!looksLikeProject) return raw
  const version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0

  if (version < 1) {
    // v0 → v1: settings block and pinned measurements were introduced, and the
    // display unit moved into the document.
    const base = createEmptyProject(typeof doc.id === 'string' ? doc.id : newProjectId())
    doc.settings = { ...base.settings, ...(typeof doc.settings === 'object' ? doc.settings : {}) }
    doc.pinnedMeasurements = Array.isArray(doc.pinnedMeasurements) ? doc.pinnedMeasurements : []
    doc.displayUnit = doc.displayUnit === 'mm' ? 'mm' : 'cm'
    doc.surfaceGrid = doc.surfaceGrid ?? base.surfaceGrid
    doc.surface = doc.surface ?? base.surface
    doc.objects = doc.objects ?? {}
    doc.groups = doc.groups ?? {}
    doc.name = typeof doc.name === 'string' && doc.name ? doc.name : base.name
    doc.id = typeof doc.id === 'string' && doc.id ? doc.id : base.id
    doc.isDraftSetup = doc.isDraftSetup === true
    doc.schemaVersion = 1
  }

  if (version < 2) {
    // v1 → v2: guides, measuring lines, the ruler origin, per-object opacity
    // and locking. Objects written before opacity existed were drawn fully
    // opaque, so they keep that look instead of the new-object default.
    doc.guides = Array.isArray(doc.guides) ? doc.guides : []
    doc.measureLines = Array.isArray(doc.measureLines) ? doc.measureLines : []
    doc.rulerOrigin = doc.rulerOrigin ?? { ...DEFAULT_RULER_ORIGIN }
    if (doc.objects && typeof doc.objects === 'object') {
      const objects: Record<string, unknown> = {}
      for (const [id, value] of Object.entries(doc.objects as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') {
          objects[id] = value
          continue
        }
        const object = value as Record<string, unknown>
        objects[id] = {
          ...object,
          fillOpacity: typeof object.fillOpacity === 'number' ? object.fillOpacity : 1,
          locked: object.locked === true,
        }
      }
      doc.objects = objects
    }
    doc.schemaVersion = 2
  }

  return doc
}

export type ParseProjectResult =
  | { ok: true; project: HengoppProject }
  | { ok: false; error: string }

/** Validate (and repair) an unknown value into a project. */
export function parseProject(raw: unknown): ParseProjectResult {
  const migrated = migrateProject(raw)
  const parsed = projectSchema.safeParse(migrated)
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { ok: false, error: first ? `${first.path.join('.') || 'dokument'}: ${first.message}` : 'Ugyldig prosjektfil' }
  }
  return { ok: true, project: sanitiseProject(parsed.data) }
}

/**
 * Repair a structurally valid but semantically broken document so it can never
 * crash the app: drop dangling references, reconcile the two representations of
 * the hierarchy (parent pointers and child lists) and break any cycle.
 *
 * The parent pointers are made authoritative and acyclic first; the child lists
 * are then rebuilt from them, which makes a cycle in `childGroupIds`
 * impossible by construction.
 */
export function sanitiseProject(project: HengoppProject): HengoppProject {
  const objects = { ...project.objects }
  const groups = { ...project.groups }

  // 1. Parent pointers must reference an existing group.
  for (const [id, obj] of Object.entries(objects)) {
    if (obj.parentGroupId && !groups[obj.parentGroupId]) {
      objects[id] = { ...obj, parentGroupId: null }
    }
  }
  for (const [id, group] of Object.entries(groups)) {
    const parentGroupId =
      group.parentGroupId && groups[group.parentGroupId] && group.parentGroupId !== id
        ? group.parentGroupId
        : null
    groups[id] = { ...group, parentGroupId }
  }

  // 2. A child listed by a group, but with no parent of its own, adopts that
  //    group as parent. First claim wins, so a child is never claimed twice.
  for (const [id, group] of Object.entries(groups)) {
    for (const childId of group.childObjectIds) {
      const child = objects[childId]
      if (child && child.parentGroupId === null) objects[childId] = { ...child, parentGroupId: id }
    }
    for (const childId of group.childGroupIds) {
      const child = groups[childId]
      if (child && child.parentGroupId === null && childId !== id) {
        groups[childId] = { ...child, parentGroupId: id }
      }
    }
  }

  // 3. Break parent-pointer cycles, so the hierarchy is a forest.
  for (const id of Object.keys(groups)) {
    let cursor = groups[id].parentGroupId
    let guard = 0
    while (cursor && guard < Object.keys(groups).length + 1) {
      if (cursor === id) {
        groups[id] = { ...groups[id], parentGroupId: null }
        break
      }
      cursor = groups[cursor]?.parentGroupId ?? null
      guard += 1
    }
    // Depth beyond the number of groups can only mean a cycle further up.
    if (guard >= Object.keys(groups).length + 1) {
      groups[id] = { ...groups[id], parentGroupId: null }
    }
  }

  // 4. Rebuild the child lists from the (now acyclic) parent pointers, keeping
  //    the original ordering where it is still meaningful.
  const orderIn = (list: string[], id: string) => {
    const index = list.indexOf(id)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  for (const [id, group] of Object.entries(groups)) {
    const childObjectIds = Object.values(objects)
      .filter((o) => o.parentGroupId === id)
      .map((o) => o.id)
      .sort(
        (a, b) =>
          orderIn(group.childObjectIds, a) - orderIn(group.childObjectIds, b) || a.localeCompare(b),
      )
    const childGroupIds = Object.values(groups)
      .filter((g) => g.parentGroupId === id)
      .map((g) => g.id)
      .sort(
        (a, b) =>
          orderIn(group.childGroupIds, a) - orderIn(group.childGroupIds, b) || a.localeCompare(b),
      )
    groups[id] = { ...group, childObjectIds, childGroupIds }
  }

  const pinnedMeasurements = project.pinnedMeasurements.filter((m) => objects[m.objectId] || groups[m.objectId])

  // A guide outside the surface could never be reached again, so clamp rather
  // than drop: the user keeps the line, just at the nearest valid position.
  const guides = project.guides.map((g) => ({
    ...g,
    posMm: clampToSurface(g.posMm, g.axis === 'x' ? project.surface.widthMm : project.surface.heightMm),
  }))

  return { ...project, objects, groups, pinnedMeasurements, guides }
}

function clampToSurface(value: number, sizeMm: number): number {
  return Math.min(Math.max(value, 0), Math.max(sizeMm, 0))
}

function readRaw(key: string): unknown | null {
  try {
    const text = window.localStorage.getItem(key)
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function loadProject(): LoadResult {
  const fresh = (): LoadResult => ({
    project: createEmptyProject(newProjectId()),
    history: { past: [], future: [] },
    notice: null,
    isNew: true,
  })

  if (typeof window === 'undefined' || !window.localStorage) return fresh()

  const attempt = (key: string): { result: LoadResult; failed: boolean } | null => {
    const raw = readRaw(key)
    if (raw === null) return null
    const envelope = envelopeSchema.safeParse(raw)
    const projectRaw = envelope.success ? envelope.data.project : raw
    const parsed = parseProject(projectRaw)
    if (!parsed.ok) return { result: fresh(), failed: true }
    const history = { past: [] as HengoppProject[], future: [] as HengoppProject[] }
    if (envelope.success && envelope.data.history) {
      for (const entry of envelope.data.history.past.slice(-HISTORY_LIMIT)) {
        const p = parseProject(entry)
        if (p.ok) history.past.push(p.project)
      }
      for (const entry of envelope.data.history.future.slice(-HISTORY_LIMIT)) {
        const p = parseProject(entry)
        if (p.ok) history.future.push(p.project)
      }
    }
    return { result: { project: parsed.project, history, notice: null, isNew: false }, failed: false }
  }

  const primary = attempt(STORAGE_KEY)
  if (primary && !primary.failed) return primary.result

  const backup = attempt(BACKUP_KEY)
  if (backup && !backup.failed) {
    return { ...backup.result, notice: 'Lagret prosjekt var skadet. Gjenopprettet fra sikkerhetskopi.' }
  }

  if (primary?.failed || backup?.failed) {
    return { ...fresh(), notice: 'Lagret prosjekt kunne ikke leses. Startet et nytt prosjekt.' }
  }
  return fresh()
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export function saveProject(
  project: HengoppProject,
  history: { past: HengoppProject[]; future: HengoppProject[] },
): SaveResult {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ok: false, error: 'Lagring er ikke tilgjengelig i dette miljøet.' }
  }
  const envelope: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    project,
    history: {
      past: history.past.slice(-HISTORY_LIMIT),
      future: history.future.slice(-HISTORY_LIMIT),
    },
  }
  try {
    const previous = window.localStorage.getItem(STORAGE_KEY)
    const text = JSON.stringify(envelope)
    window.localStorage.setItem(STORAGE_KEY, text)
    // Keep the previous good state as a backup.
    if (previous) window.localStorage.setItem(BACKUP_KEY, previous)
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error && /quota/i.test(err.message)
        ? 'Lagringsplassen er full. Endringene er ikke lagret lokalt.'
        : 'Kunne ikke lagre prosjektet lokalt.'
    return { ok: false, error: message }
  }
}

export function clearStoredProject(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(BACKUP_KEY)
  } catch {
    /* ignore */
  }
}

export function exportProjectJson(project: HengoppProject): string {
  return JSON.stringify(project, null, 2)
}

export function importProjectJson(text: string): ParseProjectResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Filen er ikke gyldig JSON.' }
  }
  const envelope = envelopeSchema.safeParse(raw)
  return parseProject(envelope.success ? envelope.data.project : raw)
}
