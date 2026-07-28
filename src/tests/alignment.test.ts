import { describe, expect, it } from 'vitest'
import { computeAlignment, minimumEntities, type AlignOptions } from '@/geometry/alignment'
import type { SurfaceDefinition } from '@/models/project'
import { makeGroup, makeObject, makeProject } from './helpers'

const surface: SurfaceDefinition = { widthMm: 1000, heightMm: 800, color: '#ffffff' }

/** Key object: 100..200 both axes, centre and anchor at (150, 150). */
const key = makeObject({
  id: 'key',
  xMm: 100,
  yMm: 100,
  widthMm: 100,
  heightMm: 100,
  anchor: { u: 0.5, v: 0.5 },
})
/** Other object: 400..450 × 300..350, centre (425, 325), anchor at its top-left corner. */
const other = makeObject({
  id: 'other',
  xMm: 400,
  yMm: 300,
  widthMm: 50,
  heightMm: 50,
  anchor: { u: 0, v: 0 },
})

const doc = makeProject([key, other])

const opts = (partial: Partial<AlignOptions>): AlignOptions => ({
  axis: 'x',
  mode: 'start',
  reference: 'surface',
  centerBasis: 'bounds',
  ...partial,
})

describe('alignment against the surface', () => {
  it('moves every object to the left edge without touching y', () => {
    const deltas = computeAlignment(doc, ['key', 'other'], surface, opts({ axis: 'x', mode: 'start' }))
    expect(deltas).toEqual([
      { id: 'key', dx: -100, dy: 0 },
      { id: 'other', dx: -400, dy: 0 },
    ])
  })

  it('moves every object to the right edge', () => {
    const deltas = computeAlignment(doc, ['key', 'other'], surface, opts({ axis: 'x', mode: 'end' }))
    // right edges 200 and 450 → 1000
    expect(deltas).toEqual([
      { id: 'key', dx: 800, dy: 0 },
      { id: 'other', dx: 550, dy: 0 },
    ])
  })

  it('centres bounding boxes horizontally', () => {
    const deltas = computeAlignment(doc, ['key', 'other'], surface, opts({ axis: 'x', mode: 'center' }))
    // centres 150 and 425 → 500
    expect(deltas).toEqual([
      { id: 'key', dx: 350, dy: 0 },
      { id: 'other', dx: 75, dy: 0 },
    ])
  })

  it('centres anchor points horizontally when that basis is chosen', () => {
    const deltas = computeAlignment(
      doc,
      ['key', 'other'],
      surface,
      opts({ axis: 'x', mode: 'center', centerBasis: 'anchor' }),
    )
    // anchors 150 and 400 → 500
    expect(deltas).toEqual([
      { id: 'key', dx: 350, dy: 0 },
      { id: 'other', dx: 100, dy: 0 },
    ])
  })

  it('aligns to the top, middle and bottom on the y axis only', () => {
    const top = computeAlignment(doc, ['other'], surface, opts({ axis: 'y', mode: 'start' }))
    expect(top).toEqual([{ id: 'other', dx: 0, dy: -300 }])

    const middle = computeAlignment(doc, ['other'], surface, opts({ axis: 'y', mode: 'center' }))
    // centre 325 → 400
    expect(middle).toEqual([{ id: 'other', dx: 0, dy: 75 }])

    const bottom = computeAlignment(doc, ['other'], surface, opts({ axis: 'y', mode: 'end' }))
    // bottom 350 → 800
    expect(bottom).toEqual([{ id: 'other', dx: 0, dy: 450 }])
  })

  it('works with a single selected object', () => {
    expect(minimumEntities('surface')).toBe(1)
    expect(computeAlignment(doc, ['other'], surface, opts({ mode: 'start' }))).toEqual([
      { id: 'other', dx: -400, dy: 0 },
    ])
  })

  it('produces no delta when everything is already aligned', () => {
    const flush = makeObject({ id: 'flush', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 })
    const aligned = makeProject([flush])
    expect(computeAlignment(aligned, ['flush'], surface, opts({ mode: 'start' }))).toEqual([])
  })
})

describe('alignment against the key object', () => {
  it('keeps the key object still and moves the others to it', () => {
    for (const mode of ['start', 'center', 'end'] as const) {
      for (const axis of ['x', 'y'] as const) {
        const deltas = computeAlignment(
          doc,
          ['other', 'key'],
          surface,
          opts({ axis, mode, reference: 'key', keyId: 'key' }),
        )
        expect(deltas.some((d) => d.id === 'key')).toBe(false)
      }
    }
  })

  it('matches left edges, centres and right edges', () => {
    const left = computeAlignment(
      doc,
      ['other', 'key'],
      surface,
      opts({ axis: 'x', mode: 'start', reference: 'key', keyId: 'key' }),
    )
    expect(left).toEqual([{ id: 'other', dx: -300, dy: 0 }])

    const centre = computeAlignment(
      doc,
      ['other', 'key'],
      surface,
      opts({ axis: 'x', mode: 'center', reference: 'key', keyId: 'key' }),
    )
    // centres 425 → 150
    expect(centre).toEqual([{ id: 'other', dx: -275, dy: 0 }])

    const right = computeAlignment(
      doc,
      ['other', 'key'],
      surface,
      opts({ axis: 'x', mode: 'end', reference: 'key', keyId: 'key' }),
    )
    // right edges 450 → 200
    expect(right).toEqual([{ id: 'other', dx: -250, dy: 0 }])
  })

  it('uses anchor points when that centring basis is chosen', () => {
    const deltas = computeAlignment(
      doc,
      ['other', 'key'],
      surface,
      opts({ axis: 'y', mode: 'center', reference: 'key', centerBasis: 'anchor', keyId: 'key' }),
    )
    // anchors: key 150, other 300 (top-left corner)
    expect(deltas).toEqual([{ id: 'other', dx: 0, dy: -150 }])
  })

  it('needs at least two entities and a key inside the selection', () => {
    expect(minimumEntities('key')).toBe(2)
    expect(
      computeAlignment(doc, ['other'], surface, opts({ reference: 'key', keyId: 'other' })),
    ).toEqual([])
    expect(
      computeAlignment(doc, ['other', 'key'], surface, opts({ reference: 'key', keyId: null })),
    ).toEqual([])
    expect(
      computeAlignment(doc, ['other', 'key'], surface, opts({ reference: 'key', keyId: 'missing' })),
    ).toEqual([])
  })
})

describe('mixed selections of objects and groups', () => {
  it('aligns a group as one unit and uses its bounding-box centre as anchor', () => {
    const a = makeObject({ id: 'a', xMm: 600, yMm: 600, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const b = makeObject({ id: 'b', xMm: 700, yMm: 700, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const group = makeGroup({ id: 'g', childObjectIds: ['a', 'b'] })
    const mixed = makeProject([key, a, b], [group])

    // Group bounds: 600..800 both axes → centre (700, 700).
    const left = computeAlignment(
      mixed,
      ['g', 'key'],
      surface,
      opts({ axis: 'x', mode: 'start', reference: 'key', keyId: 'key' }),
    )
    expect(left).toEqual([{ id: 'g', dx: -500, dy: 0 }])

    const anchors = computeAlignment(
      mixed,
      ['g', 'key'],
      surface,
      opts({ axis: 'y', mode: 'center', reference: 'key', centerBasis: 'anchor', keyId: 'key' }),
    )
    expect(anchors).toEqual([{ id: 'g', dx: 0, dy: -550 }])
  })

  it('can use a group as the key entity', () => {
    const a = makeObject({ id: 'a', xMm: 600, yMm: 600, widthMm: 100, heightMm: 100, parentGroupId: 'g' })
    const group = makeGroup({ id: 'g', childObjectIds: ['a'] })
    const mixed = makeProject([key, a], [group])
    const deltas = computeAlignment(
      mixed,
      ['g', 'key'],
      surface,
      opts({ axis: 'x', mode: 'start', reference: 'key', keyId: 'g' }),
    )
    expect(deltas).toEqual([{ id: 'key', dx: 500, dy: 0 }])
  })
})
