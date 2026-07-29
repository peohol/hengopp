import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import type { MeasureLine } from '@/models/measure'
import {
  distanceToSegment,
  isDrawnMeasure,
  measureLength,
  measureLineAt,
  measureMetrics,
} from '@/geometry/measure-lines'
import { snapPoint, buildSnapTargets } from '@/geometry/snapping'
import { DEFAULT_SURFACE_GRID } from '@/models/grid'
import { addMeasureLine, removeMeasureLine, toggleMeasurePinned } from '@/state/doc-actions'
import { makeObject, makeProject } from './helpers'

const line = (x1: number, y1: number, x2: number, y2: number): MeasureLine => ({
  id: 'm',
  x1Mm: x1,
  y1Mm: y1,
  x2Mm: x2,
  y2Mm: y2,
  pinned: false,
})

describe('measuring line orientation', () => {
  it('classifies a level line and reports its horizontal length', () => {
    const m = measureMetrics(line(100, 200, 400, 200))
    expect(m.orientation).toBe('horizontal')
    expect(m.widthMm).toBe(300)
    expect(measureLength(line(100, 200, 400, 200))).toBe(300)
  })

  it('classifies a plumb line and reports its vertical length', () => {
    const m = measureMetrics(line(100, 200, 100, 650))
    expect(m.orientation).toBe('vertical')
    expect(m.heightMm).toBe(450)
    expect(measureLength(line(100, 200, 100, 650))).toBe(450)
  })

  it('classifies a diagonal and decomposes the vector', () => {
    const m = measureMetrics(line(0, 0, 300, 400))
    expect(m.orientation).toBe('diagonal')
    expect(m.widthMm).toBe(300)
    expect(m.heightMm).toBe(400)
    expect(m.lengthMm).toBe(500)
    // The right-angle corner closes the triangle at the far x, near y.
    expect([m.cornerX, m.cornerY]).toEqual([300, 0])
  })

  it('keeps the classification signed-direction agnostic', () => {
    expect(measureMetrics(line(400, 0, 100, 0)).orientation).toBe('horizontal')
    expect(measureMetrics(line(0, 0, -300, -400)).lengthMm).toBe(500)
  })

  it('treats a hair off level as level, but not a visible slope', () => {
    expect(measureMetrics(line(0, 0, 300, 0.01)).orientation).toBe('horizontal')
    expect(measureMetrics(line(0, 0, 300, 1)).orientation).toBe('diagonal')
  })

  it('does not try to decompose a degenerate line', () => {
    expect(measureMetrics(line(50, 50, 50, 50)).orientation).toBe('horizontal')
  })
})

describe('hit testing a measuring line', () => {
  it('measures the distance to the segment, not the infinite line', () => {
    const l = line(0, 0, 100, 0)
    expect(distanceToSegment(l, 50, 10)).toBe(10)
    // Beyond the end, the distance is to the endpoint itself.
    expect(distanceToSegment(l, 130, 0)).toBe(30)
  })

  it('picks the closest line within the tolerance', () => {
    const lines = [
      { ...line(0, 0, 100, 0), id: 'a' },
      { ...line(0, 30, 100, 30), id: 'b' },
    ]
    expect(measureLineAt(lines, 50, 26, 8)?.id).toBe('b')
    expect(measureLineAt(lines, 50, 15, 8)).toBeNull()
  })

  it('discards a flick that never became a line', () => {
    expect(isDrawnMeasure(line(0, 0, 1, 0), 10)).toBe(false)
    expect(isDrawnMeasure(line(0, 0, 40, 0), 10)).toBe(true)
  })
})

describe('snapping a measuring endpoint', () => {
  const targets = buildSnapTargets({
    surface: { widthMm: 1000, heightMm: 800, color: '#fff' },
    surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
    objects: [makeObject({ id: 'a', xMm: 200, yMm: 300, widthMm: 100, heightMm: 60 })],
    snapToGrid: false,
    snapToObjects: true,
    guides: [{ id: 'g', axis: 'y', posMm: 700, locked: false }],
  })
  const opts = { targets, activateMm: 8, releaseMm: 12, tieMm: 1.5 }

  it('lands on an object corner when both axes snap', () => {
    const snapped = snapPoint({ point: { x: 296, y: 304 }, ...opts })
    expect([snapped.x, snapped.y]).toEqual([300, 300])
  })

  it('lands on an edge midpoint — an edge on one axis, the centre on the other', () => {
    const snapped = snapPoint({ point: { x: 203, y: 328 }, ...opts })
    expect([snapped.x, snapped.y]).toEqual([200, 330])
  })

  it('lands on the anchor point of an object', () => {
    // The default anchor sits at the centre of the object: (250, 330).
    const snapped = snapPoint({ point: { x: 252, y: 333 }, ...opts })
    expect([snapped.x, snapped.y]).toEqual([250, 330])
  })

  it('lands on a guide line', () => {
    const snapped = snapPoint({ point: { x: 500, y: 695 }, ...opts })
    expect(snapped.y).toBe(700)
    expect(snapped.yGuide?.source).toBe('guide')
  })

  it('leaves a point in open space alone', () => {
    const snapped = snapPoint({ point: { x: 512, y: 517 }, ...opts })
    expect([snapped.x, snapped.y]).toEqual([512, 517])
  })
})

describe('measuring line document actions', () => {
  it('adds, pins and removes', () => {
    const project = makeProject()
    let id = ''
    const added = produce(project, (draft) => {
      id = addMeasureLine(draft, { x1Mm: 0, y1Mm: 0, x2Mm: 100, y2Mm: 0, pinned: false })
    })
    expect(added.measureLines).toHaveLength(1)

    const pinned = produce(added, (draft) => toggleMeasurePinned(draft, id))
    expect(pinned.measureLines[0].pinned).toBe(true)
    const unpinned = produce(pinned, (draft) => toggleMeasurePinned(draft, id))
    expect(unpinned.measureLines[0].pinned).toBe(false)

    const removed = produce(added, (draft) => removeMeasureLine(draft, id))
    expect(removed.measureLines).toHaveLength(0)
  })
})
