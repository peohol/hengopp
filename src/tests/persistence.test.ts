import { beforeEach, describe, expect, it, vi } from 'vitest'
import { produce } from 'immer'
import { duplicateEntities } from '@/state/doc-actions'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  exportProjectJson,
  importProjectJson,
  loadProject,
  migrateProject,
  parseProject,
  saveProject,
} from '@/state/persistence'
import { SCHEMA_VERSION } from '@/models/project'
import { makeGroup, makeObject, makeProject } from './helpers'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('loading', () => {
  it('loads a valid stored project', () => {
    const project = makeProject([makeObject({ id: 'a', name: 'Bilde' })], [], { name: 'Stua' })
    saveProject(project, { past: [], future: [] })

    const result = loadProject()
    expect(result.isNew).toBe(false)
    expect(result.project.name).toBe('Stua')
    expect(result.project.objects.a.name).toBe('Bilde')
    expect(result.notice).toBeNull()
  })

  it('round-trips the history stacks', () => {
    const project = makeProject([makeObject({ id: 'a' })])
    const older = makeProject([makeObject({ id: 'a', xMm: 5 })])
    saveProject(project, { past: [older], future: [] })

    const result = loadProject()
    expect(result.history.past).toHaveLength(1)
    expect(result.history.past[0].objects.a.xMm).toBe(5)
  })

  it('starts a fresh project when nothing is stored', () => {
    const result = loadProject()
    expect(result.isNew).toBe(true)
    expect(result.project.isDraftSetup).toBe(true)
    expect(result.notice).toBeNull()
  })

  it('recovers from corrupt data without crashing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is not json')
    const result = loadProject()
    expect(result.isNew).toBe(true)
    expect(result.notice).toBeNull() // unparseable JSON reads as "nothing stored"

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, project: { nope: true } }))
    const invalid = loadProject()
    expect(invalid.isNew).toBe(true)
    expect(invalid.notice).toMatch(/kunne ikke leses/i)
  })

  it('falls back to the backup when the primary entry is broken', () => {
    const good = makeProject([makeObject({ id: 'a' })], [], { name: 'Sikker' })
    window.localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, project: good }),
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, project: { broken: 1 } }))

    const result = loadProject()
    expect(result.project.name).toBe('Sikker')
    expect(result.notice).toMatch(/sikkerhetskopi/i)
  })

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError: quota reached')
    })
    const result = saveProject(makeProject(), { past: [], future: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/full/i)
    spy.mockRestore()
  })
})

describe('validation and repair', () => {
  it('rejects structurally invalid documents', () => {
    expect(parseProject({}).ok).toBe(false)
    expect(parseProject(null).ok).toBe(false)
    const bad = { ...makeProject(), surface: { widthMm: -5, heightMm: 100, color: '#ffffff' } }
    expect(parseProject(bad).ok).toBe(false)
  })

  it('breaks a cycle that only exists in the child lists', () => {
    // A lists B as a child and B lists A as a child, but only B claims a parent.
    // The parent pointers alone look acyclic, so the child lists must be rebuilt.
    const a = makeObject({ id: 'oa', parentGroupId: 'A' })
    const project = makeProject(
      [a],
      [
        makeGroup({ id: 'A', parentGroupId: 'B', childObjectIds: ['oa'], childGroupIds: ['B'] }),
        makeGroup({ id: 'B', parentGroupId: null, childGroupIds: ['A'] }),
      ],
    )
    const result = parseProject(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { groups } = result.project
    // Exactly one of the two edges survives, in both representations.
    expect(groups.A.childGroupIds.includes('B') && groups.B.childGroupIds.includes('A')).toBe(false)
    for (const [id, group] of Object.entries(groups)) {
      for (const childId of group.childGroupIds) {
        expect(groups[childId].parentGroupId).toBe(id)
      }
    }

    // Duplicating must terminate instead of overflowing the stack.
    const duplicated = produce(result.project, (draft) => {
      duplicateEntities(draft, ['A'])
    })
    expect(Object.keys(duplicated.groups).length).toBeGreaterThan(2)
    expect(Object.keys(duplicated.groups).length).toBeLessThan(10)
  })

  it('adopts children that are only referenced by a child list', () => {
    const a = makeObject({ id: 'oa', parentGroupId: null })
    const project = makeProject([a], [makeGroup({ id: 'g', childObjectIds: ['oa'] })])
    const result = parseProject(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.objects.oa.parentGroupId).toBe('g')
    expect(result.project.groups.g.childObjectIds).toEqual(['oa'])
  })

  it('keeps a valid nested hierarchy untouched', () => {
    const a = makeObject({ id: 'oa', parentGroupId: 'inner' })
    const b = makeObject({ id: 'ob', parentGroupId: 'inner' })
    const project = makeProject(
      [a, b],
      [
        makeGroup({ id: 'inner', parentGroupId: 'outer', childObjectIds: ['oa', 'ob'] }),
        makeGroup({ id: 'outer', childGroupIds: ['inner'] }),
      ],
    )
    const result = parseProject(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.groups.inner.childObjectIds).toEqual(['oa', 'ob'])
    expect(result.project.groups.outer.childGroupIds).toEqual(['inner'])
    expect(result.project.groups.inner.parentGroupId).toBe('outer')
  })

  it('drops dangling references instead of failing', () => {
    const project = {
      ...makeProject([makeObject({ id: 'a', parentGroupId: 'ghost' })], [
        makeGroup({ id: 'g', childObjectIds: ['a', 'missing'], childGroupIds: ['nope'] }),
      ]),
      pinnedMeasurements: [{ id: 'm1', objectId: 'gone', side: 'left' as const }],
    }
    const result = parseProject(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The dangling parent pointer is dropped; the group that actually lists the
    // object as a child then adopts it, so both representations agree.
    expect(result.project.objects.a.parentGroupId).toBe('g')
    expect(result.project.groups.g.childObjectIds).toEqual(['a'])
    expect(result.project.groups.g.childGroupIds).toEqual([])
    expect(result.project.pinnedMeasurements).toEqual([])
  })

  it('clears a parent pointer that no other group claims', () => {
    const project = makeProject([makeObject({ id: 'a', parentGroupId: 'ghost' })], [])
    const result = parseProject(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.objects.a.parentGroupId).toBeNull()
  })
})

describe('schema migration', () => {
  it('migrates a version 0 document', () => {
    const legacy = {
      id: 'old',
      name: 'Gammelt prosjekt',
      surface: { widthMm: 2000, heightMm: 1500, color: '#ffffff' },
      objects: {},
      groups: {},
    }
    const migrated = migrateProject(legacy) as Record<string, unknown>
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.settings).toMatchObject({ snapToGrid: true, snapToObjects: true })
    expect(migrated.pinnedMeasurements).toEqual([])

    const parsed = parseProject(legacy)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.project.surface.widthMm).toBe(2000)
      expect(parsed.project.displayUnit).toBe('cm')
    }
  })

  it('leaves current documents untouched', () => {
    const project = makeProject([makeObject({ id: 'a' })])
    const parsed = parseProject(project)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.project.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('import and export', () => {
  it('round-trips through JSON', () => {
    const project = makeProject([makeObject({ id: 'a', name: 'Ramme' })], [], { name: 'Gang' })
    const json = exportProjectJson(project)
    const parsed = importProjectJson(json)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.project.name).toBe('Gang')
      expect(parsed.project.objects.a.name).toBe('Ramme')
    }
  })

  it('accepts a stored envelope as well as a bare project', () => {
    const project = makeProject([makeObject({ id: 'a' })])
    const envelope = JSON.stringify({ schemaVersion: SCHEMA_VERSION, project })
    expect(importProjectJson(envelope).ok).toBe(true)
  })

  it('validates the import before it can replace anything', () => {
    expect(importProjectJson('not json')).toEqual({ ok: false, error: 'Filen er ikke gyldig JSON.' })
    const invalid = importProjectJson(JSON.stringify({ schemaVersion: 1, hello: 'world' }))
    expect(invalid.ok).toBe(false)
  })
})
