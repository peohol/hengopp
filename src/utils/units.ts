import type { Unit } from '@/models/project'

/**
 * The internal unit is always millimetres. Everything the user sees is derived
 * through these helpers, so switching display unit never touches geometry.
 */

/** Millimetres per display unit. */
export const UNIT_FACTOR: Record<Unit, number> = { mm: 1, cm: 10 }

export const UNIT_LABEL: Record<Unit, string> = { mm: 'mm', cm: 'cm' }

/** Quantisation used to keep floating point noise out of stored geometry. */
const MM_PRECISION = 1e4

/** Round a millimetre value to the internal precision (0.0001 mm). */
export function roundMm(valueMm: number): number {
  if (!Number.isFinite(valueMm)) return valueMm
  const r = Math.round(valueMm * MM_PRECISION) / MM_PRECISION
  // Avoid "-0" leaking into the model.
  return Object.is(r, -0) ? 0 : r
}

export function mmToUnit(valueMm: number, unit: Unit): number {
  return roundTo(valueMm / UNIT_FACTOR[unit], 6)
}

export function unitToMm(value: number, unit: Unit): number {
  return roundMm(value * UNIT_FACTOR[unit])
}

export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  const r = Math.round(value * f) / f
  return Object.is(r, -0) ? 0 : r
}

/** Round a millimetre value to the nearest multiple of `stepMm`. */
export function roundToStep(valueMm: number, stepMm: number): number {
  if (!Number.isFinite(stepMm) || stepMm <= 0) return roundMm(valueMm)
  return roundMm(Math.round(valueMm / stepMm) * stepMm)
}

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

/**
 * Parse user input. Accepts both "," and "." as decimal separator, tolerates
 * surrounding whitespace, a leading "+" and a trailing unit suffix.
 */
export function parseNumberInput(raw: string): ParseResult {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return { ok: false, error: 'Feltet kan ikke være tomt' }
  const cleaned = trimmed
    .replace(/\s+/g, '')
    .replace(/(mm|cm)$/i, '')
    .replace(',', '.')
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) {
    return { ok: false, error: 'Skriv et tall, for eksempel 12,5' }
  }
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return { ok: false, error: 'Skriv et tall, for eksempel 12,5' }
  return { ok: true, value }
}

/** Parse a length written in `unit` and return millimetres. */
export function parseLengthToMm(raw: string, unit: Unit): ParseResult {
  const parsed = parseNumberInput(raw)
  if (!parsed.ok) return parsed
  return { ok: true, value: unitToMm(parsed.value, unit) }
}

/** Parse a strictly positive length (width/height). */
export function parsePositiveLengthToMm(raw: string, unit: Unit): ParseResult {
  const parsed = parseLengthToMm(raw, unit)
  if (!parsed.ok) return parsed
  if (parsed.value <= 0) return { ok: false, error: 'Må være større enn 0' }
  return parsed
}

const MAX_DECIMALS: Record<Unit, number> = { mm: 1, cm: 2 }

/** Format a millimetre value for display in the given unit, without a suffix. */
export function formatNumber(valueMm: number, unit: Unit, maxDecimals = MAX_DECIMALS[unit]): string {
  const v = roundTo(mmToUnit(valueMm, unit), maxDecimals)
  const fixed = v.toFixed(maxDecimals)
  const trimmed = maxDecimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed
  return (trimmed === '' || trimmed === '-0' ? '0' : trimmed).replace('.', ',')
}

/** Format a millimetre value with its unit suffix, e.g. "12,5 cm". */
export function formatLength(valueMm: number, unit: Unit): string {
  return `${formatNumber(valueMm, unit)} ${UNIT_LABEL[unit]}`
}

/** Format a plain (unitless) number using Norwegian decimal comma. */
export function formatPlain(value: number, maxDecimals = 3): string {
  const v = roundTo(value, maxDecimals)
  return String(v).replace('.', ',')
}

/** Movement step presets per display unit, expressed in millimetres. */
export const STEP_PRESETS: Record<Unit, number[]> = {
  cm: [1, 5, 10, 50, 100],
  mm: [1, 5, 10, 50, 100],
}
