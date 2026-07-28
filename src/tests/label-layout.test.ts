import { describe, expect, it } from 'vitest'
import { candidateOffsets, layoutLabels, type LabelSlot } from '@/geometry/label-layout'

const slot = (partial: Partial<LabelSlot> & { id: string }): LabelSlot => ({
  cx: 100,
  cy: 100,
  width: 60,
  height: 18,
  axis: 'x',
  travel: 40,
  ...partial,
})

describe('candidate offsets', () => {
  it('tries the preferred position first and then alternates outwards', () => {
    expect(candidateOffsets(20, 7)).toEqual([0, 7, -7, 14, -14, 20, -20])
  })

  it('offers only the preferred position when there is no room to slide', () => {
    expect(candidateOffsets(0)).toEqual([0])
    expect(candidateOffsets(-5)).toEqual([0])
  })
})

describe('label layout', () => {
  it('keeps a lone label exactly where it wants to be', () => {
    expect(layoutLabels([slot({ id: 'a' })])).toEqual([{ id: 'a', cx: 100, cy: 100, offset: 0 }])
  })

  it('leaves labels that already clear each other untouched', () => {
    const placed = layoutLabels([slot({ id: 'a' }), slot({ id: 'b', cy: 300 })])
    expect(placed.map((p) => p.offset)).toEqual([0, 0])
  })

  it('slides an overlapping label along its own axis only', () => {
    const [a, b] = layoutLabels([slot({ id: 'a', travel: 80 }), slot({ id: 'b', travel: 80 })])
    expect(a.offset).toBe(0)
    // The second label moved clear sideways; its cross axis is untouched.
    expect(b.cy).toBe(100)
    expect(Math.abs(b.cx - a.cx)).toBeGreaterThanOrEqual(60)
  })

  it('slides as far as it can when the line is too short to clear fully', () => {
    const [, b] = layoutLabels([slot({ id: 'a', travel: 40 }), slot({ id: 'b', travel: 40 })])
    expect(Math.abs(b.offset)).toBe(40)
  })

  it('slides vertically when the label belongs to a vertical line', () => {
    const v = (id: string) => slot({ id, axis: 'y', width: 40, height: 38, travel: 60 })
    const [a, b] = layoutLabels([v('a'), v('b')])
    expect(a.offset).toBe(0)
    expect(b.cx).toBe(100)
    expect(Math.abs(b.cy - a.cy)).toBeGreaterThanOrEqual(38)
  })

  it('never slides further than the travel allowance', () => {
    const placed = layoutLabels([
      slot({ id: 'a', travel: 5 }),
      slot({ id: 'b', travel: 5 }),
      slot({ id: 'c', travel: 5 }),
    ])
    for (const p of placed) expect(Math.abs(p.offset)).toBeLessThanOrEqual(5)
  })

  it('falls back to the least overlapping position when nothing fits', () => {
    // Three labels wider than the room they have: they cannot all clear, but the
    // layout must still spread them instead of stacking them all at the centre.
    const placed = layoutLabels([
      slot({ id: 'a', travel: 30 }),
      slot({ id: 'b', travel: 30 }),
      slot({ id: 'c', travel: 30 }),
    ])
    const centres = placed.map((p) => p.cx)
    expect(new Set(centres).size).toBe(3)
  })

  it('gives priority to the labels passed first', () => {
    const [first] = layoutLabels([slot({ id: 'pinned' }), slot({ id: 'temp' })])
    expect(first).toEqual({ id: 'pinned', cx: 100, cy: 100, offset: 0 })
  })

  it('is deterministic', () => {
    const input = [slot({ id: 'a' }), slot({ id: 'b' }), slot({ id: 'c', cx: 130 })]
    expect(layoutLabels(input)).toEqual(layoutLabels(input))
  })
})
