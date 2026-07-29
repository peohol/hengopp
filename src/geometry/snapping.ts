import type { SceneObject } from '@/models/object'
import type { GridDefinition } from '@/models/grid'
import type { GuideLine } from '@/models/guide'
import type { SurfaceDefinition } from '@/models/project'
import { type Rect, right, bottom, centerX, centerY, anchorPoint } from './bounds'
import { gridLines } from './grid'
import { roundMm } from '@/utils/units'

export type Axis = 'x' | 'y'

export type SnapKind = 'edge-start' | 'center' | 'anchor' | 'edge-end' | 'grid' | 'guide'
export type SnapSource = 'surface' | 'object' | 'grid' | 'guide'

export type SnapCandidate = { pos: number; kind: SnapKind }

export type SnapTarget = {
  pos: number
  kind: SnapKind
  source: SnapSource
  refId?: string
  /** Perpendicular extent of the target, used to size the guide line. */
  extent?: [number, number]
}

export type SnapGuide = {
  axis: Axis
  /** Model coordinate of the guide line along `axis`. */
  pos: number
  /** Perpendicular extent of the drawn guide. */
  from: number
  to: number
  source: SnapSource
  targetKind: SnapKind
  movingKind: SnapKind
}

export type SnapResult = {
  deltaXMm: number
  deltaYMm: number
  xGuide?: SnapGuide
  yGuide?: SnapGuide
  /** Stable identifiers of the active snaps, fed back in for hysteresis. */
  xKey?: string
  yKey?: string
}

export type SnapTargets = { x: SnapTarget[]; y: SnapTarget[] }

/** Screen-pixel thresholds. Converted to model units via the current scale. */
export const SNAP_ACTIVATE_PX = 8
export const SNAP_RELEASE_PX = 12
/** Distances closer than this (in px) count as "practically equal". */
export const SNAP_TIE_PX = 1.5

const isEdge = (k: SnapKind) => k === 'edge-start' || k === 'edge-end'

/**
 * Semantic priority (lower is better) used only to break real or near ties.
 * It never overrides a candidate that is noticeably closer.
 */
export function pairPriority(moving: SnapKind, target: SnapKind, source: SnapSource): number {
  if (source === 'grid') return 6
  // A guide is placed deliberately by the user, so it beats the surface grid on
  // a tie, but never an explicit object-to-object relation.
  if (source === 'guide') return 5.5
  if (moving === 'anchor' && target === 'anchor') return 1
  if (isEdge(moving) && isEdge(target) && moving === target) return 2
  if (moving === 'center' && target === 'center') return 3
  if (moving === 'anchor' || target === 'anchor') return 4
  return 5
}

export function targetKey(t: SnapTarget, movingKind: SnapKind): string {
  return `${movingKind}|${t.source}|${t.refId ?? ''}|${t.kind}|${t.pos.toFixed(4)}`
}

export type AxisSnapOptions = {
  activateMm: number
  releaseMm: number
  tieMm: number
  /** Key of the snap that was active on the previous frame. */
  previousKey?: string
}

export type AxisSnap = {
  delta: number
  key: string
  target: SnapTarget
  movingKind: SnapKind
  distance: number
}

/**
 * Choose the best snap along one axis. Returns the delta that must be added to
 * the moving geometry to land on the target.
 */
export function snapAxis(
  candidates: SnapCandidate[],
  targets: SnapTarget[],
  opts: AxisSnapOptions,
): AxisSnap | null {
  if (candidates.length === 0 || targets.length === 0) return null

  type Pair = AxisSnap & { priority: number }
  const pairs: Pair[] = []
  let previous: Pair | null = null

  for (const c of candidates) {
    for (const t of targets) {
      const delta = roundMm(t.pos - c.pos)
      const distance = Math.abs(delta)
      const key = targetKey(t, c.kind)
      const pair: Pair = {
        delta,
        key,
        target: t,
        movingKind: c.kind,
        distance,
        priority: pairPriority(c.kind, t.kind, t.source),
      }
      if (distance <= opts.activateMm) pairs.push(pair)
      if (opts.previousKey && key === opts.previousKey && distance <= opts.releaseMm) {
        if (!previous || distance < previous.distance) previous = pair
      }
    }
  }

  if (pairs.length === 0) return previous

  let best = pairs[0]
  for (const p of pairs) {
    if (p.distance < best.distance - opts.tieMm) {
      best = p
    } else if (Math.abs(p.distance - best.distance) <= opts.tieMm) {
      if (p.priority < best.priority || (p.priority === best.priority && p.distance < best.distance)) {
        best = p
      }
    }
  }

  // Hysteresis: keep the existing snap unless a clearly better one shows up.
  if (previous && previous.key !== best.key && !(best.distance < previous.distance - opts.tieMm)) {
    return previous
  }
  return best
}

export type SnapInput = {
  xCandidates: SnapCandidate[]
  yCandidates: SnapCandidate[]
  targets: SnapTargets
  /** Perpendicular extent of the moving geometry, for guide sizing. */
  movingYExtent: [number, number]
  movingXExtent: [number, number]
  activateMm: number
  releaseMm: number
  tieMm: number
  previousXKey?: string
  previousYKey?: string
  /** Extra margin added to each end of a guide, in model units. */
  guideMarginMm?: number
}

export function computeSnap(input: SnapInput): SnapResult {
  const opts = { activateMm: input.activateMm, releaseMm: input.releaseMm, tieMm: input.tieMm }
  const x = snapAxis(input.xCandidates, input.targets.x, { ...opts, previousKey: input.previousXKey })
  const y = snapAxis(input.yCandidates, input.targets.y, { ...opts, previousKey: input.previousYKey })
  const margin = input.guideMarginMm ?? 0

  const result: SnapResult = { deltaXMm: x?.delta ?? 0, deltaYMm: y?.delta ?? 0 }

  if (x) {
    const extent = mergeExtent(shiftExtent(input.movingYExtent, y?.delta ?? 0), x.target.extent)
    result.xGuide = {
      axis: 'x',
      pos: x.target.pos,
      from: extent[0] - margin,
      to: extent[1] + margin,
      source: x.target.source,
      targetKind: x.target.kind,
      movingKind: x.movingKind,
    }
    result.xKey = x.key
  }
  if (y) {
    const extent = mergeExtent(shiftExtent(input.movingXExtent, x?.delta ?? 0), y.target.extent)
    result.yGuide = {
      axis: 'y',
      pos: y.target.pos,
      from: extent[0] - margin,
      to: extent[1] + margin,
      source: y.target.source,
      targetKind: y.target.kind,
      movingKind: y.movingKind,
    }
    result.yKey = y.key
  }
  return result
}

function shiftExtent(e: [number, number], delta: number): [number, number] {
  return [e[0] + delta, e[1] + delta]
}

function mergeExtent(a: [number, number], b?: [number, number]): [number, number] {
  if (!b) return a
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])]
}

/** Snap candidates produced by a moving rectangle (plus optional anchor). */
export function rectSnapCandidates(
  rect: Rect,
  anchor?: { x: number; y: number } | null,
): { x: SnapCandidate[]; y: SnapCandidate[] } {
  const x: SnapCandidate[] = [
    { pos: rect.x, kind: 'edge-start' },
    { pos: centerX(rect), kind: 'center' },
    { pos: right(rect), kind: 'edge-end' },
  ]
  const y: SnapCandidate[] = [
    { pos: rect.y, kind: 'edge-start' },
    { pos: centerY(rect), kind: 'center' },
    { pos: bottom(rect), kind: 'edge-end' },
  ]
  if (anchor) {
    x.push({ pos: anchor.x, kind: 'anchor' })
    y.push({ pos: anchor.y, kind: 'anchor' })
  }
  return { x, y }
}

export type BuildTargetsInput = {
  surface: SurfaceDefinition
  surfaceGrid: GridDefinition
  /** Objects that may be snapped to (moving objects must already be excluded). */
  objects: SceneObject[]
  snapToGrid: boolean
  snapToObjects: boolean
  /** Guide lines. They are always snapped to — placing one is the whole point. */
  guides?: GuideLine[]
  /** Guide excluded from the targets, e.g. the one currently being dragged. */
  excludeGuideId?: string
}

/** Build every snap target for the current document state. */
export function buildSnapTargets(input: BuildTargetsInput): SnapTargets {
  const x: SnapTarget[] = []
  const y: SnapTarget[] = []
  const { widthMm, heightMm } = input.surface
  const fullY: [number, number] = [0, heightMm]
  const fullX: [number, number] = [0, widthMm]

  if (input.snapToObjects) {
    x.push(
      { pos: 0, kind: 'edge-start', source: 'surface', refId: 'surface', extent: fullY },
      { pos: roundMm(widthMm / 2), kind: 'center', source: 'surface', refId: 'surface', extent: fullY },
      { pos: widthMm, kind: 'edge-end', source: 'surface', refId: 'surface', extent: fullY },
    )
    y.push(
      { pos: 0, kind: 'edge-start', source: 'surface', refId: 'surface', extent: fullX },
      { pos: roundMm(heightMm / 2), kind: 'center', source: 'surface', refId: 'surface', extent: fullX },
      { pos: heightMm, kind: 'edge-end', source: 'surface', refId: 'surface', extent: fullX },
    )

    for (const o of input.objects) {
      const r: Rect = { x: o.xMm, y: o.yMm, width: o.widthMm, height: o.heightMm }
      const a = anchorPoint(o)
      const ext: [number, number] = [r.y, bottom(r)]
      const extX: [number, number] = [r.x, right(r)]
      x.push(
        { pos: r.x, kind: 'edge-start', source: 'object', refId: o.id, extent: ext },
        { pos: roundMm(centerX(r)), kind: 'center', source: 'object', refId: o.id, extent: ext },
        { pos: a.x, kind: 'anchor', source: 'object', refId: o.id, extent: ext },
        { pos: right(r), kind: 'edge-end', source: 'object', refId: o.id, extent: ext },
      )
      y.push(
        { pos: r.y, kind: 'edge-start', source: 'object', refId: o.id, extent: extX },
        { pos: roundMm(centerY(r)), kind: 'center', source: 'object', refId: o.id, extent: extX },
        { pos: a.y, kind: 'anchor', source: 'object', refId: o.id, extent: extX },
        { pos: bottom(r), kind: 'edge-end', source: 'object', refId: o.id, extent: extX },
      )
    }
  }

  if (input.snapToGrid && input.surfaceGrid.enabled) {
    const lines = gridLines(input.surfaceGrid, widthMm, heightMm)
    for (const pos of lines.vertical) {
      x.push({ pos, kind: 'grid', source: 'grid', refId: `gx${pos}`, extent: fullY })
    }
    for (const pos of lines.horizontal) {
      y.push({ pos, kind: 'grid', source: 'grid', refId: `gy${pos}`, extent: fullX })
    }
  }

  for (const guide of input.guides ?? []) {
    if (guide.id === input.excludeGuideId) continue
    const target: SnapTarget = {
      pos: guide.posMm,
      kind: 'guide',
      source: 'guide',
      refId: guide.id,
      extent: guide.axis === 'x' ? fullY : fullX,
    }
    if (guide.axis === 'x') x.push(target)
    else y.push(target)
  }

  return { x, y }
}

/**
 * Build targets for a document while excluding the objects that are moving
 * (and, implicitly, every descendant of a moving group — the caller passes the
 * resolved object ids).
 */
export function buildSnapTargetsForDocument(
  doc: {
    surface: SurfaceDefinition
    surfaceGrid: GridDefinition
    objects: Record<string, SceneObject>
    guides?: GuideLine[]
    settings: { snapToGrid: boolean; snapToObjects: boolean }
  },
  movingObjectIds: string[],
  options: { excludeGuideId?: string } = {},
): SnapTargets {
  const excluded = new Set(movingObjectIds)
  return buildSnapTargets({
    surface: doc.surface,
    surfaceGrid: doc.surfaceGrid,
    objects: Object.values(doc.objects).filter((o) => !excluded.has(o.id)),
    snapToGrid: doc.settings.snapToGrid,
    snapToObjects: doc.settings.snapToObjects,
    guides: doc.guides,
    excludeGuideId: options.excludeGuideId,
  })
}

/**
 * Snap a single free point (a measuring-line endpoint, a guide position) to the
 * targets. Each axis is decided on its own, exactly as for a moving rectangle,
 * so a point can land on an intersection, slide along one line, or stay free.
 */
export type PointSnapInput = {
  point: { x: number; y: number }
  targets: SnapTargets
  activateMm: number
  releaseMm: number
  tieMm: number
  previousXKey?: string
  previousYKey?: string
  /** Perpendicular extent used to size the drawn guide lines. */
  xExtent?: [number, number]
  yExtent?: [number, number]
  guideMarginMm?: number
}

export function snapPoint(input: PointSnapInput): SnapResult & { x: number; y: number } {
  const result = computeSnap({
    xCandidates: [{ pos: input.point.x, kind: 'edge-start' }],
    yCandidates: [{ pos: input.point.y, kind: 'edge-start' }],
    targets: input.targets,
    movingXExtent: input.xExtent ?? [input.point.x, input.point.x],
    movingYExtent: input.yExtent ?? [input.point.y, input.point.y],
    activateMm: input.activateMm,
    releaseMm: input.releaseMm,
    tieMm: input.tieMm,
    previousXKey: input.previousXKey,
    previousYKey: input.previousYKey,
    guideMarginMm: input.guideMarginMm,
  })
  return {
    ...result,
    x: roundMm(input.point.x + result.deltaXMm),
    y: roundMm(input.point.y + result.deltaYMm),
  }
}

/** Snapping is on when at least one mode is enabled and Alt is not held. */
export function snappingEnabled(
  settings: { snapToGrid: boolean; snapToObjects: boolean },
  altHeld: boolean,
): boolean {
  return (settings.snapToGrid || settings.snapToObjects) && !altHeld
}

/** Snap candidates for a resize: only the edges the user actually drags. */
export function resizeSnapCandidates(
  rect: Rect,
  opts: { left: boolean; right: boolean; top: boolean; bottom: boolean },
): { x: SnapCandidate[]; y: SnapCandidate[] } {
  const x: SnapCandidate[] = []
  const y: SnapCandidate[] = []
  if (opts.left) x.push({ pos: rect.x, kind: 'edge-start' })
  if (opts.right) x.push({ pos: right(rect), kind: 'edge-end' })
  if (opts.top) y.push({ pos: rect.y, kind: 'edge-start' })
  if (opts.bottom) y.push({ pos: bottom(rect), kind: 'edge-end' })
  return { x, y }
}
