import { describe, expect, it } from 'vitest'
import { anchorPoint, constrainAnchor, rectOf, shapeContainsPoint, unionRects } from '@/geometry/bounds'
import { entitiesBounds, entityBounds, objectIdsOfEntities } from '@/geometry/groups'
import { mapRectBetweenBounds, resizeRect } from '@/geometry/resizing'
import { makeGroup, makeObject, makeProject } from './helpers'

describe('bounding boxes', () => {
  it('computes the bounding box of a rectangle', () => {
    const o = makeObject({ xMm: 10, yMm: 20, widthMm: 100, heightMm: 50 })
    expect(rectOf(o)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('uses the same bounding box for an ellipse', () => {
    const o = makeObject({ shape: 'ellipse', xMm: 10, yMm: 20, widthMm: 100, heightMm: 50 })
    expect(rectOf(o)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(shapeContainsPoint(o, 60, 45)).toBe(true)
    // A box corner is inside the bounding box but outside the ellipse.
    expect(shapeContainsPoint(o, 11, 21)).toBe(false)
  })

  it('computes the bounding box of a multi-selection', () => {
    const a = makeObject({ id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 })
    const b = makeObject({ id: 'b', xMm: 300, yMm: 50, widthMm: 100, heightMm: 200 })
    const doc = makeProject([a, b])
    expect(entitiesBounds(doc, ['a', 'b'])).toEqual({ x: 0, y: 0, width: 400, height: 250 })
    expect(unionRects([rectOf(a), rectOf(b)])).toEqual({ x: 0, y: 0, width: 400, height: 250 })
  })

  it('computes the bounding box of a nested group', () => {
    const a = makeObject({ id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100, parentGroupId: 'inner' })
    const b = makeObject({ id: 'b', xMm: 400, yMm: 400, widthMm: 100, heightMm: 100, parentGroupId: 'inner' })
    const c = makeObject({ id: 'c', xMm: 600, yMm: 0, widthMm: 50, heightMm: 50, parentGroupId: 'outer' })
    const inner = makeGroup({ id: 'inner', parentGroupId: 'outer', childObjectIds: ['a', 'b'] })
    const outer = makeGroup({ id: 'outer', childObjectIds: ['c'], childGroupIds: ['inner'] })
    const doc = makeProject([a, b, c], [inner, outer])

    expect(entityBounds(doc, 'inner')).toEqual({ x: 0, y: 0, width: 500, height: 500 })
    expect(entityBounds(doc, 'outer')).toEqual({ x: 0, y: 0, width: 650, height: 500 })
    expect(objectIdsOfEntities(doc, ['outer']).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('anchors', () => {
  it('computes the absolute anchor position', () => {
    const o = makeObject({ xMm: 100, yMm: 200, widthMm: 400, heightMm: 200, anchor: { u: 0.25, v: 0.5 } })
    expect(anchorPoint(o)).toEqual({ x: 200, y: 300 })
  })

  it('allows any point inside a rectangle', () => {
    expect(constrainAnchor('rectangle', 0, 0)).toEqual({ u: 0, v: 0 })
    expect(constrainAnchor('rectangle', 1, 1)).toEqual({ u: 1, v: 1 })
    expect(constrainAnchor('rectangle', 1.4, -0.4)).toEqual({ u: 1, v: 0 })
  })

  it('projects outside points onto the ellipse', () => {
    // Corner of the box is outside the ellipse and gets projected onto it.
    const p = constrainAnchor('ellipse', 1, 1)
    const du = (p.u - 0.5) / 0.5
    const dv = (p.v - 0.5) / 0.5
    expect(Math.hypot(du, dv)).toBeCloseTo(1, 9)
    // Points inside the ellipse are untouched.
    expect(constrainAnchor('ellipse', 0.5, 0.5)).toEqual({ u: 0.5, v: 0.5 })
    expect(constrainAnchor('ellipse', 0.5, 0)).toEqual({ u: 0.5, v: 0 })
  })
})

describe('resize', () => {
  const start = { x: 100, y: 100, width: 200, height: 100 }

  it('keeps the opposite corner fixed when dragging a corner', () => {
    const r = resizeRect(start, 'se', 50, 25)
    expect(r).toEqual({ x: 100, y: 100, width: 250, height: 125 })

    const nw = resizeRect(start, 'nw', -50, -50)
    expect(nw).toEqual({ x: 50, y: 50, width: 250, height: 150 })
    // Opposite corner unchanged.
    expect(nw.x + nw.width).toBe(start.x + start.width)
    expect(nw.y + nw.height).toBe(start.y + start.height)
  })

  it('changes a single dimension for side handles', () => {
    expect(resizeRect(start, 'e', 40, 999)).toEqual({ x: 100, y: 100, width: 240, height: 100 })
    expect(resizeRect(start, 'n', 999, -20)).toEqual({ x: 100, y: 80, width: 200, height: 120 })
  })

  it('scales from the centre with Alt', () => {
    const r = resizeRect(start, 'se', 50, 20, { fromCenter: true })
    expect(r.width).toBe(300)
    expect(r.height).toBe(140)
    expect(r.x + r.width / 2).toBe(start.x + start.width / 2)
    expect(r.y + r.height / 2).toBe(start.y + start.height / 2)
  })

  it('locks the ratio with Shift', () => {
    const r = resizeRect(start, 'se', 100, 0, { keepRatio: true })
    expect(r.width / r.height).toBeCloseTo(start.width / start.height, 9)
    expect(r.width).toBe(300)
    expect(r.height).toBe(150)
  })

  it('combines ratio lock and centre scaling', () => {
    const r = resizeRect(start, 'se', 100, 0, { keepRatio: true, fromCenter: true })
    expect(r.width / r.height).toBeCloseTo(2, 9)
    expect(r.x + r.width / 2).toBe(200)
    expect(r.y + r.height / 2).toBe(150)
  })

  it('never produces zero or negative size', () => {
    const r = resizeRect(start, 'e', -10_000, 0)
    expect(r.width).toBeGreaterThan(0)
    const c = resizeRect(start, 'se', -10_000, -10_000, { keepRatio: true })
    expect(c.width).toBeGreaterThan(0)
    expect(c.height).toBeGreaterThan(0)
  })
})

describe('mapping children when a selection is scaled', () => {
  it('scales positions and sizes relative to the bounding box', () => {
    const from = { x: 0, y: 0, width: 100, height: 100 }
    const to = { x: 0, y: 0, width: 200, height: 50 }
    expect(mapRectBetweenBounds({ x: 50, y: 50, width: 50, height: 50 }, from, to)).toEqual({
      x: 100,
      y: 25,
      width: 100,
      height: 25,
    })
  })

  it('translates when only the position changes', () => {
    const from = { x: 0, y: 0, width: 100, height: 100 }
    const to = { x: 10, y: 20, width: 100, height: 100 }
    expect(mapRectBetweenBounds({ x: 0, y: 0, width: 10, height: 10 }, from, to)).toEqual({
      x: 10,
      y: 20,
      width: 10,
      height: 10,
    })
  })
})
