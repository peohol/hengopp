import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import {
  ancestorChain,
  entitiesAtLevel,
  entityBounds,
  selectableEntityFor,
  wouldCreateCycle,
} from '@/geometry/groups'
import { computeReorder, orderedObjectIds } from '@/geometry/zorder'
import {
  deleteEntities,
  duplicateEntities,
  groupEntities,
  reorderEntities,
  togglePinnedMeasurement,
  ungroup,
} from '@/state/doc-actions'
import { makeGroup, makeObject, makeProject } from './helpers'
import type { HengoppProject } from '@/models/project'

const build = () => {
  const a = makeObject({ id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100, zIndex: 0 })
  const b = makeObject({ id: 'b', xMm: 200, yMm: 0, widthMm: 100, heightMm: 100, zIndex: 1 })
  const c = makeObject({ id: 'c', xMm: 400, yMm: 0, widthMm: 100, heightMm: 100, zIndex: 2 })
  return makeProject([a, b, c])
}

describe('grouping', () => {
  it('creates a group and reparents its children', () => {
    const next = produce(build(), (draft) => {
      groupEntities(draft, ['a', 'b'], null, 'Gruppe 1')
    })
    const groupId = Object.keys(next.groups)[0]
    expect(next.groups[groupId].childObjectIds).toEqual(['a', 'b'])
    expect(next.objects.a.parentGroupId).toBe(groupId)
    expect(entityBounds(next, groupId)).toEqual({ x: 0, y: 0, width: 300, height: 100 })
  })

  it('supports nested groups', () => {
    let innerId = ''
    const withInner = produce(build(), (draft) => {
      innerId = groupEntities(draft, ['a', 'b'], null, 'Indre') ?? ''
    })
    let outerId = ''
    const withOuter = produce(withInner, (draft) => {
      outerId = groupEntities(draft, [innerId, 'c'], null, 'Ytre') ?? ''
    })
    expect(withOuter.groups[innerId].parentGroupId).toBe(outerId)
    expect(entityBounds(withOuter, outerId)).toEqual({ x: 0, y: 0, width: 500, height: 100 })
    expect(ancestorChain(withOuter, 'a')).toEqual([innerId, outerId])
    expect(entitiesAtLevel(withOuter, null)).toEqual([outerId])
    expect(entitiesAtLevel(withOuter, outerId).sort()).toEqual([innerId, 'c'].sort())
  })

  it('selects the outermost entity at the active level', () => {
    let innerId = ''
    let outerId = ''
    const doc = produce(build(), (draft) => {
      innerId = groupEntities(draft, ['a', 'b'], null, 'Indre') ?? ''
      outerId = groupEntities(draft, [innerId, 'c'], null, 'Ytre') ?? ''
    })
    expect(selectableEntityFor(doc, 'a', null)).toBe(outerId)
    expect(selectableEntityFor(doc, 'a', outerId)).toBe(innerId)
    expect(selectableEntityFor(doc, 'a', innerId)).toBe('a')
  })

  it('keeps absolute positions and layer order when a group is dissolved', () => {
    let groupId = ''
    const grouped = produce(build(), (draft) => {
      groupId = groupEntities(draft, ['a', 'c'], null, 'Gruppe 1') ?? ''
    })
    const before = orderedObjectIds(grouped.objects)
    const dissolved = produce(grouped, (draft) => {
      ungroup(draft, groupId)
    })
    expect(dissolved.groups[groupId]).toBeUndefined()
    expect(dissolved.objects.a.xMm).toBe(0)
    expect(dissolved.objects.c.xMm).toBe(400)
    expect(dissolved.objects.a.parentGroupId).toBeNull()
    expect(orderedObjectIds(dissolved.objects)).toEqual(before)
  })

  it('moves children to the grandparent when a nested group is dissolved', () => {
    let innerId = ''
    let outerId = ''
    const doc = produce(build(), (draft) => {
      innerId = groupEntities(draft, ['a', 'b'], null, 'Indre') ?? ''
      outerId = groupEntities(draft, [innerId, 'c'], null, 'Ytre') ?? ''
    })
    const dissolved = produce(doc, (draft) => {
      ungroup(draft, innerId)
    })
    expect(dissolved.objects.a.parentGroupId).toBe(outerId)
    expect(dissolved.groups[outerId].childObjectIds).toContain('a')
  })

  it('prevents circular group references', () => {
    const outer = makeGroup({ id: 'outer', childGroupIds: ['inner'] })
    const inner = makeGroup({ id: 'inner', parentGroupId: 'outer' })
    const doc = makeProject([], [outer, inner])
    expect(wouldCreateCycle(doc, 'inner', 'outer')).toBe(true)
    expect(wouldCreateCycle(doc, 'outer', 'inner')).toBe(false)
    expect(wouldCreateCycle(doc, 'outer', 'outer')).toBe(true)
  })
})

describe('deleting', () => {
  it('deletes a group with all its contents and its measurements', () => {
    let groupId = ''
    const doc = produce(build(), (draft) => {
      groupId = groupEntities(draft, ['a', 'b'], null, 'Gruppe 1') ?? ''
      togglePinnedMeasurement(draft, 'a', 'left')
      togglePinnedMeasurement(draft, 'c', 'top')
    })
    const next = produce(doc, (draft) => deleteEntities(draft, [groupId]))
    expect(Object.keys(next.objects)).toEqual(['c'])
    expect(next.groups[groupId]).toBeUndefined()
    expect(next.pinnedMeasurements).toHaveLength(1)
    expect(next.pinnedMeasurements[0].objectId).toBe('c')
  })

  it('normalises z indices after deletion', () => {
    const next = produce(build(), (draft) => deleteEntities(draft, ['b']))
    expect(Object.values(next.objects).map((o) => o.zIndex).sort()).toEqual([0, 1])
  })
})

describe('duplicating', () => {
  it('creates new ids, offsets the copy and renames it', () => {
    const next = produce(build(), (draft) => {
      duplicateEntities(draft, ['a'])
    })
    const ids = Object.keys(next.objects)
    expect(ids).toHaveLength(4)
    const copy = Object.values(next.objects).find((o) => o.id !== 'a' && o.name.startsWith('Kopi'))!
    expect(copy.name).toBe('Kopi av a')
    expect(copy.xMm).toBe(20)
    expect(copy.yMm).toBe(20)
  })

  it('duplicates a whole group structure', () => {
    let groupId = ''
    const doc = produce(build(), (draft) => {
      groupId = groupEntities(draft, ['a', 'b'], null, 'Gruppe 1') ?? ''
    })
    const next = produce(doc, (draft) => {
      duplicateEntities(draft, [groupId])
    })
    expect(Object.keys(next.groups)).toHaveLength(2)
    expect(Object.keys(next.objects)).toHaveLength(5)
  })
})

describe('layer order', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves a single object one step forward and backward', () => {
    expect(computeReorder(order, ['b'], 'forward')).toEqual(['a', 'c', 'b', 'd'])
    expect(computeReorder(order, ['c'], 'backward')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves to the very front and the very back', () => {
    expect(computeReorder(order, ['a'], 'front')).toEqual(['b', 'c', 'd', 'a'])
    expect(computeReorder(order, ['d'], 'back')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('treats a multi-selection as one block and keeps its internal order', () => {
    expect(computeReorder(order, ['a', 'c'], 'forward')).toEqual(['b', 'd', 'a', 'c'])
    expect(computeReorder(order, ['a', 'c'], 'front')).toEqual(['b', 'd', 'a', 'c'])
    expect(computeReorder(order, ['b', 'd'], 'back')).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is a no-op at the extremes', () => {
    expect(computeReorder(order, ['d'], 'forward')).toEqual(order)
    expect(computeReorder(order, ['a'], 'backward')).toEqual(order)
    expect(computeReorder(order, ['a', 'b', 'c', 'd'], 'front')).toEqual(order)
  })

  it('writes normalised, gap-free z indices', () => {
    const next: HengoppProject = produce(build(), (draft) => reorderEntities(draft, ['a'], 'front'))
    expect(orderedObjectIds(next.objects)).toEqual(['b', 'c', 'a'])
    expect(Object.values(next.objects).map((o) => o.zIndex).sort()).toEqual([0, 1, 2])
  })

  it('reorders a group as a block', () => {
    let groupId = ''
    const doc = produce(build(), (draft) => {
      groupId = groupEntities(draft, ['a', 'c'], null, 'Gruppe 1') ?? ''
    })
    const next = produce(doc, (draft) => reorderEntities(draft, [groupId], 'front'))
    expect(orderedObjectIds(next.objects)).toEqual(['b', 'a', 'c'])
  })
})
