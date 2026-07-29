import type { MeasureLine } from '@/models/measure'
import { roundMm } from '@/utils/units'

/**
 * A measuring line is either level, plumb or diagonal. "Perfect" is judged in
 * model millimetres rather than on screen, so the classification never changes
 * with the zoom level. Snapping produces exact values; the tolerance only
 * absorbs the internal rounding.
 */
export const LEVEL_TOLERANCE_MM = 0.05

export type MeasureOrientation = 'horizontal' | 'vertical' | 'diagonal'

export type MeasureMetrics = {
  orientation: MeasureOrientation
  /** Signed components, from the first point to the second. */
  dxMm: number
  dyMm: number
  /** Absolute component lengths and the straight-line distance. */
  widthMm: number
  heightMm: number
  lengthMm: number
  /** Right-angle corner of the component triangle, for diagonal lines. */
  cornerX: number
  cornerY: number
  midX: number
  midY: number
}

export function measureMetrics(line: MeasureLine): MeasureMetrics {
  const dxMm = roundMm(line.x2Mm - line.x1Mm)
  const dyMm = roundMm(line.y2Mm - line.y1Mm)
  const widthMm = Math.abs(dxMm)
  const heightMm = Math.abs(dyMm)
  const level = heightMm <= LEVEL_TOLERANCE_MM
  const plumb = widthMm <= LEVEL_TOLERANCE_MM
  // A degenerate line (both components ~0) counts as level: there is nothing to
  // decompose, and one length label is the honest thing to show.
  const orientation: MeasureOrientation = level ? 'horizontal' : plumb ? 'vertical' : 'diagonal'
  return {
    orientation,
    dxMm,
    dyMm,
    widthMm,
    heightMm,
    lengthMm: roundMm(Math.hypot(dxMm, dyMm)),
    cornerX: line.x2Mm,
    cornerY: line.y1Mm,
    midX: roundMm((line.x1Mm + line.x2Mm) / 2),
    midY: roundMm((line.y1Mm + line.y2Mm) / 2),
  }
}

/** Length reported for a line: the component along its own direction. */
export function measureLength(line: MeasureLine): number {
  const m = measureMetrics(line)
  if (m.orientation === 'horizontal') return m.widthMm
  if (m.orientation === 'vertical') return m.heightMm
  return m.lengthMm
}

/** Shortest distance from a point to the line segment, in model units. */
export function distanceToSegment(
  line: MeasureLine,
  px: number,
  py: number,
): number {
  const dx = line.x2Mm - line.x1Mm
  const dy = line.y2Mm - line.y1Mm
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - line.x1Mm, py - line.y1Mm)
  let t = ((px - line.x1Mm) * dx + (py - line.y1Mm) * dy) / lengthSq
  t = Math.min(1, Math.max(0, t))
  return Math.hypot(px - (line.x1Mm + t * dx), py - (line.y1Mm + t * dy))
}

/** The measuring line closest to a point, within a tolerance. */
export function measureLineAt(
  lines: MeasureLine[],
  px: number,
  py: number,
  toleranceMm: number,
): MeasureLine | null {
  let best: { line: MeasureLine; d: number } | null = null
  for (const line of lines) {
    const d = distanceToSegment(line, px, py)
    if (d <= toleranceMm && (!best || d < best.d)) best = { line, d }
  }
  return best ? best.line : null
}

/** True once a drag is long enough to be a measurement rather than a stray tap. */
export function isDrawnMeasure(line: MeasureLine, minLengthMm: number): boolean {
  return measureMetrics(line).lengthMm >= minLengthMm
}
