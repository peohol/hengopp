import type { MeasurementSide, SurfaceDefinition } from '@/models/project'
import { type Rect, right, bottom, centerX, centerY } from './bounds'
import { roundMm } from '@/utils/units'

export const MEASUREMENT_SIDES: MeasurementSide[] = ['left', 'right', 'top', 'bottom']

export const MEASUREMENT_SIDE_LABEL: Record<MeasurementSide, string> = {
  left: 'venstre',
  right: 'høyre',
  top: 'topp',
  bottom: 'bunn',
}

export type MeasurementLine = {
  side: MeasurementSide
  distanceMm: number
  /** Start point at the middle of the relevant object side. */
  x1: number
  y1: number
  /** End point on the surface edge, perpendicular to the object side. */
  x2: number
  y2: number
}

/** The four distances from an entity's bounding box to the surface edges. */
export function measurementLines(bounds: Rect, surface: SurfaceDefinition): MeasurementLine[] {
  const cx = centerX(bounds)
  const cy = centerY(bounds)
  return [
    { side: 'left', distanceMm: roundMm(bounds.x), x1: bounds.x, y1: cy, x2: 0, y2: cy },
    {
      side: 'right',
      distanceMm: roundMm(surface.widthMm - right(bounds)),
      x1: right(bounds),
      y1: cy,
      x2: surface.widthMm,
      y2: cy,
    },
    { side: 'top', distanceMm: roundMm(bounds.y), x1: cx, y1: bounds.y, x2: cx, y2: 0 },
    {
      side: 'bottom',
      distanceMm: roundMm(surface.heightMm - bottom(bounds)),
      x1: cx,
      y1: bottom(bounds),
      x2: cx,
      y2: surface.heightMm,
    },
  ]
}

export function measurementLine(
  bounds: Rect,
  surface: SurfaceDefinition,
  side: MeasurementSide,
): MeasurementLine {
  return measurementLines(bounds, surface).find((l) => l.side === side)!
}
