import { beforeEach, describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { isEntityLocked, unlockedEntities } from '@/geometry/groups'
import { buildSnapTargetsForDocument } from '@/geometry/snapping'
import { setEntitiesLocked } from '@/state/doc-actions'
import {
  alignSelection,
  distributeSelection,
  movableSelection,
  nudgeSelection,
  selectionIsLocked,
  toggleSelectionLock,
} from '@/state/commands'
import { __resetProjectStore, useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { makeGroup, makeObject, makeProject } from './helpers'

const doc = () => useProjectStore.getState().doc
const select = (ids: string[]) => useInteractionStore.getState().setSelection(ids, ids[ids.length - 1] ?? null)

beforeEach(() => {
  useInteractionStore.setState({ selection: [], keyId: null, activeGroupId: null })
})

describe('locked entities', () => {
  it('reports an object as locked and filters it out of a selection', () => {
    const project = makeProject([
      makeObject({ id: 'a', locked: true }),
      makeObject({ id: 'b' }),
    ])
    expect(isEntityLocked(project, 'a')).toBe(true)
    expect(isEntityLocked(project, 'b')).toBe(false)
    expect(unlockedEntities(project, ['a', 'b'])).toEqual(['b'])
  })

  it('locks a group as soon as one of its objects is locked', () => {
    const project = makeProject(
      [
        makeObject({ id: 'a', parentGroupId: 'g1', locked: true }),
        makeObject({ id: 'b', parentGroupId: 'g1' }),
      ],
      [makeGroup({ id: 'g1', childObjectIds: ['a', 'b'] })],
    )
    // Moving the group would move the locked object with it.
    expect(isEntityLocked(project, 'g1')).toBe(true)
  })

  it('treats an empty group as unlocked', () => {
    const project = makeProject([], [makeGroup({ id: 'g1' })])
    expect(isEntityLocked(project, 'g1')).toBe(false)
  })
})

describe('locked objects on the canvas', () => {
  it('never moves with the arrow keys', () => {
    __resetProjectStore(
      makeProject([makeObject({ id: 'a', xMm: 100, yMm: 100, locked: true }), makeObject({ id: 'b', xMm: 400, yMm: 100 })]),
    )
    select(['a'])
    expect(movableSelection()).toEqual([])
    nudgeSelection(10, 10)
    expect(doc().objects.a.xMm).toBe(100)

    select(['b'])
    nudgeSelection(10, 10)
    expect(doc().objects.b.xMm).toBe(410)
  })

  it('stays out of an alignment, while the others still align', () => {
    __resetProjectStore(
      makeProject([
        makeObject({ id: 'a', xMm: 100, yMm: 0, widthMm: 100, heightMm: 100, locked: true }),
        makeObject({ id: 'b', xMm: 400, yMm: 200, widthMm: 100, heightMm: 100 }),
      ]),
    )
    select(['a', 'b'])
    alignSelection({ axis: 'x', mode: 'start', reference: 'surface', centerBasis: 'bounds' })
    expect(doc().objects.a.xMm).toBe(100)
    expect(doc().objects.b.xMm).toBe(0)
  })

  it('can still act as the reference the others align to', () => {
    __resetProjectStore(
      makeProject([
        makeObject({ id: 'a', xMm: 100, yMm: 0, widthMm: 100, heightMm: 100 }),
        makeObject({ id: 'b', xMm: 400, yMm: 200, widthMm: 100, heightMm: 100, locked: true }),
      ]),
    )
    useInteractionStore.getState().setSelection(['a', 'b'], 'b')
    alignSelection({ axis: 'x', mode: 'start', reference: 'key', centerBasis: 'bounds' })
    expect(doc().objects.b.xMm).toBe(400)
    expect(doc().objects.a.xMm).toBe(400)
  })

  it('is left out of a distribution entirely', () => {
    __resetProjectStore(
      makeProject([
        makeObject({ id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }),
        makeObject({ id: 'b', xMm: 150, yMm: 0, widthMm: 100, heightMm: 100, locked: true }),
        makeObject({ id: 'c', xMm: 900, yMm: 0, widthMm: 100, heightMm: 100 }),
      ]),
    )
    select(['a', 'b', 'c'])
    // Only two entities are movable, which is below the minimum for a
    // selection-referenced distribution — nothing happens at all.
    expect(distributeSelection({ axis: 'x', reference: 'selection', target: 'edges', outerGap: false })).toBe(
      false,
    )
    expect(doc().objects.b.xMm).toBe(150)
  })

  it('remains a snap target for everyone else', () => {
    const project = makeProject([
      makeObject({ id: 'a', xMm: 300, yMm: 0, widthMm: 100, heightMm: 100, locked: true }),
      makeObject({ id: 'b', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }),
    ])
    const targets = buildSnapTargetsForDocument(project, ['b'])
    expect(targets.x.some((t) => t.refId === 'a' && t.pos === 300)).toBe(true)
  })
})

describe('the lock toggle', () => {
  it('locks a whole selection and collapses it to the key entity', () => {
    __resetProjectStore(makeProject([makeObject({ id: 'a' }), makeObject({ id: 'b' })]))
    useInteractionStore.getState().setSelection(['a', 'b'], 'b')
    expect(selectionIsLocked()).toBe(false)

    toggleSelectionLock()
    expect(doc().objects.a.locked).toBe(true)
    expect(doc().objects.b.locked).toBe(true)
    // A multi-selection of locked objects could not be acted on, so it narrows.
    expect(useInteractionStore.getState().selection).toEqual(['b'])

    toggleSelectionLock()
    expect(doc().objects.b.locked).toBe(false)
  })

  it('reports a mixed selection as unlocked, so the first press locks it', () => {
    __resetProjectStore(makeProject([makeObject({ id: 'a', locked: true }), makeObject({ id: 'b' })]))
    select(['a', 'b'])
    expect(selectionIsLocked()).toBe(false)
  })

  it('locks every object inside a group', () => {
    const project = makeProject(
      [makeObject({ id: 'a', parentGroupId: 'g1' }), makeObject({ id: 'b', parentGroupId: 'g1' })],
      [makeGroup({ id: 'g1', childObjectIds: ['a', 'b'] })],
    )
    const locked = produce(project, (draft) => setEntitiesLocked(draft, ['g1'], true))
    expect(locked.objects.a.locked).toBe(true)
    expect(locked.objects.b.locked).toBe(true)
  })
})
