import { describe, expect, it } from 'vitest'
import { MIN_MAJOR_PX, MIN_MINOR_PX, minorDivisions, niceStepMm, rulerScale } from '@/geometry/ruler'

describe('nice ruler steps', () => {
  it('walks the 1-2-5 ladder in the display unit', () => {
    // 1 px per mm: 68 px wants ≥ 6,8 cm, so the ladder lands on 10 cm.
    expect(niceStepMm(MIN_MAJOR_PX, 1, 'cm')).toBe(100)
    // Zoomed in tenfold the same spacing only needs 0,68 cm → 1 cm.
    expect(niceStepMm(MIN_MAJOR_PX, 10, 'cm')).toBe(10)
    // Zoomed far out it climbs to 100 cm.
    expect(niceStepMm(MIN_MAJOR_PX, 0.1, 'cm')).toBe(1000)
  })

  it('produces round numbers in millimetres too', () => {
    expect(niceStepMm(MIN_MAJOR_PX, 10, 'mm')).toBe(10)
    expect(niceStepMm(MIN_MAJOR_PX, 40, 'mm')).toBe(2)
    expect(niceStepMm(MIN_MAJOR_PX, 100, 'mm')).toBe(1)
  })

  it('only ever returns 1, 2 or 5 times a power of ten', () => {
    for (const scale of [0.05, 0.13, 0.4, 1, 2.7, 9, 33]) {
      const step = niceStepMm(MIN_MAJOR_PX, scale, 'cm') / 10
      const magnitude = Math.pow(10, Math.floor(Math.log10(step) + 1e-9))
      expect([1, 2, 5]).toContain(Math.round(step / magnitude))
    }
  })

  it('never lets labelled ticks crowd below the minimum spacing', () => {
    for (const scale of [0.05, 0.13, 0.4, 1, 2.7, 9, 33]) {
      expect(niceStepMm(MIN_MAJOR_PX, scale, 'cm') * scale).toBeGreaterThanOrEqual(MIN_MAJOR_PX - 1e-9)
    }
  })

  it('survives a degenerate scale', () => {
    expect(niceStepMm(MIN_MAJOR_PX, 0, 'cm')).toBe(10)
    expect(niceStepMm(MIN_MAJOR_PX, Number.NaN, 'mm')).toBe(1)
  })
})

describe('minor subdivisions', () => {
  it('splits 1 and 5 in five, and 2 in four, so every tick is round', () => {
    expect(minorDivisions(10, 'cm')).toBe(5) // 1 cm
    expect(minorDivisions(20, 'cm')).toBe(4) // 2 cm
    expect(minorDivisions(50, 'cm')).toBe(5) // 5 cm
    expect(minorDivisions(1000, 'cm')).toBe(5) // 100 cm
  })
})

describe('ruler ticks', () => {
  it('labels only the major ticks and covers the visible range', () => {
    const { stepMm, minorStepMm, ticks } = rulerScale({ fromMm: 0, toMm: 500, scale: 1, unit: 'cm' })
    expect(stepMm).toBe(100)
    expect(minorStepMm).toBe(20)
    const majors = ticks.filter((t) => t.major)
    expect(majors.map((t) => t.posMm)).toEqual([0, 100, 200, 300, 400, 500])
    expect(majors[1].label).toBe('10')
    expect(ticks.filter((t) => !t.major).every((t) => t.label === undefined)).toBe(true)
  })

  it('includes negative positions outside the surface', () => {
    const { ticks } = rulerScale({ fromMm: -250, toMm: 250, scale: 1, unit: 'cm' })
    expect(ticks.some((t) => t.posMm < 0)).toBe(true)
    expect(ticks.find((t) => t.posMm === -100)?.label).toBe('-10')
  })

  it('never lets minor ticks merge into a band, at any zoom', () => {
    for (const scale of [0.02, 0.13, 0.4, 1, 2.7, 9, 33]) {
      const { minorStepMm } = rulerScale({ fromMm: 0, toMm: 500 / scale, scale, unit: 'cm' })
      // Either the subdivision is dropped, or it clears the minimum spacing.
      if (minorStepMm !== null) expect(minorStepMm * scale).toBeGreaterThanOrEqual(MIN_MINOR_PX)
    }
  })

  it('subdivides the major step into whole cells', () => {
    for (const scale of [0.02, 0.13, 1, 9]) {
      const { stepMm, minorStepMm } = rulerScale({ fromMm: 0, toMm: 500 / scale, scale, unit: 'cm' })
      if (minorStepMm === null) continue
      const divisions = stepMm / minorStepMm
      expect(Math.abs(divisions - Math.round(divisions))).toBeLessThan(1e-6)
    }
  })

  it('returns nothing for an empty or invalid range', () => {
    expect(rulerScale({ fromMm: 10, toMm: 10, scale: 1, unit: 'cm' }).ticks).toEqual([])
    expect(rulerScale({ fromMm: 0, toMm: 100, scale: 0, unit: 'cm' }).ticks).toEqual([])
  })
})
