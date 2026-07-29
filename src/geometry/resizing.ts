import type { Rect } from './bounds'
import { roundMm } from '@/utils/units'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

export const HANDLE_LABEL: Record<HandleId, string> = {
  nw: 'øvre venstre hjørne',
  n: 'øvre kant',
  ne: 'øvre høyre hjørne',
  e: 'høyre kant',
  se: 'nedre høyre hjørne',
  s: 'nedre kant',
  sw: 'nedre venstre hjørne',
  w: 'venstre kant',
}

/** Minimum size a resize may produce. Prevents zero/negative geometry. */
export const MIN_SIZE_MM = 1

export function movesLeft(h: HandleId): boolean {
  return h === 'nw' || h === 'w' || h === 'sw'
}
export function movesRight(h: HandleId): boolean {
  return h === 'ne' || h === 'e' || h === 'se'
}
export function movesTop(h: HandleId): boolean {
  return h === 'nw' || h === 'n' || h === 'ne'
}
export function movesBottom(h: HandleId): boolean {
  return h === 'sw' || h === 's' || h === 'se'
}
export function isCorner(h: HandleId): boolean {
  return h.length === 2
}

/** Handle position in model space. */
export function handlePoint(rect: Rect, h: HandleId): { x: number; y: number } {
  const x = movesLeft(h) ? rect.x : movesRight(h) ? rect.x + rect.width : rect.x + rect.width / 2
  const y = movesTop(h) ? rect.y : movesBottom(h) ? rect.y + rect.height : rect.y + rect.height / 2
  return { x, y }
}

/** The dimension a ratio-locked resize is driven by; the other is derived. */
export type RatioDriver = 'width' | 'height'

/**
 * Which dimension a ratio-locked corner drag should drive: the one the pointer
 * has travelled furthest along. Dragging mostly vertically therefore adjusts
 * the height and computes the width from it, and vice versa. Everything else
 * (the movement step in particular) then applies to that one dimension.
 */
export function ratioDriverForDrag(dxMm: number, dyMm: number): RatioDriver {
  return Math.abs(dyMm) > Math.abs(dxMm) ? 'height' : 'width'
}

/**
 * Resolve the driving dimension for a ratio-locked resize. Side handles can
 * only change one dimension, so they always drive that one; corners use the
 * caller's choice and otherwise fall back to whichever scale is largest.
 */
function resolveRatioDriver(
  handle: HandleId,
  preferred: RatioDriver | undefined,
  sx: number,
  sy: number,
): RatioDriver {
  if (!isCorner(handle)) return movesLeft(handle) || movesRight(handle) ? 'width' : 'height'
  if (preferred) return preferred
  return Math.abs(sx) >= Math.abs(sy) ? 'width' : 'height'
}

export type ResizeOptions = {
  keepRatio?: boolean
  fromCenter?: boolean
  minMm?: number
  /** Dimension the ratio lock is driven by. Corner handles only. */
  ratioDriver?: RatioDriver
}

/**
 * Resize `start` by dragging `handle` with a model-space delta.
 * Default behaviour keeps the opposite edge/corner fixed and does not lock the
 * aspect ratio. Shift → keep ratio, Alt → scale from the centre.
 */
export function resizeRect(
  start: Rect,
  handle: HandleId,
  dxMm: number,
  dyMm: number,
  options: ResizeOptions = {},
): Rect {
  const { keepRatio = false, fromCenter = false, minMm = MIN_SIZE_MM, ratioDriver } = options
  const x0 = start.x
  const x1 = start.x + start.width
  const y0 = start.y
  const y1 = start.y + start.height
  const cx = start.x + start.width / 2
  const cy = start.y + start.height / 2

  const ml = movesLeft(handle)
  const mr = movesRight(handle)
  const mt = movesTop(handle)
  const mb = movesBottom(handle)

  let nx0 = x0
  let nx1 = x1
  let ny0 = y0
  let ny1 = y1

  if (ml) nx0 = x0 + dxMm
  if (mr) nx1 = x1 + dxMm
  if (mt) ny0 = y0 + dyMm
  if (mb) ny1 = y1 + dyMm
  if (fromCenter) {
    if (ml) nx1 = x1 - dxMm
    if (mr) nx0 = x0 - dxMm
    if (mt) ny1 = y1 - dyMm
    if (mb) ny0 = y0 - dyMm
  }

  let width = nx1 - nx0
  let height = ny1 - ny0

  if (keepRatio && start.width > 0 && start.height > 0) {
    const sx = width / start.width
    const sy = height / start.height
    let s = resolveRatioDriver(handle, ratioDriver, sx, sy) === 'width' ? sx : sy
    if (!Number.isFinite(s)) s = 1
    width = start.width * s
    height = start.height * s
  }

  const minW = Math.max(minMm, 0.0001)
  const minH = Math.max(minMm, 0.0001)
  if (keepRatio && start.width > 0 && start.height > 0) {
    const sMin = Math.max(minW / start.width, minH / start.height)
    const s = Math.max(sMin, Math.max(width / start.width, 0))
    width = start.width * s
    height = start.height * s
  } else {
    width = Math.max(minW, width)
    height = Math.max(minH, height)
  }

  // Re-derive the position from whichever edge stays fixed.
  let outX: number
  let outY: number
  if (fromCenter) {
    outX = cx - width / 2
    outY = cy - height / 2
  } else {
    if (ml) outX = x1 - width
    else if (mr) outX = x0
    else outX = cx - width / 2

    if (mt) outY = y1 - height
    else if (mb) outY = y0
    else outY = cy - height / 2
  }

  return {
    x: roundMm(outX),
    y: roundMm(outY),
    width: roundMm(width),
    height: roundMm(height),
  }
}

export type ScalableGeometry = { x: number; y: number; width: number; height: number }

/**
 * Map a child rectangle from one bounding box to another. Positions and sizes
 * scale relative to the bounding box; normalised anchors are untouched.
 */
export function mapRectBetweenBounds(rect: ScalableGeometry, from: Rect, to: Rect): ScalableGeometry {
  const sx = from.width > 0 ? to.width / from.width : 1
  const sy = from.height > 0 ? to.height / from.height : 1
  return {
    x: roundMm(to.x + (rect.x - from.x) * sx),
    y: roundMm(to.y + (rect.y - from.y) * sy),
    width: roundMm(Math.max(rect.width * sx, 0.0001)),
    height: roundMm(Math.max(rect.height * sy, 0.0001)),
  }
}
