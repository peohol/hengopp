import type { SceneObject } from '@/models/object'
import type { ObjectGroup } from '@/models/group'
import { type Rect, rectOf, unionRects, anchorPoint, centerX, centerY } from './bounds'
import { roundMm } from '@/utils/units'

/** Minimal document shape the geometry layer needs. */
export type SceneGraph = {
  objects: Record<string, SceneObject>
  groups: Record<string, ObjectGroup>
}

export type EntityKind = 'object' | 'group'

export function entityKind(graph: SceneGraph, id: string): EntityKind | null {
  if (graph.objects[id]) return 'object'
  if (graph.groups[id]) return 'group'
  return null
}

/** All object ids inside a group, recursively. Order follows the tree. */
export function descendantObjectIds(graph: SceneGraph, groupId: string, seen = new Set<string>()): string[] {
  const group = graph.groups[groupId]
  if (!group || seen.has(groupId)) return []
  seen.add(groupId)
  const out: string[] = []
  for (const objId of group.childObjectIds) if (graph.objects[objId]) out.push(objId)
  for (const childGroupId of group.childGroupIds) out.push(...descendantObjectIds(graph, childGroupId, seen))
  return out
}

/** All object ids covered by a selection of entities (objects and/or groups). */
export function objectIdsOfEntities(graph: SceneGraph, entityIds: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of entityIds) {
    const push = (objId: string) => {
      if (!seen.has(objId)) {
        seen.add(objId)
        out.push(objId)
      }
    }
    if (graph.objects[id]) push(id)
    else if (graph.groups[id]) descendantObjectIds(graph, id).forEach(push)
  }
  return out
}

export function entityBounds(graph: SceneGraph, id: string): Rect | null {
  const obj = graph.objects[id]
  if (obj) return rectOf(obj)
  const group = graph.groups[id]
  if (!group) return null
  const rects = descendantObjectIds(graph, id)
    .map((objId) => graph.objects[objId])
    .filter(Boolean)
    .map(rectOf)
  return unionRects(rects)
}

export function entitiesBounds(graph: SceneGraph, ids: string[]): Rect | null {
  const rects = ids.map((id) => entityBounds(graph, id)).filter((r): r is Rect => r !== null)
  return unionRects(rects)
}

/**
 * The reference point used by alignment. Objects use their anchor; groups use
 * the centre of their bounding box (groups have no anchor of their own).
 */
export function entityAnchorPoint(graph: SceneGraph, id: string): { x: number; y: number } | null {
  const obj = graph.objects[id]
  if (obj) return anchorPoint(obj)
  const bounds = entityBounds(graph, id)
  if (!bounds) return null
  return { x: roundMm(centerX(bounds)), y: roundMm(centerY(bounds)) }
}

export function parentOf(graph: SceneGraph, id: string): string | null {
  const obj = graph.objects[id]
  if (obj) return obj.parentGroupId
  const group = graph.groups[id]
  if (group) return group.parentGroupId
  return null
}

export function ancestorChain(graph: SceneGraph, id: string): string[] {
  const chain: string[] = []
  let current = parentOf(graph, id)
  let guard = 0
  while (current && guard < 100) {
    chain.push(current)
    current = parentOf(graph, current)
    guard += 1
  }
  return chain
}

/**
 * Given a clicked object, find the entity that should be selected at the
 * currently active group level.
 */
export function selectableEntityFor(
  graph: SceneGraph,
  objectId: string,
  activeGroupId: string | null,
): string | null {
  if (!graph.objects[objectId]) return null
  let current: string = objectId
  let guard = 0
  while (guard < 100) {
    const parent = parentOf(graph, current)
    if (parent === activeGroupId) return current
    if (parent === null) return activeGroupId === null ? current : null
    current = parent
    guard += 1
  }
  return null
}

/** Entities that live directly at the given level. */
export function entitiesAtLevel(graph: SceneGraph, activeGroupId: string | null): string[] {
  if (activeGroupId) {
    const group = graph.groups[activeGroupId]
    if (!group) return []
    return [...group.childObjectIds, ...group.childGroupIds]
  }
  const objects = Object.values(graph.objects)
    .filter((o) => o.parentGroupId === null)
    .map((o) => o.id)
  const groups = Object.values(graph.groups)
    .filter((g) => g.parentGroupId === null)
    .map((g) => g.id)
  return [...objects, ...groups]
}

/** Guard against cycles: is `candidateChildId` an ancestor of `groupId`? */
export function wouldCreateCycle(graph: SceneGraph, groupId: string, candidateChildId: string): boolean {
  if (groupId === candidateChildId) return true
  return ancestorChain(graph, groupId).includes(candidateChildId)
}

/** Highest zIndex among an entity's objects (used for "front-most" ordering). */
export function entityTopZ(graph: SceneGraph, id: string): number {
  const ids = objectIdsOfEntities(graph, [id])
  let z = -Infinity
  for (const objId of ids) z = Math.max(z, graph.objects[objId]?.zIndex ?? -Infinity)
  return z
}

/** Detach an entity from its current parent's child lists. */
export function detachFromParent(graph: SceneGraph, id: string): void {
  const parentId = parentOf(graph, id)
  if (!parentId) return
  const parent = graph.groups[parentId]
  if (!parent) return
  parent.childObjectIds = parent.childObjectIds.filter((c) => c !== id)
  parent.childGroupIds = parent.childGroupIds.filter((c) => c !== id)
}

/** Attach an entity to a parent group (or to the root when parentId is null). */
export function attachToParent(graph: SceneGraph, id: string, parentId: string | null): void {
  const obj = graph.objects[id]
  const group = graph.groups[id]
  if (obj) obj.parentGroupId = parentId
  else if (group) group.parentGroupId = parentId
  if (!parentId) return
  const parent = graph.groups[parentId]
  if (!parent) return
  if (obj && !parent.childObjectIds.includes(id)) parent.childObjectIds.push(id)
  if (group && !parent.childGroupIds.includes(id)) parent.childGroupIds.push(id)
}

/** Move every object of an entity by a delta. Operates on a mutable draft. */
export function translateEntity(graph: SceneGraph, id: string, dxMm: number, dyMm: number): void {
  for (const objId of objectIdsOfEntities(graph, [id])) {
    const obj = graph.objects[objId]
    if (!obj) continue
    obj.xMm = roundMm(obj.xMm + dxMm)
    obj.yMm = roundMm(obj.yMm + dyMm)
  }
}
