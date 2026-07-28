/**
 * Colour helpers. Border colours are derived perceptually (OKLCH lightness
 * reduction) so that they stay clearly darker than the fill while keeping the
 * same hue. Grid contrast is picked from relative luminance / contrast ratio.
 */

export type Rgb = { r: number; g: number; b: number } // 0..1

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export type Oklch = { l: number; c: number; h: number }

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(a * a + bb * bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const L = l_ * l_ * l_
  const M = m_ * m_ * m_
  const S = s_ * s_ * s_

  return {
    r: clamp01(linearToSrgb(+4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)),
    g: clamp01(linearToSrgb(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)),
    b: clamp01(linearToSrgb(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)),
  }
}

/**
 * Derive an object border colour from its fill: clearly darker, same hue.
 * Falls back to a linear RGB darkening if the fill cannot be parsed.
 */
export function deriveBorderColor(fillHex: string): string {
  const rgb = parseHex(fillHex)
  if (!rgb) return '#333333'
  const oklch = rgbToOklch(rgb)
  // Reduce lightness proportionally, with an absolute floor of contrast for
  // very dark fills where a relative reduction would be invisible.
  const target = oklch.l > 0.28 ? Math.max(0, oklch.l - Math.max(0.16, oklch.l * 0.32)) : oklch.l + 0.2
  const chroma = oklch.c * (target > oklch.l ? 1 : 1.05)
  return toHex(oklchToRgb({ l: clamp01(target), c: chroma, h: oklch.h }))
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 1
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b)
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Pick black or white for lines drawn on top of `backgroundHex`, based on the
 * computed contrast ratio rather than a hard-coded lightness threshold.
 */
export function contrastLineColor(backgroundHex: string): '#000000' | '#ffffff' {
  return contrastRatio('#000000', backgroundHex) >= contrastRatio('#ffffff', backgroundHex)
    ? '#000000'
    : '#ffffff'
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

export function normaliseHex(value: string): string | null {
  const rgb = parseHex(value)
  return rgb ? toHex(rgb) : null
}
