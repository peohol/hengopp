import { roundMm } from '@/utils/units'

/**
 * The viewport maps model millimetres to screen pixels:
 *   screen = model * scale + offset
 * `scale` is px per mm. Zoom never touches model values.
 */
export type Viewport = {
  /** Pixels per millimetre. */
  scale: number
  /** Screen-space offset in pixels. */
  offsetX: number
  offsetY: number
}

export type Point = { x: number; y: number }

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export function modelToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.offsetX, y: p.y * vp.scale + vp.offsetY }
}

export function screenToModel(p: Point, vp: Viewport): Point {
  return { x: roundMm((p.x - vp.offsetX) / vp.scale), y: roundMm((p.y - vp.offsetY) / vp.scale) }
}

export function modelLengthToScreen(lengthMm: number, vp: Viewport): number {
  return lengthMm * vp.scale
}

export function screenLengthToModel(lengthPx: number, vp: Viewport): number {
  return lengthPx / vp.scale
}

export function clampZoom(scale: number, baseScale: number): number {
  const min = baseScale * MIN_ZOOM
  const max = baseScale * MAX_ZOOM
  return Math.min(max, Math.max(min, scale))
}

/** Zoom around a fixed screen point so the model point under it stays put. */
export function zoomAround(vp: Viewport, screenPoint: Point, nextScale: number): Viewport {
  const model = screenToModel(screenPoint, vp)
  return {
    scale: nextScale,
    offsetX: screenPoint.x - model.x * nextScale,
    offsetY: screenPoint.y - model.y * nextScale,
  }
}

export function panBy(vp: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...vp, offsetX: vp.offsetX + dxPx, offsetY: vp.offsetY + dyPx }
}

/** Fit a model-space rectangle into a screen viewport with padding. */
export function fitViewport(
  contentWidthMm: number,
  contentHeightMm: number,
  viewWidthPx: number,
  viewHeightPx: number,
  paddingPx = 48,
): Viewport {
  const availW = Math.max(1, viewWidthPx - paddingPx * 2)
  const availH = Math.max(1, viewHeightPx - paddingPx * 2)
  const scale = Math.min(availW / Math.max(contentWidthMm, 1), availH / Math.max(contentHeightMm, 1))
  return {
    scale,
    offsetX: (viewWidthPx - contentWidthMm * scale) / 2,
    offsetY: (viewHeightPx - contentHeightMm * scale) / 2,
  }
}

/** The "100 %" reference scale: the scale at which the surface fits the view. */
export function zoomPercent(vp: Viewport, baseScale: number): number {
  return (vp.scale / baseScale) * 100
}
