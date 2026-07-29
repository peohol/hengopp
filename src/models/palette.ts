/**
 * The fixed object palette: 12 hues × 4 brightness levels, all at the same
 * saturation. A closed set of colours keeps the drawings visually coherent —
 * every object in a project comes from the same family — while still offering
 * enough variation for the vast majority of layouts.
 */

import { hslToHex } from '@/utils/colors'

export const PALETTE_HUE_COUNT = 12
export const PALETTE_LEVEL_COUNT = 4

/** Every swatch shares this saturation, which is what ties the palette together. */
export const PALETTE_SATURATION = 0.4

/**
 * Brightness levels, light to dark. Deliberately kept away from 0 and 1: pure
 * black and white are not part of the palette.
 */
export const PALETTE_LIGHTNESS = [0.82, 0.66, 0.5, 0.34] as const

/** Hue for a column, evenly spaced around the colour wheel. */
export function paletteHue(column: number): number {
  return (column * 360) / PALETTE_HUE_COUNT
}

export function paletteColor(column: number, row: number): string {
  return hslToHex(paletteHue(column), PALETTE_SATURATION, PALETTE_LIGHTNESS[row])
}

/**
 * All palette colours in grid order: row-major, so the first
 * `PALETTE_HUE_COUNT` entries make up the lightest row.
 */
export const OBJECT_PALETTE: string[] = PALETTE_LIGHTNESS.flatMap((_, row) =>
  Array.from({ length: PALETTE_HUE_COUNT }, (_, column) => paletteColor(column, row)),
)

export function isPaletteColor(hex: string): boolean {
  return OBJECT_PALETTE.includes(hex.trim().toLowerCase())
}

/**
 * Pick a colour for a new object: a random palette entry that no existing
 * object uses, so a project ends up varied without the user having to think
 * about it. Once every colour is taken we simply start over from the full
 * palette — the user can always override the choice by hand anyway.
 */
export function pickObjectColor(
  usedColors: Iterable<string> = [],
  random: () => number = Math.random,
): string {
  const used = new Set<string>()
  for (const c of usedColors) used.add(c.trim().toLowerCase())
  const free = OBJECT_PALETTE.filter((hex) => !used.has(hex))
  const candidates = free.length > 0 ? free : OBJECT_PALETTE
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
  return candidates[index]
}
