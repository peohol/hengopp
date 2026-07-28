import type { GridAlign, GridDefinition } from '@/models/grid'
import { roundMm } from '@/utils/units'

/** The two golden-section guides, as fractions of the axis length. */
export const GOLDEN_MINOR = 0.3819660112501051
export const GOLDEN_MAJOR = 0.6180339887498949

const EPS = 1e-9
const MAX_LINES = 4000

export const MAX_GRID_COUNT = 500

/**
 * Phase offset for a decimal cell count, expressed as a length.
 *
 * A count of N = whole + fraction over a length L has cell size L / N.
 * The truncated cell is placed by shifting a conceptually infinite regular
 * grid:
 *   start  → phase 0                 (full cells from the start)
 *   center → phase (fraction * cell) / 2  (symmetric truncation)
 *   end    → phase fraction * cell        (full cells towards the end)
 */
export function gridPhase(lengthMm: number, count: number, align: GridAlign): number {
  if (!Number.isFinite(lengthMm) || !Number.isFinite(count) || count < 1) return 0
  const cell = lengthMm / count
  const fraction = count - Math.floor(count)
  if (fraction < EPS) return 0
  switch (align) {
    case 'start':
      return 0
    case 'center':
      return (fraction * cell) / 2
    case 'end':
      return fraction * cell
  }
}

/**
 * Positions (in mm from the axis origin) of every grid line for a regular cell
 * grid, including the lines that coincide with the surface edges.
 */
export function cellGridLines(lengthMm: number, count: number, align: GridAlign): number[] {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return []
  if (!Number.isFinite(count) || count < 1) return []
  const cell = lengthMm / count
  if (cell <= 0) return []
  const phase = gridPhase(lengthMm, count, align)
  const out: number[] = []
  const tol = Math.max(EPS, cell * 1e-9)
  for (let i = 0; i < MAX_LINES; i += 1) {
    const pos = phase + i * cell
    if (pos > lengthMm + tol) break
    if (pos >= -tol) out.push(roundMm(Math.min(lengthMm, Math.max(0, pos))))
  }
  return dedupe(out)
}

export function goldenLines(lengthMm: number): number[] {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return []
  return [roundMm(lengthMm * GOLDEN_MINOR), roundMm(lengthMm * GOLDEN_MAJOR)]
}

function dedupe(values: number[]): number[] {
  const out: number[] = []
  for (const v of values) {
    if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 1e-6) out.push(v)
  }
  return out
}

export type GridLines = {
  /** x positions of vertical lines. */
  vertical: number[]
  /** y positions of horizontal lines. */
  horizontal: number[]
}

/** All grid lines for a grid definition over a width × height area. */
export function gridLines(grid: GridDefinition, widthMm: number, heightMm: number): GridLines {
  if (!grid.enabled) return { vertical: [], horizontal: [] }
  if (grid.mode === 'golden') {
    return { vertical: goldenLines(widthMm), horizontal: goldenLines(heightMm) }
  }
  return {
    vertical: cellGridLines(widthMm, grid.cols, grid.hAlign),
    horizontal: cellGridLines(heightMm, grid.rows, grid.vAlign),
  }
}

/** Grid lines excluding the ones that sit exactly on the outer edges. */
export function interiorGridLines(grid: GridDefinition, widthMm: number, heightMm: number): GridLines {
  const all = gridLines(grid, widthMm, heightMm)
  const strip = (lines: number[], length: number) =>
    lines.filter((v) => v > 1e-6 && v < length - 1e-6)
  return {
    vertical: strip(all.vertical, widthMm),
    horizontal: strip(all.horizontal, heightMm),
  }
}

/** Intersection points of the grid, used for anchor snapping inside an object. */
export function gridIntersections(
  grid: GridDefinition,
  widthMm: number,
  heightMm: number,
): { x: number; y: number }[] {
  const { vertical, horizontal } = gridLines(grid, widthMm, heightMm)
  const xs = vertical.length ? vertical : [0, widthMm]
  const ys = horizontal.length ? horizontal : [0, heightMm]
  const out: { x: number; y: number }[] = []
  for (const x of xs) for (const y of ys) out.push({ x, y })
  return out
}

/** Transposing a grid is meaningless when it would produce the same result. */
export function canTranspose(grid: GridDefinition): boolean {
  if (grid.mode !== 'cells') return false
  return Math.abs(grid.cols - grid.rows) > 1e-9 || grid.hAlign !== grid.vAlign
}

export function transposeGrid(grid: GridDefinition): GridDefinition {
  if (grid.mode !== 'cells') return grid
  return { ...grid, cols: grid.rows, rows: grid.cols, hAlign: grid.vAlign, vAlign: grid.hAlign }
}

/** True when the count produces a truncated cell, i.e. alignment matters. */
export function hasFractionalCells(count: number): boolean {
  return Number.isFinite(count) && count - Math.floor(count) > EPS
}
