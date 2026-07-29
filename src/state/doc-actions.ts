import type { HengoppProject, MeasurementSide } from '@/models/project'
import type { SceneObject } from '@/models/object'
import type { ObjectGroup } from '@/models/group'
import type { GuideAxis, GuideLine } from '@/models/guide'
import type { MeasureAttachment, MeasureLine } from '@/models/measure'
import type { Rect } from '@/geometry/bounds'
import { clampGuidePos, surfaceExtentFor } from '@/geometry/guides'
import {
  attachToParent,
  descendantObjectIds,
  detachFromParent,
  entitiesBounds,
  objectIdsOfEntities,
  parentOf,
  translateEntity,
  type SceneGraph,
} from '@/geometry/groups'
import { mapRectBetweenBounds } from '@/geometry/resizing'
import { applyOrder, computeReorder, nextZIndex, orderedObjectIds, type ZOrderOp } from '@/geometry/zorder'
import { newGroupId, newGuideId, newMeasureLineId, newMeasurementId, newObjectId } from '@/utils/ids'
import { roundMm } from '@/utils/units'

export type Delta = { id: string; dx: number; dy: number }

export const DUPLICATE_OFFSET_MM = 20

export function addObject(draft: HengoppProject, object: SceneObject): void {
  draft.objects[object.id] = { ...object, zIndex: nextZIndex(draft.objects) }
  if (object.parentGroupId) attachToParent(draft, object.id, object.parentGroupId)
}

export function updateObject(draft: HengoppProject, id: string, patch: Partial<SceneObject>): void {
  const obj = draft.objects[id]
  if (!obj) return
  Object.assign(obj, patch)
}

export function applyDeltas(draft: HengoppProject, deltas: Delta[]): void {
  for (const d of deltas) translateEntity(draft, d.id, d.dx, d.dy)
}

/** Scale a set of entities from one bounding box to another. */
export function scaleEntities(draft: HengoppProject, entityIds: string[], from: Rect, to: Rect): void {
  for (const objId of objectIdsOfEntities(draft, entityIds)) {
    const obj = draft.objects[objId]
    if (!obj) continue
    const mapped = mapRectBetweenBounds(
      { x: obj.xMm, y: obj.yMm, width: obj.widthMm, height: obj.heightMm },
      from,
      to,
    )
    obj.xMm = mapped.x
    obj.yMm = mapped.y
    obj.widthMm = mapped.width
    obj.heightMm = mapped.height
  }
}

/** All group ids contained inside an entity (including the entity itself). */
function groupIdsOfEntity(graph: SceneGraph, id: string, acc: string[] = []): string[] {
  const group = graph.groups[id]
  if (!group || acc.includes(id)) return acc
  acc.push(id)
  for (const child of group.childGroupIds) groupIdsOfEntity(graph, child, acc)
  return acc
}

export function deleteEntities(draft: HengoppProject, entityIds: string[]): void {
  const objectIds = new Set(objectIdsOfEntities(draft, entityIds))
  const groupIds = new Set<string>()
  for (const id of entityIds) groupIdsOfEntity(draft, id).forEach((g) => groupIds.add(g))

  for (const id of entityIds) detachFromParent(draft, id)
  for (const id of objectIds) delete draft.objects[id]
  for (const id of groupIds) delete draft.groups[id]

  // Clean up dangling child references and measurements.
  for (const group of Object.values(draft.groups)) {
    group.childObjectIds = group.childObjectIds.filter((c) => draft.objects[c])
    group.childGroupIds = group.childGroupIds.filter((c) => draft.groups[c])
  }
  draft.pinnedMeasurements = draft.pinnedMeasurements.filter(
    (m) => !objectIds.has(m.objectId) && !groupIds.has(m.objectId),
  )
  applyOrder(draft.objects, orderedObjectIds(draft.objects))
}

/** Group entities that live at the same level. Returns the new group id. */
export function groupEntities(
  draft: HengoppProject,
  entityIds: string[],
  parentGroupId: string | null,
  name: string,
): string | null {
  const valid = entityIds.filter((id) => draft.objects[id] || draft.groups[id])
  if (valid.length < 2) return null

  const id = newGroupId()
  const group: ObjectGroup = {
    id,
    name,
    parentGroupId,
    childObjectIds: [],
    childGroupIds: [],
  }
  draft.groups[id] = group
  if (parentGroupId) attachToParent(draft, id, parentGroupId)

  for (const childId of valid) {
    detachFromParent(draft, childId)
    attachToParent(draft, childId, id)
  }
  return id
}

/** Dissolve a group. Children keep their absolute positions and z-order. */
export function ungroup(draft: HengoppProject, groupId: string): boolean {
  const group = draft.groups[groupId]
  if (!group) return false
  const parentId = parentOf(draft, groupId)
  const children = [...group.childObjectIds, ...group.childGroupIds]
  detachFromParent(draft, groupId)
  for (const childId of children) {
    // Detach from the dissolving group before reattaching to its parent.
    const obj = draft.objects[childId]
    const grp = draft.groups[childId]
    if (obj) obj.parentGroupId = null
    else if (grp) grp.parentGroupId = null
    attachToParent(draft, childId, parentId)
  }
  delete draft.groups[groupId]
  draft.pinnedMeasurements = draft.pinnedMeasurements.filter((m) => m.objectId !== groupId)
  return true
}

export function reorderEntities(draft: HengoppProject, entityIds: string[], op: ZOrderOp): void {
  const order = orderedObjectIds(draft.objects)
  const selected = objectIdsOfEntities(draft, entityIds)
  const next = computeReorder(order, selected, op)
  applyOrder(draft.objects, next)
}

export function togglePinnedMeasurement(
  draft: HengoppProject,
  entityId: string,
  side: MeasurementSide,
): void {
  const index = draft.pinnedMeasurements.findIndex((m) => m.objectId === entityId && m.side === side)
  if (index >= 0) draft.pinnedMeasurements.splice(index, 1)
  else draft.pinnedMeasurements.push({ id: newMeasurementId(), objectId: entityId, side })
}

/* ------------------------------------------------------------------ Guides */

/** Add a guide line, clamped to the surface. Returns the new id. */
export function addGuide(draft: HengoppProject, axis: GuideAxis, posMm: number): string {
  const guide: GuideLine = {
    id: newGuideId(),
    axis,
    posMm: clampGuidePos(posMm, surfaceExtentFor(draft.surface, axis)),
    locked: false,
  }
  draft.guides.push(guide)
  return guide.id
}

/** Move a guide by dragging. A locked guide stays put — that is the lock. */
export function moveGuide(draft: HengoppProject, id: string, posMm: number): void {
  const guide = draft.guides.find((g) => g.id === id)
  if (!guide || guide.locked) return
  guide.posMm = clampGuidePos(posMm, surfaceExtentFor(draft.surface, guide.axis))
}

/**
 * Set a guide's position from a typed value. The lock guards against stray
 * drags on the canvas, not against a number the user deliberately entered.
 */
export function setGuidePos(draft: HengoppProject, id: string, posMm: number): void {
  const guide = draft.guides.find((g) => g.id === id)
  if (!guide) return
  guide.posMm = clampGuidePos(posMm, surfaceExtentFor(draft.surface, guide.axis))
}

export function toggleGuideLock(draft: HengoppProject, id: string): void {
  const guide = draft.guides.find((g) => g.id === id)
  if (guide) guide.locked = !guide.locked
}

export function removeGuide(draft: HengoppProject, id: string): void {
  draft.guides = draft.guides.filter((g) => g.id !== id)
}

/** Pull every guide back inside the surface. */
export function clampGuidesToSurface(draft: HengoppProject): void {
  for (const guide of draft.guides) {
    guide.posMm = clampGuidePos(guide.posMm, surfaceExtentFor(draft.surface, guide.axis))
  }
}

/**
 * Resize the surface. Objects are deliberately left where they are and flagged
 * as outside instead, but a guide has nowhere to be outside the surface: it
 * would be invisible and unreachable, so it follows the edge in.
 */
export function setSurfaceSize(
  draft: HengoppProject,
  size: { widthMm?: number; heightMm?: number },
): void {
  if (size.widthMm !== undefined) draft.surface.widthMm = size.widthMm
  if (size.heightMm !== undefined) draft.surface.heightMm = size.heightMm
  clampGuidesToSurface(draft)
}

/* ---------------------------------------------------------- Measure lines */

export function addMeasureLine(draft: HengoppProject, line: Omit<MeasureLine, 'id'>): string {
  const id = newMeasureLineId()
  draft.measureLines.push({ ...line, id })
  return id
}

/** Pinning keeps a measuring line's labels visible without hovering. */
export function toggleMeasurePinned(draft: HengoppProject, id: string): void {
  const line = draft.measureLines.find((l) => l.id === id)
  if (line) line.pinned = !line.pinned
}

export type MeasureEnd = 'start' | 'end'

/** Move one end of an existing measuring line. */
export function setMeasureEndpoint(
  draft: HengoppProject,
  id: string,
  end: MeasureEnd,
  point: { x: number; y: number },
  attachment?: MeasureAttachment,
): void {
  const line = draft.measureLines.find((l) => l.id === id)
  if (!line) return
  if (end === 'start') {
    line.x1Mm = roundMm(point.x)
    line.y1Mm = roundMm(point.y)
    line.startAttachment = attachment
  } else {
    line.x2Mm = roundMm(point.x)
    line.y2Mm = roundMm(point.y)
    line.endAttachment = attachment
  }
}

/* ------------------------------------------------------------ Ruler origin */

/**
 * Move the zero point of the rulers. It is deliberately not clamped to the
 * surface: measuring from a point off the wall (a doorway, a floor line) is a
 * normal thing to want.
 */
export function setRulerOrigin(draft: HengoppProject, origin: { xMm?: number; yMm?: number }): void {
  if (origin.xMm !== undefined) draft.rulerOrigin.xMm = roundMm(origin.xMm)
  if (origin.yMm !== undefined) draft.rulerOrigin.yMm = roundMm(origin.yMm)
}

export function resetRulerOrigin(draft: HengoppProject): void {
  draft.rulerOrigin = { xMm: 0, yMm: 0 }
}

export function removeMeasureLine(draft: HengoppProject, id: string): void {
  draft.measureLines = draft.measureLines.filter((l) => l.id !== id)
}

/* ----------------------------------------------------------------- Locking */

/** Lock or unlock every object covered by the given entities. */
export function setEntitiesLocked(draft: HengoppProject, entityIds: string[], locked: boolean): void {
  for (const objId of objectIdsOfEntities(draft, entityIds)) {
    const obj = draft.objects[objId]
    if (obj) obj.locked = locked
  }
}

export function copyName(name: string): string {
  return name.startsWith('Kopi av ') ? name : `Kopi av ${name}`
}

/** Duplicate entities with a small visible offset. Returns the new entity ids. */
export function duplicateEntities(draft: HengoppProject, entityIds: string[]): string[] {
  const created: string[] = []
  for (const id of entityIds) {
    const parentId = parentOf(draft, id)
    const newId = cloneEntity(draft, id, parentId, true)
    if (newId) created.push(newId)
  }
  for (const id of created) translateEntity(draft, id, DUPLICATE_OFFSET_MM, DUPLICATE_OFFSET_MM)
  applyOrder(draft.objects, orderedObjectIds(draft.objects))
  return created
}

function cloneEntity(
  draft: HengoppProject,
  id: string,
  parentGroupId: string | null,
  rename: boolean,
  seen: Set<string> = new Set(),
): string | null {
  // Defence in depth: a malformed child list must never recurse forever.
  if (seen.has(id)) return null
  seen.add(id)
  const obj = draft.objects[id]
  if (obj) {
    const clone: SceneObject = {
      ...obj,
      id: newObjectId(),
      name: rename ? copyName(obj.name) : obj.name,
      parentGroupId,
      zIndex: nextZIndex(draft.objects),
      anchor: { ...obj.anchor },
      internalGrid: { ...obj.internalGrid },
    }
    draft.objects[clone.id] = clone
    if (parentGroupId) attachToParent(draft, clone.id, parentGroupId)
    return clone.id
  }
  const group = draft.groups[id]
  if (!group) return null
  const cloneGroup: ObjectGroup = {
    id: newGroupId(),
    name: rename ? copyName(group.name) : group.name,
    parentGroupId,
    childObjectIds: [],
    childGroupIds: [],
  }
  draft.groups[cloneGroup.id] = cloneGroup
  if (parentGroupId) attachToParent(draft, cloneGroup.id, parentGroupId)
  for (const childId of [...group.childObjectIds, ...group.childGroupIds]) {
    cloneEntity(draft, childId, cloneGroup.id, false, seen)
  }
  return cloneGroup.id
}

/** Move a selection so that its bounding box lands on a given position. */
export function moveEntitiesTo(
  draft: HengoppProject,
  entityIds: string[],
  x: number | null,
  y: number | null,
): void {
  const bounds = entitiesBounds(draft, entityIds)
  if (!bounds) return
  const dx = x === null ? 0 : roundMm(x - bounds.x)
  const dy = y === null ? 0 : roundMm(y - bounds.y)
  if (dx === 0 && dy === 0) return
  for (const id of entityIds) translateEntity(draft, id, dx, dy)
}

export function objectCountOfEntity(graph: SceneGraph, id: string): number {
  if (graph.objects[id]) return 1
  if (graph.groups[id]) return descendantObjectIds(graph, id).length
  return 0
}
