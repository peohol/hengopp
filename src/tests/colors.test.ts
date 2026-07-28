import { describe, expect, it } from 'vitest'
import {
  contrastLineColor,
  contrastRatio,
  deriveBorderColor,
  parseHex,
  relativeLuminance,
  rgbToOklch,
  oklchToRgb,
  toHex,
} from '@/utils/colors'
import { fitViewport, modelToScreen, screenToModel, zoomAround, zoomPercent } from '@/geometry/coordinates'

describe('border colours', () => {
  const fills = ['#c9d7e6', '#ffffff', '#f5c0ad', '#2f6fd0', '#101010', '#00a86b']

  it('is always clearly darker than the fill', () => {
    for (const fill of fills.filter((f) => f !== '#101010')) {
      const border = deriveBorderColor(fill)
      expect(relativeLuminance(border)).toBeLessThan(relativeLuminance(fill))
      expect(contrastRatio(border, fill)).toBeGreaterThan(1.5)
    }
  })

  it('stays visible against a nearly black fill', () => {
    const border = deriveBorderColor('#101010')
    expect(contrastRatio(border, '#101010')).toBeGreaterThan(1.5)
  })

  it('keeps roughly the same hue', () => {
    for (const fill of ['#c9d7e6', '#f5c0ad', '#2f6fd0', '#00a86b']) {
      const fillHue = rgbToOklch(parseHex(fill)!).h
      const borderHue = rgbToOklch(parseHex(deriveBorderColor(fill))!).h
      const diff = Math.abs(((fillHue - borderHue + 540) % 360) - 180)
      expect(diff).toBeLessThan(12)
    }
  })

  it('falls back safely for unparseable input', () => {
    expect(deriveBorderColor('not-a-colour')).toBe('#333333')
  })
})

describe('OKLCH conversion', () => {
  it('round-trips sRGB values', () => {
    for (const hex of ['#000000', '#ffffff', '#2f6fd0', '#f5c0ad']) {
      const rgb = parseHex(hex)!
      expect(toHex(oklchToRgb(rgbToOklch(rgb)))).toBe(hex)
    }
  })
})

describe('grid contrast colour', () => {
  it('picks black on light surfaces and white on dark ones', () => {
    expect(contrastLineColor('#ffffff')).toBe('#000000')
    expect(contrastLineColor('#f2f0ec')).toBe('#000000')
    expect(contrastLineColor('#101010')).toBe('#ffffff')
    expect(contrastLineColor('#3a3a3a')).toBe('#ffffff')
  })

  it('uses the contrast ratio, not a naive lightness threshold', () => {
    // Saturated mid colours: the choice must follow the computed ratio.
    for (const bg of ['#2f6fd0', '#00a86b', '#b3261e', '#f4dc9a']) {
      const chosen = contrastLineColor(bg)
      const other = chosen === '#000000' ? '#ffffff' : '#000000'
      expect(contrastRatio(chosen, bg)).toBeGreaterThanOrEqual(contrastRatio(other, bg))
    }
  })
})

describe('viewport transform', () => {
  const vp = { scale: 0.25, offsetX: 40, offsetY: 10 }

  it('converts both ways', () => {
    expect(modelToScreen({ x: 100, y: 200 }, vp)).toEqual({ x: 65, y: 60 })
    expect(screenToModel({ x: 65, y: 60 }, vp)).toEqual({ x: 100, y: 200 })
  })

  it('keeps the model point under the cursor when zooming', () => {
    const cursor = { x: 300, y: 220 }
    const before = screenToModel(cursor, vp)
    const zoomed = zoomAround(vp, cursor, vp.scale * 2.5)
    const after = screenToModel(cursor, zoomed)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('fits a surface into the view and reports 100 %', () => {
    const fitted = fitViewport(1000, 800, 900, 700, 50)
    expect(zoomPercent(fitted, fitted.scale)).toBe(100)
    const model = screenToModel({ x: 450, y: 350 }, fitted)
    expect(model.x).toBeCloseTo(500, 4)
    expect(model.y).toBeCloseTo(400, 4)
  })

  it('never lets zoom change model values', () => {
    const model = { x: 123.4, y: 567.8 }
    for (const scale of [0.05, 0.5, 1, 4, 12]) {
      const zoomed = { ...vp, scale }
      const round = screenToModel(modelToScreen(model, zoomed), zoomed)
      expect(round.x).toBeCloseTo(model.x, 3)
      expect(round.y).toBeCloseTo(model.y, 3)
    }
  })
})
