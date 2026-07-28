import { describe, expect, it } from 'vitest'
import { ALIGN_H, ALIGN_V, computeAlignment } from '@/geometry/alignment'
import { makeGroup, makeObject, makeProject } from './helpers'

/** Key object: 100..200 both axes, anchor at (150, 150). */
const key = makeObject({
  id: 'key',
  xMm: 100,
  yMm: 100,
  widthMm: 100,
  heightMm: 100,
  anchor: { u: 0.5, v: 0.5 },
})
/** Other object: 400..450 × 300..350, anchor at (425, 325). */
const other = makeObject({
  id: 'other',
  xMm: 400,
  yMm: 300,
  widthMm: 50,
  heightMm: 50,
  anchor: { u: 0.5, v: 0.5 },
})

const doc = makeProject([key, other])

const EXPECTED: Record<string, [number, number]> = {
  'top-left': [-300, -200],
  'top-anchor': [-275, -200],
  'top-right': [-250, -200],
  'anchor-left': [-300, -175],
  'anchor-anchor': [-275, -175],
  'anchor-right': [-250, -175],
  'bottom-left': [-300, -150],
  'bottom-anchor': [-275, -150],
  'bottom-right': [-250, -150],
}

describe('3 × 3 alignment', () => {
  for (const v of ALIGN_V) {
    for (const h of ALIGN_H) {
      it(`aligns ${v}-${h}`, () => {
        const deltas = computeAlignment(doc, ['key', 'other'], 'key', h, v)
        expect(deltas).toHaveLength(1)
        const [dx, dy] = EXPECTED[`${v}-${h}`]
        expect(deltas[0]).toEqual({ id: 'other', dx, dy })
      })
    }
  }

  it('never moves the key object', () => {
    for (const v of ALIGN_V) {
      for (const h of ALIGN_H) {
        const deltas = computeAlignment(doc, ['key', 'other'], 'key', h, v)
        expect(deltas.some((d) => d.id === 'key')).toBe(false)
      }
    }
  })

  it('produces no delta when everything is already aligned', () => {
    const twin = makeObject({ id: 'twin', xMm: 100, yMm: 100, widthMm: 100, heightMm: 100 })
    const aligned = makeProject([key, twin])
    expect(computeAlignment(aligned, ['key', 'twin'], 'key', 'left', 'top')).toEqual([])
  })
})

describe('mixed selections of objects and groups', () => {
  it('aligns a group as one unit and uses its bounding-box centre as anchor', () => {
    const a = makeObject({ id: 'a', xMm: 600, yMm: 600, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const b = makeObject({ id: 'b', xMm: 700, yMm: 700, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const group = makeGroup({ id: 'g', childObjectIds: ['a', 'b'] })
    const mixed = makeProject([key, a, b], [group])

    // Group bounds: 600..800 both axes → centre (700, 700).
    const left = computeAlignment(mixed, ['key', 'g'], 'key', 'left', 'top')
    expect(left).toEqual([{ id: 'g', dx: -500, dy: -500 }])

    const anchors = computeAlignment(mixed, ['key', 'g'], 'key', 'anchor', 'anchor')
    expect(anchors).toEqual([{ id: 'g', dx: -550, dy: -550 }])
  })

  it('can use a group as the key entity', () => {
    const a = makeObject({ id: 'a', xMm: 600, yMm: 600, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const group = makeGroup({ id: 'g', childObjectIds: ['a'] })
    const mixed = makeProject([key, a], [group])
    const deltas = computeAlignment(mixed, ['g', 'key'], 'g', 'left', 'top')
    expect(deltas).toEqual([{ id: 'key', dx: 500, dy: 500 }])
  })
})
