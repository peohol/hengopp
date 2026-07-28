import { describe, expect, it } from 'vitest'
import {
  buildSnapTargetsForDocument,
  computeSnap,
  rectSnapCandidates,
  resizeSnapCandidates,
  snapAxis,
  snappingEnabled,
  SNAP_ACTIVATE_PX,
  SNAP_RELEASE_PX,
  SNAP_TIE_PX,
  type SnapTargets,
} from '@/geometry/snapping'
import type { Rect } from '@/geometry/bounds'
import { makeObject, makeProject } from './helpers'

/**
 * Static reference object: 200..300 × 100..200.
 * The anchor sits at (220, 120) so anchor targets are distinguishable from the
 * centre lines (250, 150).
 */
const staticObject = makeObject({
  id: 'static',
  xMm: 200,
  yMm: 100,
  widthMm: 100,
  heightMm: 100,
  anchor: { u: 0.2, v: 0.2 },
})

function snapAt(
  rect: Rect,
  opts: {
    scale?: number
    anchor?: { x: number; y: number } | null
    targets?: SnapTargets
    previousXKey?: string
    previousYKey?: string
  } = {},
) {
  const scale = opts.scale ?? 1
  const doc = makeProject([staticObject], [], {
    settings: { movementStepMm: 10, snapToGrid: false, snapToObjects: true, quantiseDrag: false },
  })
  const targets = opts.targets ?? buildSnapTargetsForDocument(doc, ['moving'])
  const candidates = rectSnapCandidates(rect, opts.anchor ?? null)
  return computeSnap({
    xCandidates: candidates.x,
    yCandidates: candidates.y,
    targets,
    movingXExtent: [rect.x, rect.x + rect.width],
    movingYExtent: [rect.y, rect.y + rect.height],
    activateMm: SNAP_ACTIVATE_PX / scale,
    releaseMm: SNAP_RELEASE_PX / scale,
    tieMm: SNAP_TIE_PX / scale,
    previousXKey: opts.previousXKey,
    previousYKey: opts.previousYKey,
  })
}

describe('object snapping', () => {
  it('snaps edge to edge', () => {
    const result = snapAt({ x: 204, y: 500, width: 60, height: 40 })
    expect(result.deltaXMm).toBe(-4)
    expect(result.xGuide?.pos).toBe(200)
    expect(result.xGuide?.source).toBe('object')
  })

  it('snaps an edge to a centre line', () => {
    const result = snapAt({ x: 246, y: 500, width: 60, height: 40 })
    expect(result.deltaXMm).toBe(4)
    expect(result.xGuide?.pos).toBe(250)
    expect(result.xGuide?.targetKind).toBe('center')
  })

  it('snaps anchor to anchor', () => {
    // Moving geometry parked far from every edge target; only its anchor is close.
    const rect = { x: 560, y: 560, width: 80, height: 40 }
    const result = snapAt(rect, { anchor: { x: 223, y: 600 } })
    expect(result.deltaXMm).toBe(-3)
    expect(result.xGuide?.movingKind).toBe('anchor')
    expect(result.xGuide?.targetKind).toBe('anchor')
  })

  it('snaps an anchor to an edge', () => {
    const rect = { x: 560, y: 560, width: 80, height: 40 }
    const result = snapAt(rect, { anchor: { x: 303, y: 600 } })
    expect(result.deltaXMm).toBe(-3)
    expect(result.xGuide?.targetKind).toBe('edge-end')
  })

  it('snaps x and y at the same time', () => {
    const result = snapAt({ x: 204, y: 104, width: 60, height: 40 })
    expect(result.deltaXMm).toBe(-4)
    expect(result.deltaYMm).toBe(-4)
    expect(result.xGuide).toBeDefined()
    expect(result.yGuide).toBeDefined()
    // The horizontal guide spans both the moving geometry and the target.
    expect(result.xGuide!.to).toBeGreaterThan(result.xGuide!.from)
  })

  it('excludes the moving object from the snap targets', () => {
    const doc = makeProject([staticObject, makeObject({ id: 'moving', xMm: 600, yMm: 600 })])
    const targets = buildSnapTargetsForDocument(doc, ['moving'])
    expect(targets.x.some((t) => t.refId === 'moving')).toBe(false)
    expect(targets.x.some((t) => t.refId === 'static')).toBe(true)

    const withAll = buildSnapTargetsForDocument(doc, [])
    expect(withAll.x.some((t) => t.refId === 'moving')).toBe(true)
  })
})

describe('surface grid snapping', () => {
  it('snaps to active grid lines', () => {
    const doc = makeProject([], [], {
      surface: { widthMm: 1000, heightMm: 800, color: '#ffffff' },
      surfaceGrid: { enabled: true, mode: 'cells', cols: 4, rows: 2, hAlign: 'start', vAlign: 'start' },
      settings: { movementStepMm: 10, snapToGrid: true, snapToObjects: false, quantiseDrag: false },
    })
    const targets = buildSnapTargetsForDocument(doc, [])
    const result = snapAt({ x: 253, y: 600, width: 60, height: 40 }, { targets })
    expect(result.deltaXMm).toBe(-3)
    expect(result.xGuide?.source).toBe('grid')
  })

  it('offers no grid targets when snap-to-grid is off', () => {
    const doc = makeProject([], [], {
      surfaceGrid: { enabled: true, mode: 'cells', cols: 4, rows: 2, hAlign: 'start', vAlign: 'start' },
      settings: { movementStepMm: 10, snapToGrid: false, snapToObjects: false, quantiseDrag: false },
    })
    const targets = buildSnapTargetsForDocument(doc, [])
    expect(targets.x).toHaveLength(0)
    expect(targets.y).toHaveLength(0)
  })
})

describe('screen-based threshold', () => {
  const target = { pos: 200, kind: 'edge-start' as const, source: 'object' as const, refId: 'a' }

  it('behaves the same at every zoom level', () => {
    for (const scale of [0.25, 0.5, 1, 2, 4]) {
      const opts = {
        activateMm: SNAP_ACTIVATE_PX / scale,
        releaseMm: SNAP_RELEASE_PX / scale,
        tieMm: SNAP_TIE_PX / scale,
      }
      const gapWithin = 6 / scale // 6 screen px → inside the 8 px activation
      const gapOutside = 14 / scale // 14 screen px → outside activation and release

      const inside = snapAxis([{ pos: 200 + gapWithin, kind: 'edge-start' }], [target], opts)
      const outside = snapAxis([{ pos: 200 + gapOutside, kind: 'edge-start' }], [target], opts)
      expect(inside?.delta).toBeCloseTo(-gapWithin, 6)
      expect(outside).toBeNull()
    }
  })

  it('converts the same screen distance to different model distances', () => {
    const near = snapAt({ x: 204, y: 500, width: 60, height: 40 }, { scale: 1 })
    const far = snapAt({ x: 204, y: 500, width: 60, height: 40 }, { scale: 4 })
    expect(near.deltaXMm).toBe(-4) // 4 px away at 100 %
    expect(far.deltaXMm).toBe(0) // 16 px away at 400 %
  })
})

describe('hysteresis', () => {
  const target = { pos: 200, kind: 'edge-start' as const, source: 'object' as const, refId: 'a' }
  const opts = { activateMm: 8, releaseMm: 12, tieMm: 1.5 }

  it('keeps an active snap until the release threshold is passed', () => {
    const first = snapAxis([{ pos: 204, kind: 'edge-start' }], [target], opts)
    const key = first?.key
    expect(key).toBeDefined()

    // 10 mm away: beyond activation (8), inside release (12) → snap is kept.
    const kept = snapAxis([{ pos: 210, kind: 'edge-start' }], [target], { ...opts, previousKey: key })
    expect(kept?.delta).toBe(-10)
    expect(kept?.key).toBe(key)

    // Without the previous key the same position would not snap at all.
    expect(snapAxis([{ pos: 210, kind: 'edge-start' }], [target], opts)).toBeNull()

    // 14 mm away: beyond the release threshold → released.
    expect(snapAxis([{ pos: 214, kind: 'edge-start' }], [target], { ...opts, previousKey: key })).toBeNull()
  })

  it('keeps the guide alive across frames in the full pipeline', () => {
    const first = snapAt({ x: 204, y: 500, width: 60, height: 40 })
    expect(first.xKey).toBeDefined()
    const kept = snapAt({ x: 210, y: 500, width: 60, height: 40 }, { previousXKey: first.xKey })
    expect(kept.xKey).toBe(first.xKey)
    expect(kept.deltaXMm).toBe(-10)
  })

  it('switches when a clearly better candidate appears', () => {
    const targets: SnapTargets = {
      x: [
        { pos: 100, kind: 'edge-start', source: 'object', refId: 'a' },
        { pos: 111, kind: 'edge-start', source: 'object', refId: 'b' },
      ],
      y: [],
    }
    const previousKey = 'edge-start|object|a|edge-start|100.0000'
    const result = snapAxis([{ pos: 110.5, kind: 'edge-start' }], targets.x, {
      activateMm: 8,
      releaseMm: 12,
      tieMm: 1.5,
      previousKey,
    })
    expect(result?.target.refId).toBe('b')
  })
})

describe('semantic priority', () => {
  it('breaks ties in favour of anchor-to-anchor', () => {
    const result = snapAxis(
      [
        { pos: 100, kind: 'edge-start' },
        { pos: 150, kind: 'anchor' },
      ],
      [
        { pos: 103, kind: 'edge-start', source: 'object', refId: 'a' },
        { pos: 147, kind: 'anchor', source: 'object', refId: 'b' },
      ],
      { activateMm: 8, releaseMm: 12, tieMm: 1.5 },
    )
    expect(result?.delta).toBe(-3)
    expect(result?.target.kind).toBe('anchor')
  })

  it('never lets priority override a clearly closer candidate', () => {
    const result = snapAxis(
      [
        { pos: 100, kind: 'edge-start' },
        { pos: 150, kind: 'anchor' },
      ],
      [
        { pos: 101, kind: 'edge-start', source: 'object', refId: 'a' },
        { pos: 145, kind: 'anchor', source: 'object', refId: 'b' },
      ],
      { activateMm: 8, releaseMm: 12, tieMm: 1.5 },
    )
    expect(result?.delta).toBe(1)
    expect(result?.target.kind).toBe('edge-start')
  })

  it('ranks the surface grid last', () => {
    const result = snapAxis(
      [{ pos: 100, kind: 'edge-start' }],
      [
        { pos: 103, kind: 'grid', source: 'grid', refId: 'g' },
        { pos: 97, kind: 'edge-start', source: 'object', refId: 'a' },
      ],
      { activateMm: 8, releaseMm: 12, tieMm: 1.5 },
    )
    expect(result?.target.source).toBe('object')
  })
})

describe('modifier and mode gates', () => {
  it('Alt disables snapping', () => {
    expect(snappingEnabled({ snapToGrid: true, snapToObjects: true }, false)).toBe(true)
    expect(snappingEnabled({ snapToGrid: true, snapToObjects: true }, true)).toBe(false)
    expect(snappingEnabled({ snapToGrid: false, snapToObjects: false }, false)).toBe(false)
  })
})

describe('resize snapping', () => {
  it('only offers the edges the user actually drags', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 }
    const se = resizeSnapCandidates(rect, { left: false, right: true, top: false, bottom: true })
    expect(se.x).toEqual([{ pos: 300, kind: 'edge-end' }])
    expect(se.y).toEqual([{ pos: 200, kind: 'edge-end' }])

    const w = resizeSnapCandidates(rect, { left: true, right: false, top: false, bottom: false })
    expect(w.x).toEqual([{ pos: 100, kind: 'edge-start' }])
    expect(w.y).toEqual([])
  })
})
