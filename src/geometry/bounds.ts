import type { SceneObject } from '@/models/object'
import { roundMm } from '@/utils/units'

export type Rect = { x: number; y: number; width: number; height: number }

export function rectOf(o: Pick<SceneObject, 'xMm' | 'yMm' | 'widthMm' | 'heightMm'>): Rect {
  return { x: o.xMm, y: o.yMm, width: o.widthMm, height: o.heightMm }
}

export function right(r: Rect): number {
  return r.x + r.width
}

export function bottom(r: Rect): number {
  return r.y + r.height
}

export function centerX(r: Rect): number {
  return r.x + r.width / 2
}

export function centerY(r: Rect): number {
  return r.y + r.height / 2
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, right(r))
    maxY = Math.max(maxY, bottom(r))
  }
  return { x: roundMm(minX), y: roundMm(minY), width: roundMm(maxX - minX), height: roundMm(maxY - minY) }
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  )
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(right(a) < b.x || right(b) < a.x || bottom(a) < b.y || bottom(b) < a.y)
}

export function normaliseRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

/** Absolute anchor position of an object in model space. */
export function anchorPoint(o: SceneObject): { x: number; y: number } {
  return { x: roundMm(o.xMm + o.anchor.u * o.widthMm), y: roundMm(o.yMm + o.anchor.v * o.heightMm) }
}

/** Point-in-shape test used for hit testing (rect vs ellipse). */
export function shapeContainsPoint(o: SceneObject, px: number, py: number): boolean {
  if (px < o.xMm || px > o.xMm + o.widthMm || py < o.yMm || py > o.yMm + o.heightMm) return false
  if (o.shape === 'rectangle') return true
  const rx = o.widthMm / 2
  const ry = o.heightMm / 2
  const cx = o.xMm + rx
  const cy = o.yMm + ry
  if (rx <= 0 || ry <= 0) return false
  const dx = (px - cx) / rx
  const dy = (py - cy) / ry
  return dx * dx + dy * dy <= 1
}

/**
 * Constrain a normalised anchor to the shape. Rectangles allow the whole box;
 * ellipses project outside points back onto the ellipse boundary, which is more
 * stable than freezing the marker at its last valid position.
 */
export function constrainAnchor(shape: 'rectangle' | 'ellipse', u: number, v: number): { u: number; v: number } {
  const cu = Math.min(1, Math.max(0, u))
  const cv = Math.min(1, Math.max(0, v))
  if (shape === 'rectangle') return { u: cu, v: cv }
  const du = (cu - 0.5) / 0.5
  const dv = (cv - 0.5) / 0.5
  const dist = Math.hypot(du, dv)
  if (dist <= 1 || dist === 0) return { u: cu, v: cv }
  return { u: 0.5 + (du / dist) * 0.5, v: 0.5 + (dv / dist) * 0.5 }
}
