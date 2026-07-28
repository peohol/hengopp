import type { SurfaceDefinition } from '@/models/project'
import { right, bottom, type Rect } from './bounds'
import { type SceneGraph, entityBounds, entityAnchorPoint } from './groups'
import { roundMm } from '@/utils/units'

export type DistributeAxis = 'x' | 'y'
export type DistributeReference = 'selection' | 'surface'
export type DistributeTarget = 'edges' | 'anchors'

export type DistributeOptions = {
  axis: DistributeAxis
  reference: DistributeReference
  target: DistributeTarget
  /** Only meaningful when reference === 'surface'. */
  outerGap: boolean
}

export type DistributeDelta = { id: string; dx: number; dy: number }

export type DistributeResult = {
  deltas: DistributeDelta[]
  /** Set when the result forces overlapping objects. */
  warning?: string
}

type Item = {
  id: string
  bounds: Rect
  anchor: { x: number; y: number }
}

function collect(graph: SceneGraph, ids: string[]): Item[] {
  const out: Item[] = []
  for (const id of ids) {
    const bounds = entityBounds(graph, id)
    const anchor = entityAnchorPoint(graph, id)
    if (bounds && anchor) out.push({ id, bounds, anchor })
  }
  return out
}

const startOf = (i: Item, axis: DistributeAxis) => (axis === 'x' ? i.bounds.x : i.bounds.y)
const endOf = (i: Item, axis: DistributeAxis) => (axis === 'x' ? right(i.bounds) : bottom(i.bounds))
const sizeOf = (i: Item, axis: DistributeAxis) => (axis === 'x' ? i.bounds.width : i.bounds.height)
const anchorOf = (i: Item, axis: DistributeAxis) => (axis === 'x' ? i.anchor.x : i.anchor.y)

function sortBy(items: Item[], get: (i: Item) => number): Item[] {
  return [...items].sort((a, b) => get(a) - get(b) || a.id.localeCompare(b.id))
}

function delta(id: string, axis: DistributeAxis, value: number): DistributeDelta {
  return axis === 'x' ? { id, dx: roundMm(value), dy: 0 } : { id, dx: 0, dy: roundMm(value) }
}

/** Minimum number of selected entities for a distribution to make sense. */
export function minimumEntities(opts: Pick<DistributeOptions, 'reference' | 'outerGap'>): number {
  if (opts.reference === 'surface') return opts.outerGap ? 1 : 2
  return 3
}

export function computeDistribution(
  graph: SceneGraph,
  entityIds: string[],
  surface: SurfaceDefinition,
  opts: DistributeOptions,
): DistributeResult {
  const items = collect(graph, entityIds)
  if (items.length < minimumEntities(opts)) return { deltas: [] }

  const axis = opts.axis
  const surfaceSize = axis === 'x' ? surface.widthMm : surface.heightMm

  if (opts.target === 'edges') {
    const sorted = sortBy(items, (i) => startOf(i, axis))
    const sumSizes = sorted.reduce((acc, i) => acc + sizeOf(i, axis), 0)

    let gap: number
    let cursor: number
    if (opts.reference === 'selection') {
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const span = endOf(last, axis) - startOf(first, axis)
      gap = (span - sumSizes) / (sorted.length - 1)
      cursor = startOf(first, axis)
    } else if (opts.outerGap) {
      gap = (surfaceSize - sumSizes) / (sorted.length + 1)
      cursor = gap
    } else {
      gap = sorted.length > 1 ? (surfaceSize - sumSizes) / (sorted.length - 1) : 0
      cursor = 0
    }

    const deltas: DistributeDelta[] = []
    for (const item of sorted) {
      const next = cursor
      const d = next - startOf(item, axis)
      if (Math.abs(d) > 1e-6) deltas.push(delta(item.id, axis, d))
      cursor = next + sizeOf(item, axis) + gap
    }
    return {
      deltas,
      warning: gap < -1e-6 ? 'Objektene får ikke plass. Resultatet vil overlappe.' : undefined,
    }
  }

  // Anchor-based distribution.
  const sorted = sortBy(items, (i) => anchorOf(i, axis))
  const n = sorted.length
  const lowOffset = (i: Item) => anchorOf(i, axis) - startOf(i, axis)
  const highOffset = (i: Item) => endOf(i, axis) - anchorOf(i, axis)

  let positions: number[]
  if (opts.reference === 'selection') {
    const first = anchorOf(sorted[0], axis)
    const last = anchorOf(sorted[n - 1], axis)
    const step = (last - first) / (n - 1)
    positions = sorted.map((_, idx) => first + idx * step)
  } else if (opts.outerGap) {
    positions = sorted.map((_, idx) => (surfaceSize * (idx + 1)) / (n + 1))
  } else {
    const lo = lowOffset(sorted[0])
    const hi = surfaceSize - highOffset(sorted[n - 1])
    const step = n > 1 ? (hi - lo) / (n - 1) : 0
    positions = sorted.map((_, idx) => lo + idx * step)
  }

  // Keep objects on the surface where possible without breaking the ordering.
  let overflow = false
  positions = positions.map((p, idx) => {
    const item = sorted[idx]
    const min = lowOffset(item)
    const max = surfaceSize - highOffset(item)
    if (min > max) {
      overflow = true
      return p
    }
    const clamped = Math.min(max, Math.max(min, p))
    if (Math.abs(clamped - p) > 1e-6) overflow = true
    return clamped
  })

  const deltas: DistributeDelta[] = []
  for (let idx = 0; idx < n; idx += 1) {
    const d = positions[idx] - anchorOf(sorted[idx], axis)
    if (Math.abs(d) > 1e-6) deltas.push(delta(sorted[idx].id, axis, d))
  }

  let warning: string | undefined
  for (let idx = 1; idx < n; idx += 1) {
    if (positions[idx] - positions[idx - 1] < -1e-6) {
      warning = 'Objektene får ikke plass. Resultatet vil overlappe.'
      break
    }
  }
  if (!warning && overflow && opts.reference === 'surface') {
    warning = 'Noen objekter måtte justeres for å holde seg innenfor flaten.'
  }
  return { deltas, warning }
}
