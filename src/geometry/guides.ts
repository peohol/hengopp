import type { GuideAxis, GuideLine, GuideOrigin } from '@/models/guide'
import type { SurfaceDefinition } from '@/models/project'
import { snapAxis, type SnapGuide, type SnapTargets } from './snapping'
import { roundMm, roundToStep } from '@/utils/units'

/** The surface length a guide of this axis lives along. */
export function surfaceExtentFor(surface: SurfaceDefinition, axis: GuideAxis): number {
  return axis === 'x' ? surface.widthMm : surface.heightMm
}

/** Guides never leave the surface — outside it they could not be reached again. */
export function clampGuidePos(posMm: number, sizeMm: number): number {
  if (!Number.isFinite(posMm)) return 0
  return roundMm(Math.min(Math.max(posMm, 0), Math.max(sizeMm, 0)))
}

/**
 * Convert between the stored position (always measured from the surface origin)
 * and a position measured from either edge, which is what the exact-position
 * popover offers.
 */
export function guideValueFromOrigin(posMm: number, origin: GuideOrigin, sizeMm: number): number {
  return roundMm(origin === 'start' ? posMm : sizeMm - posMm)
}

export function guidePosFromOrigin(value: number, origin: GuideOrigin, sizeMm: number): number {
  return clampGuidePos(origin === 'start' ? value : sizeMm - value, sizeMm)
}

export type GuideDragInput = {
  axis: GuideAxis
  /** Raw model position under the pointer. */
  posMm: number
  sizeMm: number
  /** The user's movement step; guide drags land on it, just like arrow keys. */
  stepMm: number
  targets: SnapTargets
  snappingOn: boolean
  activateMm: number
  releaseMm: number
  tieMm: number
  previousKey?: string
}

export type GuideDragResult = {
  posMm: number
  key?: string
  guide?: SnapGuide
}

/**
 * Where a dragged guide lands.
 *
 * The step quantisation is the baseline, so a guide dropped in open space sits
 * on a round value. Snapping to objects, other guides and the grid wins over it
 * — otherwise a guide could never be placed exactly on an object edge that does
 * not happen to be a multiple of the step.
 */
export function resolveGuideDrag(input: GuideDragInput): GuideDragResult {
  const stepped = clampGuidePos(roundToStep(input.posMm, input.stepMm), input.sizeMm)
  if (!input.snappingOn) return { posMm: stepped }

  const targets = input.axis === 'x' ? input.targets.x : input.targets.y
  const snap = snapAxis([{ pos: input.posMm, kind: 'edge-start' }], targets, {
    activateMm: input.activateMm,
    releaseMm: input.releaseMm,
    tieMm: input.tieMm,
    previousKey: input.previousKey,
  })
  if (!snap) return { posMm: stepped }

  const snapped = clampGuidePos(roundMm(input.posMm + snap.delta), input.sizeMm)
  return {
    posMm: snapped,
    key: snap.key,
    guide: {
      axis: input.axis,
      pos: snapped,
      from: snap.target.extent?.[0] ?? 0,
      to: snap.target.extent?.[1] ?? 0,
      source: snap.target.source,
      targetKind: snap.target.kind,
      movingKind: 'guide',
    },
  }
}

/** Guides sorted for display: by axis, then position. Stable and predictable. */
export function sortedGuides(guides: GuideLine[]): GuideLine[] {
  return [...guides].sort((a, b) => (a.axis === b.axis ? a.posMm - b.posMm : a.axis < b.axis ? -1 : 1))
}
