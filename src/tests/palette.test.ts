import { describe, expect, it } from 'vitest'
import {
  OBJECT_PALETTE,
  PALETTE_HUE_COUNT,
  PALETTE_LEVEL_COUNT,
  PALETTE_LIGHTNESS,
  PALETTE_SATURATION,
  isPaletteColor,
  paletteColor,
  pickObjectColor,
} from '@/models/palette'
import { hslToHex, parseHex, relativeLuminance } from '@/utils/colors'

/** HSL saturation/lightness of an sRGB colour, mirroring `hslToHex`. */
function hsl(hex: string): { s: number; l: number } {
  const rgb = parseHex(hex)
  if (!rgb) throw new Error(`not a colour: ${hex}`)
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { s, l }
}

describe('object palette', () => {
  it('is a 12 × 4 grid of unique colours', () => {
    expect(PALETTE_HUE_COUNT).toBe(12)
    expect(PALETTE_LEVEL_COUNT).toBe(PALETTE_LIGHTNESS.length)
    expect(OBJECT_PALETTE).toHaveLength(48)
    expect(new Set(OBJECT_PALETTE).size).toBe(48)
  })

  it('is laid out row-major, so each row is one brightness level', () => {
    for (let row = 0; row < PALETTE_LEVEL_COUNT; row += 1) {
      for (let column = 0; column < PALETTE_HUE_COUNT; column += 1) {
        expect(OBJECT_PALETTE[row * PALETTE_HUE_COUNT + column]).toBe(paletteColor(column, row))
      }
    }
  })

  it('holds every colour at 40 % saturation', () => {
    expect(PALETTE_SATURATION).toBe(0.4)
    for (const hex of OBJECT_PALETTE) {
      // Rounding to 8 bits per channel costs a little precision on the darker
      // rows, so compare within a tolerance rather than exactly.
      expect(Math.abs(hsl(hex).s - PALETTE_SATURATION)).toBeLessThan(0.015)
    }
  })

  it('never includes black or white', () => {
    for (const hex of OBJECT_PALETTE) {
      const { l } = hsl(hex)
      expect(l).toBeGreaterThan(0.1)
      expect(l).toBeLessThan(0.95)
      expect(hex).not.toBe('#000000')
      expect(hex).not.toBe('#ffffff')
    }
  })

  it('gets darker down the rows for a given hue', () => {
    for (let column = 0; column < PALETTE_HUE_COUNT; column += 1) {
      for (let row = 1; row < PALETTE_LEVEL_COUNT; row += 1) {
        expect(relativeLuminance(paletteColor(column, row))).toBeLessThan(
          relativeLuminance(paletteColor(column, row - 1)),
        )
      }
    }
  })

  it('recognises its own colours only', () => {
    expect(isPaletteColor(OBJECT_PALETTE[7])).toBe(true)
    expect(isPaletteColor(OBJECT_PALETTE[7].toUpperCase())).toBe(true)
    expect(isPaletteColor('#c9d7e6')).toBe(false)
  })
})

describe('hslToHex', () => {
  it('matches known values', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff')
    expect(hslToHex(0, 0, 0.5)).toBe('#808080')
  })

  it('wraps the hue', () => {
    expect(hslToHex(360, 0.4, 0.5)).toBe(hslToHex(0, 0.4, 0.5))
    expect(hslToHex(-30, 0.4, 0.5)).toBe(hslToHex(330, 0.4, 0.5))
  })
})

describe('pickObjectColor', () => {
  it('always returns a palette colour', () => {
    for (let i = 0; i < 50; i += 1) expect(isPaletteColor(pickObjectColor([]))).toBe(true)
  })

  it('avoids colours already in use', () => {
    const used = OBJECT_PALETTE.slice(0, 47)
    for (let i = 0; i < 20; i += 1) expect(pickObjectColor(used)).toBe(OBJECT_PALETTE[47])
  })

  it('ignores casing and stray whitespace when matching used colours', () => {
    const used = OBJECT_PALETTE.slice(0, 47).map((hex) => ` ${hex.toUpperCase()} `)
    expect(pickObjectColor(used)).toBe(OBJECT_PALETTE[47])
  })

  it('falls back to the full palette once every colour is taken', () => {
    const picked = pickObjectColor(OBJECT_PALETTE)
    expect(isPaletteColor(picked)).toBe(true)
  })

  it('never runs off the end of the candidate list', () => {
    // Math.random() may return values arbitrarily close to 1.
    expect(pickObjectColor([], () => 0.999999999999)).toBe(OBJECT_PALETTE[47])
    expect(pickObjectColor([], () => 0)).toBe(OBJECT_PALETTE[0])
  })

  it('spreads picks across the palette', () => {
    const seen = new Set<string>()
    const used: string[] = []
    for (let i = 0; i < OBJECT_PALETTE.length; i += 1) {
      const hex = pickObjectColor(used)
      expect(seen.has(hex)).toBe(false)
      seen.add(hex)
      used.push(hex)
    }
    expect(seen.size).toBe(OBJECT_PALETTE.length)
  })
})
