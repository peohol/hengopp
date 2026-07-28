import { describe, expect, it } from 'vitest'
import {
  anchorSnapLines,
  anchorSnapThreshold,
  canTranspose,
  cellGridLines,
  GOLDEN_MAJOR,
  GOLDEN_MINOR,
  goldenLines,
  gridLines,
  gridPhase,
  hasFractionalCells,
  interiorGridLines,
  transposeGrid,
} from '@/geometry/grid'
import { DEFAULT_OBJECT_GRID, type GridDefinition } from '@/models/grid'

const approx = (values: number[], expected: number[], tolerance = 1e-6) => {
  expect(values).toHaveLength(expected.length)
  values.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThan(tolerance))
}

describe('integer grids', () => {
  it('splits the length evenly', () => {
    approx(cellGridLines(1000, 4, 'start'), [0, 250, 500, 750, 1000])
    approx(cellGridLines(900, 3, 'start'), [0, 300, 600, 900])
    approx(cellGridLines(500, 1, 'start'), [0, 500])
  })

  it('ignores alignment when there is no truncated cell', () => {
    const start = cellGridLines(1000, 4, 'start')
    approx(cellGridLines(1000, 4, 'center'), start)
    approx(cellGridLines(1000, 4, 'end'), start)
    expect(gridPhase(1000, 4, 'center')).toBe(0)
  })
})

describe('decimal grids (3,5 cells over 700 mm → cell 200 mm)', () => {
  const L = 700
  const N = 3.5

  it('starts from the left: three full cells, half cell at the right', () => {
    expect(gridPhase(L, N, 'start')).toBe(0)
    approx(cellGridLines(L, N, 'start'), [0, 200, 400, 600])
  })

  it('centres: symmetric truncation on both sides', () => {
    expect(gridPhase(L, N, 'center')).toBeCloseTo(50, 9)
    approx(cellGridLines(L, N, 'center'), [50, 250, 450, 650])
    // Cut-offs must be equal at both ends.
    const lines = cellGridLines(L, N, 'center')
    expect(lines[0]).toBeCloseTo(L - lines[lines.length - 1], 9)
  })

  it('starts from the right: half cell at the left, full cells to the right edge', () => {
    expect(gridPhase(L, N, 'end')).toBeCloseTo(100, 9)
    approx(cellGridLines(L, N, 'end'), [100, 300, 500, 700])
  })

  it('applies the same rules vertically', () => {
    const grid: GridDefinition = {
      enabled: true,
      mode: 'cells',
      cols: 2,
      rows: 3.5,
      hAlign: 'start',
      vAlign: 'center',
    }
    const lines = gridLines(grid, 1000, 700)
    approx(lines.vertical, [0, 500, 1000])
    approx(lines.horizontal, [50, 250, 450, 650])

    const fromBottom = gridLines({ ...grid, vAlign: 'end' }, 1000, 700)
    approx(fromBottom.horizontal, [100, 300, 500, 700])
  })

  it('detects fractional counts', () => {
    expect(hasFractionalCells(3.5)).toBe(true)
    expect(hasFractionalCells(4)).toBe(false)
  })
})

describe('transpose', () => {
  const base: GridDefinition = {
    enabled: true,
    mode: 'cells',
    cols: 3,
    rows: 2,
    hAlign: 'start',
    vAlign: 'start',
  }

  it('swaps 3 × 2 to 2 × 3', () => {
    const t = transposeGrid(base)
    expect(t.cols).toBe(2)
    expect(t.rows).toBe(3)
  })

  it('swaps 10 × 3,5 to 3,5 × 10 including alignment', () => {
    const t = transposeGrid({ ...base, cols: 10, rows: 3.5, hAlign: 'center', vAlign: 'end' })
    expect(t.cols).toBe(3.5)
    expect(t.rows).toBe(10)
    expect(t.hAlign).toBe('end')
    expect(t.vAlign).toBe('center')
  })

  it('is disabled when it would have no practical effect', () => {
    expect(canTranspose({ ...base, cols: 4, rows: 4 })).toBe(false)
    expect(canTranspose({ ...base, cols: 4, rows: 4, hAlign: 'center' })).toBe(true)
    expect(canTranspose(base)).toBe(true)
    expect(canTranspose({ ...base, mode: 'golden' })).toBe(false)
  })
})

describe('golden section', () => {
  it('places guides at ~38,1966 % and ~61,8034 %', () => {
    expect(GOLDEN_MINOR).toBeCloseTo(0.381966, 6)
    expect(GOLDEN_MAJOR).toBeCloseTo(0.618034, 6)
    approx(goldenLines(1000), [381.966, 618.0339], 0.001)
  })

  it('is used for both axes when the mode is golden', () => {
    const grid: GridDefinition = {
      enabled: true,
      mode: 'golden',
      cols: 3,
      rows: 2,
      hAlign: 'start',
      vAlign: 'start',
    }
    const lines = gridLines(grid, 1000, 500)
    expect(lines.vertical).toHaveLength(2)
    expect(lines.horizontal).toHaveLength(2)
    expect(lines.horizontal[0]).toBeCloseTo(190.983, 3)
  })
})

describe('rendering helpers', () => {
  it('omits lines that sit on the outer edges', () => {
    const grid: GridDefinition = {
      enabled: true,
      mode: 'cells',
      cols: 4,
      rows: 2,
      hAlign: 'start',
      vAlign: 'start',
    }
    const lines = interiorGridLines(grid, 1000, 800)
    approx(lines.vertical, [250, 500, 750])
    approx(lines.horizontal, [400])
  })

  it('returns nothing when the grid is disabled', () => {
    const lines = gridLines(
      { enabled: false, mode: 'cells', cols: 4, rows: 4, hAlign: 'start', vAlign: 'start' },
      1000,
      800,
    )
    expect(lines.vertical).toEqual([])
    expect(lines.horizontal).toEqual([])
  })
})

describe('anchor snap lines', () => {
  it('always offers the edges and the centre, even without a grid', () => {
    const off: GridDefinition = { ...DEFAULT_OBJECT_GRID, enabled: false }
    expect(anchorSnapLines(off, 400, 300)).toEqual({ x: [0, 200, 400], y: [0, 150, 300] })
  })

  it('adds the grid lines and keeps every value unique and sorted', () => {
    const grid: GridDefinition = { ...DEFAULT_OBJECT_GRID, enabled: true, mode: 'cells', cols: 4, rows: 2 }
    const lines = anchorSnapLines(grid, 400, 300)
    // 4 columns → 0, 100, 200, 300, 400. The centre (200) is already a grid line.
    expect(lines.x).toEqual([0, 100, 200, 300, 400])
    // 2 rows → 0, 150, 300, which is exactly edges + centre.
    expect(lines.y).toEqual([0, 150, 300])
  })

  it('keeps the centre when the grid has no line there', () => {
    const grid: GridDefinition = { ...DEFAULT_OBJECT_GRID, enabled: true, mode: 'cells', cols: 3, rows: 3 }
    const lines = anchorSnapLines(grid, 300, 300)
    expect(lines.x).toEqual([0, 100, 150, 200, 300])
  })

  it('works for the golden-section grid', () => {
    const grid: GridDefinition = { ...DEFAULT_OBJECT_GRID, enabled: true, mode: 'golden' }
    const lines = anchorSnapLines(grid, 1000, 1000)
    expect(lines.x[0]).toBe(0)
    expect(lines.x[lines.x.length - 1]).toBe(1000)
    expect(lines.x).toContain(500)
    expect(lines.x.some((v) => Math.abs(v - 381.966) < 0.01)).toBe(true)
  })

  it('returns nothing for a degenerate size', () => {
    expect(anchorSnapLines(DEFAULT_OBJECT_GRID, 0, -5)).toEqual({ x: [], y: [] })
  })
})

describe('anchor snap threshold', () => {
  it('uses the full threshold when the lines are far apart', () => {
    // 0, 500, 1000 at 1 px/mm → gaps of 500 px.
    expect(anchorSnapThreshold([0, 500, 1000], 1, 10)).toBe(10)
  })

  it('shrinks so a free band always remains between neighbours', () => {
    // Four lines over 60 px → 20 px gaps. A fixed 10 px threshold would cover
    // every position from both sides; a third of the gap leaves room.
    const threshold = anchorSnapThreshold([0, 20, 40, 60], 1, 10)
    expect(threshold).toBeCloseTo(20 / 3, 6)
    expect(threshold * 2).toBeLessThan(20)
  })

  it('follows the zoom of the preview', () => {
    expect(anchorSnapThreshold([0, 20, 40], 0.5, 10)).toBeCloseTo(10 / 3, 6)
  })

  it('falls back to the maximum for a single line or none', () => {
    expect(anchorSnapThreshold([100], 1, 10)).toBe(10)
    expect(anchorSnapThreshold([], 1, 10)).toBe(10)
  })
})
