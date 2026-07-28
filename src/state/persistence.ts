import { z } from 'zod'
import { projectSchema, SCHEMA_VERSION, createEmptyProject, type HengoppProject } from '@/models/project'
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
 * Drop references that cannot be resolved (dangling group children, pinned
 * measurements pointing at deleted objects) so corrupt data never crashes the app.
 */
export function sanitiseProject(project: HengoppProject): HengoppProject {
  const objects = { ...project.objects }
  const groups = { ...project.groups }

  for (const [id, obj] of Object.entries(objects)) {
    if (obj.parentGroupId && !groups[obj.parentGroupId]) {
      objects[id] = { ...obj, parentGroupId: null }
    }
  }
  for (const [id, group] of Object.entries(groups)) {
    const childObjectIds = group.childObjectIds.filter((c) => objects[c])
    const childGroupIds = group.childGroupIds.filter((c) => groups[c] && c !== id)
    const parentGroupId = group.parentGroupId && groups[group.parentGroupId] ? group.parentGroupId : null
    groups[id] = { ...group, childObjectIds, childGroupIds, parentGroupId }
  }
  // Remove groups that would form a cycle or that are empty after cleanup.
  for (const [id, group] of Object.entries(groups)) {
    let cursor = group.parentGroupId
    let guard = 0
    while (cursor && guard < 100) {
      if (cursor === id) {
        groups[id] = { ...groups[id], parentGroupId: null }
        break
      }
      cursor = groups[cursor]?.parentGroupId ?? null
      guard += 1
    }
  }

  const pinnedMeasurements = project.pinnedMeasurements.filter((m) => objects[m.objectId] || groups[m.objectId])

  return { ...project, objects, groups, pinnedMeasurements }
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
