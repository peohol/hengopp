import type { HengoppProject } from '@/models/project'
import type { AlignOptions } from '@/geometry/alignment'
import { computeAlignment } from '@/geometry/alignment'
import { computeDistribution, minimumEntities, type DistributeOptions } from '@/geometry/distribution'
import {
  entitiesAtLevel,
  entitiesBounds,
  isEntityLocked,
  objectIdsOfEntities,
  parentOf,
  unlockedEntities,
} from '@/geometry/groups'
import type { ZOrderOp } from '@/geometry/zorder'
import { MIN_SIZE_MM } from '@/geometry/resizing'
import {
  applyDeltas,
  deleteEntities,
  duplicateEntities,
  groupEntities,
  moveEntitiesTo,
  removeGuide,
  removeMeasureLine,
  reorderEntities,
  scaleEntities,
  setEntitiesLocked,
  ungroup,
} from './doc-actions'
import { useProjectStore } from './project-store'
import { useInteractionStore } from './interaction-store'
import { useUiStore } from './ui-store'
import { roundMm } from '@/utils/units'

const project = () => useProjectStore.getState()
const interaction = () => useInteractionStore.getState()
const ui = () => useUiStore.getState()

/**
 * The part of the selection that may be moved or resized. Locked entities stay
 * selectable and editable, they just never travel with a canvas operation.
 */
export function movableSelection(): string[] {
  return unlockedEntities(project().doc, interaction().selection)
}

export function nudgeSelection(dxMm: number, dyMm: number): void {
  const movable = movableSelection()
  if (movable.length === 0) return
  project().commit((draft) => {
    applyDeltas(
      draft,
      movable.map((id) => ({ id, dx: dxMm, dy: dyMm })),
    )
  })
}

export type GeometryField = 'x' | 'y' | 'width' | 'height'

function geometryRecipe(selection: string[], field: GeometryField, valueMm: number) {
  return (draft: HengoppProject) => {
    const bounds = entitiesBounds(draft, selection)
    if (!bounds) return
    if (field === 'x') moveEntitiesTo(draft, selection, valueMm, null)
    else if (field === 'y') moveEntitiesTo(draft, selection, null, valueMm)
    else {
      const width = field === 'width' ? Math.max(MIN_SIZE_MM, valueMm) : bounds.width
      const height = field === 'height' ? Math.max(MIN_SIZE_MM, valueMm) : bounds.height
      if (bounds.width <= 0 || bounds.height <= 0) return
      scaleEntities(draft, selection, bounds, { ...bounds, width: roundMm(width), height: roundMm(height) })
    }
  }
}

export function previewSelectionGeometry(field: GeometryField, valueMm: number): void {
  const { selection } = interaction()
  if (selection.length === 0) return
  project().updateTransient(geometryRecipe(selection, field, valueMm))
}

export function beginGeometryEdit(): void {
  project().beginTransaction()
}

export function commitSelectionGeometry(field: GeometryField, valueMm: number): void {
  const { selection } = interaction()
  if (selection.length === 0) return
  const store = project()
  store.beginTransaction()
  store.updateTransient(geometryRecipe(selection, field, valueMm))
  store.commitTransaction()
}

export function cancelGeometryEdit(): void {
  project().cancelTransaction()
}

export function renameSelected(name: string): void {
  const { selection } = interaction()
  if (selection.length !== 1) return
  const id = selection[0]
  project().commit((draft) => {
    const obj = draft.objects[id]
    if (obj) obj.name = name
    const group = draft.groups[id]
    if (group) group.name = name
  })
}

export function groupSelection(): void {
  const { selection, activeGroupId, setSelection } = interaction()
  if (selection.length < 2) return
  let createdId: string | null = null
  const doc = project().doc
  const existing = Object.keys(doc.groups).length
  project().commit((draft) => {
    createdId = groupEntities(draft, selection, activeGroupId, `Gruppe ${existing + 1}`)
  })
  if (createdId) setSelection([createdId], createdId)
}

export function ungroupSelection(): void {
  const { selection, setSelection } = interaction()
  const doc = project().doc
  const groupIds = selection.filter((id) => doc.groups[id])
  if (groupIds.length === 0) return
  const released: string[] = []
  for (const id of groupIds) {
    const group = doc.groups[id]
    if (group) released.push(...group.childObjectIds, ...group.childGroupIds)
  }
  project().commit((draft) => {
    for (const id of groupIds) ungroup(draft, id)
  })
  const keep = selection.filter((id) => !groupIds.includes(id))
  const next = [...keep, ...released]
  setSelection(next, next[next.length - 1] ?? null)
}

export function deleteSelection(): void {
  const { selection, clearSelection } = interaction()
  if (selection.length === 0) return
  const doc = project().doc
  const objectCount = objectIdsOfEntities(doc, selection).length
  const hasFatGroup = selection.some((id) => doc.groups[id]) && objectCount > 1

  const run = () => {
    project().commit((draft) => deleteEntities(draft, selection))
    clearSelection()
  }

  if (hasFatGroup) {
    ui().askConfirm({
      title: 'Slett gruppe med innhold',
      message: `Gruppen inneholder ${objectCount} objekter. Alt innhold slettes. Vil du heller løse opp gruppen, kan du bruke «Løs opp gruppe».`,
      confirmLabel: 'Slett alt',
      danger: true,
      onConfirm: run,
    })
    return
  }
  run()
}

export function duplicateSelection(): void {
  const { selection, setSelection } = interaction()
  if (selection.length === 0) return
  let created: string[] = []
  project().commit((draft) => {
    created = duplicateEntities(draft, selection)
  })
  if (created.length > 0) setSelection(created, created[created.length - 1])
}

export function alignSelection(opts: Omit<AlignOptions, 'keyId'>): void {
  const { selection, keyId } = interaction()
  if (selection.length === 0) return
  const doc = project().doc
  const movable = unlockedEntities(doc, selection)
  // The key entity never moves, so a locked one is still a valid reference to
  // align the others against.
  const participants =
    keyId && selection.includes(keyId) && !movable.includes(keyId) ? [...movable, keyId] : movable
  if (participants.length === 0) return
  const deltas = computeAlignment(doc, participants, doc.surface, { ...opts, keyId })
  if (deltas.length === 0) return
  project().commit((draft) => applyDeltas(draft, deltas))
}

export function distributeSelection(opts: DistributeOptions, confirmedOverlap = false): boolean {
  const { selection } = interaction()
  const doc = project().doc
  // A locked object must not be spaced out along with the rest, so it is left
  // out of the calculation entirely rather than pinned inside it.
  const participants = unlockedEntities(doc, selection)
  if (participants.length < minimumEntities(opts)) return false
  const result = computeDistribution(doc, participants, doc.surface, opts)
  if (result.warning && !confirmedOverlap && /overlappe/.test(result.warning)) {
    ui().notify('warning', `${result.warning} Klikk samme knapp en gang til for å gjennomføre.`)
    return false
  }
  if (result.deltas.length === 0) return true
  project().commit((draft) => applyDeltas(draft, result.deltas))
  if (result.warning) ui().notify('warning', result.warning)
  return true
}

export function reorderSelection(op: ZOrderOp): void {
  const { selection } = interaction()
  if (selection.length === 0) return
  project().commit((draft) => reorderEntities(draft, selection, op))
}

export function selectAllOnLevel(): void {
  const { activeGroupId, setSelection } = interaction()
  const doc = project().doc
  const ids = entitiesAtLevel(doc, activeGroupId)
  setSelection(ids, ids[ids.length - 1] ?? null)
}

/** Leave the current group level, selecting the group we came from. */
export function exitGroupLevel(): boolean {
  const { activeGroupId, setActiveGroup, setSelection } = interaction()
  if (!activeGroupId) return false
  const doc = project().doc
  const parent = parentOf(doc, activeGroupId)
  setActiveGroup(parent)
  setSelection([activeGroupId], activeGroupId)
  return true
}

/** True when every selected entity is locked (used for the toolbar toggle). */
export function selectionIsLocked(): boolean {
  const { selection } = interaction()
  if (selection.length === 0) return false
  const doc = project().doc
  return selection.every((id) => isEntityLocked(doc, id))
}

/** Lock the whole selection, or unlock it when it is already fully locked. */
export function toggleSelectionLock(): void {
  const { selection, setSelection, keyId } = interaction()
  if (selection.length === 0) return
  const locking = !selectionIsLocked()
  project().commit((draft) => setEntitiesLocked(draft, selection, locking))
  // Locking a multi-selection would leave a selection the canvas can no longer
  // act on, so it collapses to the key entity — still focused, just not movable.
  if (locking && selection.length > 1) setSelection(keyId ? [keyId] : [], keyId ?? null)
}

export function setTool(tool: 'select' | 'measure'): void {
  interaction().setTool(tool)
}

export function toggleMeasureTool(): void {
  const { tool, setTool: apply } = interaction()
  apply(tool === 'measure' ? 'select' : 'measure')
}

export function deleteGuide(id: string): void {
  project().commit((draft) => removeGuide(draft, id))
  const { activeGuideId, setActiveGuide, setHoverGuide } = interaction()
  if (activeGuideId === id) setActiveGuide(null)
  setHoverGuide(null)
}

/** Remove every guide line. Confirmed first, since it can undo a lot of work. */
export function clearGuides(): void {
  const count = project().doc.guides.length
  if (count === 0) return
  const run = () => {
    project().commit((draft) => void (draft.guides = []))
    const { setActiveGuide, setHoverGuide } = interaction()
    setActiveGuide(null)
    setHoverGuide(null)
  }
  ui().askConfirm({
    title: 'Fjern alle skillelinjer',
    message:
      count === 1
        ? 'Den ene skillelinjen fjernes. Du kan angre etterpå.'
        : `Alle ${count} skillelinjene fjernes. Du kan angre etterpå.`,
    confirmLabel: 'Fjern',
    danger: true,
    onConfirm: run,
  })
}

export function deleteMeasureLine(id: string): void {
  project().commit((draft) => removeMeasureLine(draft, id))
  interaction().setHoverMeasure(null)
}

export function undo(): void {
  project().undo()
}

export function redo(): void {
  project().redo()
}
