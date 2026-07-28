import type { SurfaceDefinition } from '@/models/project'
import { right, bottom, centerX, centerY } from './bounds'
import { type SceneGraph, entityBounds, entityAnchorPoint } from './groups'
import { roundMm } from '@/utils/units'

export type AlignAxis = 'x' | 'y'
/** `start` = left/top, `end` = right/bottom, `center` = centred on the axis. */
export type AlignMode = 'start' | 'center' | 'end'
/** What the objects are aligned against. */
export type AlignReference = 'surface' | 'key'
/** What "centred" means for an entity: its bounding box or its anchor point. */
export type AlignCenterBasis = 'bounds' | 'anchor'

export type AlignOptions = {
  axis: AlignAxis
  mode: AlignMode
  reference: AlignReference
  centerBasis: AlignCenterBasis
  /** The key entity (last selected). Only used when reference === 'key'. */
  keyId?: string | null
}

export type AlignDelta = { id: string; dx: number; dy: number }

/** Minimum number of selected entities for an alignment to make sense. */
export function minimumEntities(reference: AlignReference): number {
  return reference === 'key' ? 2 : 1
}

type Span = { start: number; end: number; center: number; anchor: number }

function spanOf(graph: SceneGraph, id: string, axis: AlignAxis): Span | null {
  const bounds = entityBounds(graph, id)
  const anchor = entityAnchorPoint(graph, id)
  if (!bounds || !anchor) return null
  return axis === 'x'
    ? { start: bounds.x, end: right(bounds), center: centerX(bounds), anchor: anchor.x }
    : { start: bounds.y, end: bottom(bounds), center: centerY(bounds), anchor: anchor.y }
}

function pointOf(span: Span, mode: AlignMode, basis: AlignCenterBasis): number {
  if (mode === 'start') return span.start
  if (mode === 'end') return span.end
  return basis === 'anchor' ? span.anchor : span.center
}

/**
 * Align a selection along one axis only. The other axis is never touched, so
 * horizontal and vertical alignment are independent operations: aligning left
 * keeps every y-position exactly as it was.
 *
 * With `reference: 'surface'` every entity is placed relative to the surface.
 * With `reference: 'key'` the key entity stays put and the others move to it.
 */
export function computeAlignment(
  graph: SceneGraph,
  entityIds: string[],
  surface: SurfaceDefinition,
  opts: AlignOptions,
): AlignDelta[] {
  const { axis, mode, reference, centerBasis } = opts
  if (entityIds.length < minimumEntities(reference)) return []

  let target: number
  let fixedId: string | null = null

  if (reference === 'key') {
    const keyId = opts.keyId ?? null
    if (!keyId || !entityIds.includes(keyId)) return []
    const keySpan = spanOf(graph, keyId, axis)
    if (!keySpan) return []
    target = pointOf(keySpan, mode, centerBasis)
    fixedId = keyId
  } else {
    const size = axis === 'x' ? surface.widthMm : surface.heightMm
    target = mode === 'start' ? 0 : mode === 'end' ? size : size / 2
  }

  const out: AlignDelta[] = []
  for (const id of entityIds) {
    if (id === fixedId) continue
    const span = spanOf(graph, id, axis)
    if (!span) continue
    const d = roundMm(target - pointOf(span, mode, centerBasis))
    if (d === 0) continue
    out.push(axis === 'x' ? { id, dx: d, dy: 0 } : { id, dx: 0, dy: d })
  }
  return out
}
