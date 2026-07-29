import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import {
  clampGuidePos,
  guidePosFromOrigin,
  guideValueFromOrigin,
  resolveGuideDrag,
  sortedGuides,
} from '@/geometry/guides'
import { buildSnapTargets, computeSnap, rectSnapCandidates } from '@/geometry/snapping'
import { DEFAULT_SURFACE_GRID } from '@/models/grid'
import { addGuide, moveGuide, removeGuide, setSurfaceSize, toggleGuideLock } from '@/state/doc-actions'
import { makeObject, makeProject } from './helpers'

const SURFACE = { widthMm: 1000, heightMm: 800, color: '#ffffff' }
const NO_TARGETS = { x: [], y: [] }
const THRESHOLDS = { activateMm: 8, releaseMm: 12, tieMm: 1.5 }

describe('guide positions', () => {
  it('never leaves the surface', () => {
    expect(clampGuidePos(-50, 1000)).toBe(0)
    expect(clampGuidePos(1500, 1000)).toBe(1000)
    expect(clampGuidePos(400, 1000)).toBe(400)
  })

  it('converts between an origin edge and the stored position', () => {
    expect(guideValueFromOrigin(300, 'start', 1000)).toBe(300)
    expect(guideValueFromOrigin(300, 'end', 1000)).toBe(700)
    expect(guidePosFromOrigin(700, 'end', 1000)).toBe(300)
    // A value measured from the far edge is clamped like any other.
    expect(guidePosFromOrigin(1400, 'end', 1000)).toBe(0)
  })

  it('sorts by axis and then position', () => {
    const guides = [
      { id: 'c', axis: 'y' as const, posMm: 10, locked: false },
      { id: 'b', axis: 'x' as const, posMm: 90, locked: false },
      { id: 'a', axis: 'x' as const, posMm: 20, locked: false },
    ]
    expect(sortedGuides(guides).map((g) => g.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('dragging a guide', () => {
  it('lands on the movement step when nothing is nearby', () => {
    const result = resolveGuideDrag({
      axis: 'x',
      posMm: 317,
      sizeMm: 1000,
      stepMm: 10,
      targets: NO_TARGETS,
      snappingOn: true,
      ...THRESHOLDS,
    })
    expect(result.posMm).toBe(320)
    expect(result.guide).toBeUndefined()
  })

  it('uses the step even with snapping switched off', () => {
    const result = resolveGuideDrag({
      axis: 'y',
      posMm: 317,
      sizeMm: 800,
      stepMm: 25,
      targets: NO_TARGETS,
      snappingOn: false,
      ...THRESHOLDS,
    })
    expect(result.posMm).toBe(325)
  })

  it('snaps to an object edge that the step alone could never reach', () => {
    const targets = buildSnapTargets({
      surface: SURFACE,
      surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
      objects: [makeObject({ id: 'a', xMm: 313, yMm: 0, widthMm: 100, heightMm: 100 })],
      snapToGrid: false,
      snapToObjects: true,
    })
    const result = resolveGuideDrag({
      axis: 'x',
      posMm: 316,
      sizeMm: 1000,
      stepMm: 10,
      targets,
      snappingOn: true,
      ...THRESHOLDS,
    })
    expect(result.posMm).toBe(313)
    expect(result.guide?.source).toBe('object')
  })

  it('stays inside the surface however far the pointer goes', () => {
    const result = resolveGuideDrag({
      axis: 'y',
      posMm: 5000,
      sizeMm: 800,
      stepMm: 10,
      targets: NO_TARGETS,
      snappingOn: true,
      ...THRESHOLDS,
    })
    expect(result.posMm).toBe(800)
  })
})

describe('guides as snap targets', () => {
  const targetsWithGuide = (posMm: number) =>
    buildSnapTargets({
      surface: SURFACE,
      surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
      objects: [],
      snapToGrid: false,
      snapToObjects: false,
      guides: [{ id: 'g1', axis: 'x', posMm, locked: false }],
    })

  it('pulls a moving object onto the guide', () => {
    const rect = { x: 404, y: 100, width: 100, height: 50 }
    const snap = computeSnap({
      xCandidates: rectSnapCandidates(rect).x,
      yCandidates: rectSnapCandidates(rect).y,
      targets: targetsWithGuide(400),
      movingXExtent: [rect.x, rect.x + rect.width],
      movingYExtent: [rect.y, rect.y + rect.height],
      ...THRESHOLDS,
    })
    expect(snap.deltaXMm).toBe(-4)
    expect(snap.xGuide?.source).toBe('guide')
  })

  it('can be excluded, so a guide never snaps to itself', () => {
    const targets = buildSnapTargets({
      surface: SURFACE,
      surfaceGrid: { ...DEFAULT_SURFACE_GRID, enabled: false },
      objects: [],
      snapToGrid: false,
      snapToObjects: false,
      guides: [{ id: 'g1', axis: 'x', posMm: 400, locked: false }],
      excludeGuideId: 'g1',
    })
    expect(targets.x).toHaveLength(0)
  })
})

describe('shrinking the surface', () => {
  it('pulls the guides back inside, in the same action', () => {
    const project = makeProject([], [], {
      guides: [
        { id: 'gx', axis: 'x' as const, posMm: 900, locked: false },
        { id: 'gy', axis: 'y' as const, posMm: 700, locked: true },
      ],
    })
    // A guide outside the surface would be neither visible nor grabbable, so
    // it follows the edge in rather than waiting for the next reload.
    const smaller = produce(project, (draft) => setSurfaceSize(draft, { widthMm: 500, heightMm: 400 }))
    expect(smaller.guides[0].posMm).toBe(500)
    expect(smaller.guides[1].posMm).toBe(400)
    // Clamping is not a move: a locked guide is still locked afterwards.
    expect(smaller.guides[1].locked).toBe(true)
  })

  it('leaves guides alone when the surface grows', () => {
    const project = makeProject([], [], {
      guides: [{ id: 'gx', axis: 'x' as const, posMm: 400, locked: false }],
    })
    const larger = produce(project, (draft) => setSurfaceSize(draft, { widthMm: 4000 }))
    expect(larger.guides[0].posMm).toBe(400)
  })
})

describe('guide document actions', () => {
  it('adds, moves, locks and removes', () => {
    const project = makeProject()
    let id = ''
    const withGuide = produce(project, (draft) => {
      id = addGuide(draft, 'y', 12345)
    })
    // Added beyond the surface, so it lands on the far edge.
    expect(withGuide.guides).toHaveLength(1)
    expect(withGuide.guides[0].posMm).toBe(project.surface.heightMm)

    const moved = produce(withGuide, (draft) => moveGuide(draft, id, 200))
    expect(moved.guides[0].posMm).toBe(200)

    const locked = produce(moved, (draft) => toggleGuideLock(draft, id))
    expect(locked.guides[0].locked).toBe(true)

    // A locked guide holds its position against every move.
    const held = produce(locked, (draft) => moveGuide(draft, id, 500))
    expect(held.guides[0].posMm).toBe(200)

    const removed = produce(locked, (draft) => removeGuide(draft, id))
    expect(removed.guides).toHaveLength(0)
  })
})
