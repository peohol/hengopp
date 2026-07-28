import { describe, expect, it } from 'vitest'
import { computeDistribution, minimumEntities } from '@/geometry/distribution'
import { makeObject, makeProject } from './helpers'
import type { SurfaceDefinition } from '@/models/project'

const surface: SurfaceDefinition = { widthMm: 1000, heightMm: 800, color: '#ffffff' }

function applyX(doc: ReturnType<typeof makeProject>, deltas: { id: string; dx: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.keys(doc.objects)) out[id] = doc.objects[id].xMm
  for (const d of deltas) out[d.id] += d.dx
  return out
}

describe('distribution between the outermost selected objects', () => {
  it('produces equal gaps between bounding-box edges', () => {
    const objects = [
      makeObject({ id: 'a', xMm: 0, widthMm: 100 }),
      makeObject({ id: 'b', xMm: 200, widthMm: 50 }),
      makeObject({ id: 'c', xMm: 400, widthMm: 100 }),
    ]
    const doc = makeProject(objects)
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'selection',
      target: 'edges',
      outerGap: false,
    })
    const x = applyX(doc, result.deltas)
    // span 500, sizes 250 → gap 125
    expect(x).toEqual({ a: 0, b: 225, c: 400 })
    expect(result.warning).toBeUndefined()
  })

  it('keeps the first and last object in place', () => {
    const objects = [
      makeObject({ id: 'a', xMm: 0, widthMm: 100 }),
      makeObject({ id: 'b', xMm: 130, widthMm: 100 }),
      makeObject({ id: 'c', xMm: 700, widthMm: 100 }),
    ]
    const doc = makeProject(objects)
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'selection',
      target: 'edges',
      outerGap: false,
    })
    expect(result.deltas.some((d) => d.id === 'a')).toBe(false)
    expect(result.deltas.some((d) => d.id === 'c')).toBe(false)
  })

  it('distributes anchor points at equal intervals', () => {
    const objects = [
      makeObject({ id: 'a', xMm: 0, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }), // anchor 50
      makeObject({ id: 'b', xMm: 300, widthMm: 40, anchor: { u: 0.5, v: 0.5 } }), // anchor 320
      makeObject({ id: 'c', xMm: 800, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }), // anchor 850
    ]
    const doc = makeProject(objects)
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'selection',
      target: 'anchors',
      outerGap: false,
    })
    const x = applyX(doc, result.deltas)
    // anchors go 50 → 450 → 850, so b's anchor moves from 320 to 450 (+130)
    expect(x).toEqual({ a: 0, b: 430, c: 800 })
  })

  it('works vertically as well', () => {
    const objects = [
      makeObject({ id: 'a', yMm: 0, heightMm: 100 }),
      makeObject({ id: 'b', yMm: 120, heightMm: 100 }),
      makeObject({ id: 'c', yMm: 500, heightMm: 100 }),
    ]
    const doc = makeProject(objects)
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'y',
      reference: 'selection',
      target: 'edges',
      outerGap: false,
    })
    // span 600, sizes 300 → gap 150 → b at 250
    expect(result.deltas).toEqual([{ id: 'b', dx: 0, dy: 130 }])
  })
})

describe('distribution relative to the surface', () => {
  const objects = () => [
    makeObject({ id: 'a', xMm: 10, widthMm: 100 }),
    makeObject({ id: 'b', xMm: 300, widthMm: 100 }),
    makeObject({ id: 'c', xMm: 700, widthMm: 100 }),
  ]

  it('includes equal outer air', () => {
    const doc = makeProject(objects())
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'edges',
      outerGap: true,
    })
    const x = applyX(doc, result.deltas)
    // gap = (1000 - 300) / 4 = 175
    expect(x).toEqual({ a: 175, b: 450, c: 725 })
  })

  it('excludes outer air', () => {
    const doc = makeProject(objects())
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'edges',
      outerGap: false,
    })
    const x = applyX(doc, result.deltas)
    // gap = (1000 - 300) / 2 = 350
    expect(x).toEqual({ a: 0, b: 450, c: 900 })
  })

  it('handles objects of different widths', () => {
    const doc = makeProject([
      makeObject({ id: 'a', xMm: 0, widthMm: 100 }),
      makeObject({ id: 'b', xMm: 200, widthMm: 200 }),
      makeObject({ id: 'c', xMm: 600, widthMm: 50 }),
    ])
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'edges',
      outerGap: true,
    })
    const x = applyX(doc, result.deltas)
    // gap = (1000 - 350) / 4 = 162.5
    expect(x).toEqual({ a: 162.5, b: 425, c: 787.5 })
  })

  it('spreads anchors regularly and keeps objects on the surface', () => {
    const doc = makeProject([
      makeObject({ id: 'a', xMm: 0, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
      makeObject({ id: 'b', xMm: 300, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
      makeObject({ id: 'c', xMm: 700, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
    ])
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'anchors',
      outerGap: true,
    })
    const x = applyX(doc, result.deltas)
    // anchors at 250, 500, 750 → left edges 200, 450, 700
    expect(x).toEqual({ a: 200, b: 450, c: 700 })
  })

  it('uses the outermost valid anchor positions without outer air', () => {
    const doc = makeProject([
      makeObject({ id: 'a', xMm: 0, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
      makeObject({ id: 'b', xMm: 300, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
      makeObject({ id: 'c', xMm: 700, widthMm: 100, anchor: { u: 0.5, v: 0.5 } }),
    ])
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'anchors',
      outerGap: false,
    })
    const x = applyX(doc, result.deltas)
    // valid anchor range 50 … 950 → anchors 50, 500, 950 → left edges 0, 450, 900
    expect(x).toEqual({ a: 0, b: 450, c: 900 })
  })
})

describe('impossible layouts', () => {
  it('warns instead of crashing when the gap would be negative', () => {
    const doc = makeProject([
      makeObject({ id: 'a', xMm: 0, widthMm: 400 }),
      makeObject({ id: 'b', xMm: 300, widthMm: 400 }),
      makeObject({ id: 'c', xMm: 600, widthMm: 400 }),
    ])
    const result = computeDistribution(doc, ['a', 'b', 'c'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'edges',
      outerGap: true,
    })
    expect(result.warning).toMatch(/overlappe/i)
    expect(result.deltas.length).toBeGreaterThan(0)
    expect(result.deltas.every((d) => Number.isFinite(d.dx))).toBe(true)
  })

  it('does nothing when too few entities are selected', () => {
    const doc = makeProject([makeObject({ id: 'a' }), makeObject({ id: 'b' })])
    expect(minimumEntities({ reference: 'selection', outerGap: false })).toBe(3)
    const result = computeDistribution(doc, ['a', 'b'], surface, {
      axis: 'x',
      reference: 'selection',
      target: 'edges',
      outerGap: false,
    })
    expect(result.deltas).toEqual([])
  })

  it('centres a single object on the surface when outer air is requested', () => {
    const doc = makeProject([makeObject({ id: 'a', xMm: 0, widthMm: 200 })])
    const result = computeDistribution(doc, ['a'], surface, {
      axis: 'x',
      reference: 'surface',
      target: 'edges',
      outerGap: true,
    })
    expect(applyX(doc, result.deltas)).toEqual({ a: 400 })
  })
})
