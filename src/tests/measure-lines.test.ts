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
import {
  attachmentFromSnap,
  previewAttachedMeasureLine,
  syncMeasureAttachments,
} from '@/geometry/measure-attachments'
import { DEFAULT_SURFACE_GRID } from '@/models/grid'
import {
  addMeasureLine,
  removeMeasureLine,
  setMeasureEndpoint,
  toggleMeasurePinned,
} from '@/state/doc-actions'
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

describe('snapping to other measuring lines', () => {
  it('offers the endpoints of existing lines as targets', () => {
    const targets = buildSnapTargets({
      surface: { widthMm: 1000, heightMm: 800, color: '#fff' },
      surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
      objects: [],
      snapToGrid: false,
      snapToObjects: false,
      measureLines: [{ id: 'm1', x1Mm: 120, y1Mm: 340, x2Mm: 600, y2Mm: 340, pinned: false }],
    })
    const snapped = snapPoint({ point: { x: 124, y: 337 }, targets, activateMm: 8, releaseMm: 12, tieMm: 1.5 })
    expect([snapped.x, snapped.y]).toEqual([120, 340])
    expect(snapped.xGuide?.source).toBe('measure')
  })

  it('excludes the line being edited, so an end never snaps to itself', () => {
    const targets = buildSnapTargets({
      surface: { widthMm: 1000, heightMm: 800, color: '#fff' },
      surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
      objects: [],
      snapToGrid: false,
      snapToObjects: false,
      measureLines: [{ id: 'm1', x1Mm: 120, y1Mm: 340, x2Mm: 600, y2Mm: 340, pinned: false }],
      excludeMeasureId: 'm1',
    })
    expect(targets.x).toHaveLength(0)
    expect(targets.y).toHaveLength(0)
  })
})

describe('measuring line document actions', () => {
  it('moves one end without touching the other', () => {
    const project = makeProject()
    let id = ''
    const added = produce(project, (draft) => {
      id = addMeasureLine(draft, { x1Mm: 0, y1Mm: 0, x2Mm: 100, y2Mm: 0, pinned: false })
    })
    const movedEnd = produce(added, (draft) => setMeasureEndpoint(draft, id, 'end', { x: 250, y: 80 }))
    expect(movedEnd.measureLines[0]).toMatchObject({ x1Mm: 0, y1Mm: 0, x2Mm: 250, y2Mm: 80 })

    const movedStart = produce(movedEnd, (draft) =>
      setMeasureEndpoint(draft, id, 'start', { x: -40, y: 15 }),
    )
    expect(movedStart.measureLines[0]).toMatchObject({ x1Mm: -40, y1Mm: 15, x2Mm: 250, y2Mm: 80 })
  })

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

describe('measuring endpoint attachments', () => {
  it('stores the snapped point as a fraction of the target object', () => {
    const project = makeProject([
      makeObject({ id: 'a', xMm: 200, yMm: 300, widthMm: 100, heightMm: 200 }),
    ])
    const attachment = attachmentFromSnap(
      { x: 200, y: 328 },
      {
        x: {
          axis: 'x', pos: 200, from: 300, to: 500, source: 'object', targetKind: 'edge-start',
          movingKind: 'edge-start', refId: 'a',
        },
      },
      project,
    )
    expect(attachment).toEqual({ objectId: 'a', xRatio: 0, yRatio: 0.14 })
  })

  it('moves only attached ends and preserves their relative position after resize', () => {
    const project = makeProject([
      makeObject({ id: 'a', xMm: 100, yMm: 200, widthMm: 100, heightMm: 200 }),
      makeObject({ id: 'b', xMm: 600, yMm: 100, widthMm: 200, heightMm: 100 }),
    ], [], {
      measureLines: [
        {
          ...line(100, 228, 900, 700),
          startAttachment: { objectId: 'a', xRatio: 0, yRatio: 0.14 },
        },
        {
          ...line(200, 300, 700, 150), id: 'both',
          startAttachment: { objectId: 'a', xRatio: 1, yRatio: 0.5 },
          endAttachment: { objectId: 'b', xRatio: 0.5, yRatio: 0.5 },
        },
      ],
    })

    const changed = produce(project, (draft) => {
      Object.assign(draft.objects.a, { xMm: 300, yMm: 400, heightMm: 400 })
      Object.assign(draft.objects.b, { xMm: 800, yMm: 500, widthMm: 400 })
      syncMeasureAttachments(draft)
    })

    expect(changed.measureLines[0]).toMatchObject({ x1Mm: 300, y1Mm: 456, x2Mm: 900, y2Mm: 700 })
    expect(changed.measureLines[1]).toMatchObject({ x1Mm: 400, y1Mm: 600, x2Mm: 1000, y2Mm: 550 })
  })

  it('leaves an endpoint in place when its attached object is deleted', () => {
    const project = makeProject([makeObject({ id: 'a', xMm: 100, yMm: 100 })], [], {
      measureLines: [{ ...line(100, 150, 300, 300), startAttachment: { objectId: 'a', xRatio: 0, yRatio: 0.5 } }],
    })
    const changed = produce(project, (draft) => {
      delete draft.objects.a
      syncMeasureAttachments(draft)
    })
    expect(changed.measureLines[0]).toMatchObject({ x1Mm: 100, y1Mm: 150 })
    expect(changed.measureLines[0].startAttachment).toBeUndefined()
  })

  it('resolves attached endpoints against transient move and resize previews', () => {
    const object = makeObject({ id: 'a', xMm: 100, yMm: 200, widthMm: 100, heightMm: 200 })
    const attached = {
      ...line(100, 228, 900, 700),
      startAttachment: { objectId: 'a', xRatio: 0, yRatio: 0.14 },
    }
    const resolved = previewAttachedMeasureLine(attached, { a: object }, {
      a: { xMm: 300, yMm: 400, widthMm: 200, heightMm: 400 },
    })
    expect(resolved).toMatchObject({ x1Mm: 300, y1Mm: 456, x2Mm: 900, y2Mm: 700 })
    // Previewing is render-only; the persisted line remains untouched.
    expect(attached).toMatchObject({ x1Mm: 100, y1Mm: 228 })
  })
})
