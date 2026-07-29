import type { Unit } from '@/models/project'
import { UNIT_FACTOR, formatNumber, roundMm } from '@/utils/units'

/**
 * Ruler ticks.
 *
 * The interval is picked so labelled ticks never crowd together and never drift
 * apart: the smallest "nice" step whose on-screen spacing clears
 * `MIN_MAJOR_PX` wins. Nice steps walk the 1-2-5 ladder *in the display unit*
 * (…, 1, 2, 5, 10, 20, 50, …), so the numbers stay round however far the user
 * zooms — 1, 2, 5, 10 cm rather than 13,7 cm.
 *
 * Each major step is subdivided into unlabelled minor ticks, but only while
 * those stay at least `MIN_MINOR_PX` apart; below that they are dropped instead
 * of turning the ruler into a grey band.
 */

/** Smallest allowed spacing between two labelled ticks, in screen pixels. */
export const MIN_MAJOR_PX = 68
/**
 * Smallest allowed spacing between two unlabelled ticks, in screen pixels. With
 * the current major threshold the subdivision always clears it comfortably;
 * the floor is what keeps that true if the major threshold is ever lowered.
 */
export const MIN_MINOR_PX = 6

const LADDER = [1, 2, 5]

/**
 * Smallest 1-2-5 step, expressed in millimetres, whose screen spacing is at
 * least `minPx`. `scale` is pixels per millimetre.
 */
export function niceStepMm(minPx: number, scale: number, unit: Unit): number {
  const perUnit = UNIT_FACTOR[unit]
  if (!Number.isFinite(scale) || scale <= 0) return perUnit
  // Where on the ladder the wanted spacing lands, in display units.
  const wanted = minPx / (scale * perUnit)
  if (!Number.isFinite(wanted) || wanted <= 0) return perUnit
  const decade = Math.floor(Math.log10(wanted))
  for (let d = decade; d < decade + 4; d += 1) {
    const magnitude = Math.pow(10, d)
    for (const factor of LADDER) {
      const step = factor * magnitude
      if (step >= wanted - 1e-12) return roundMm(step * perUnit)
    }
  }
  return roundMm(Math.pow(10, decade + 4) * perUnit)
}

/**
 * How many minor ticks a major step is divided into. A step of 1 or 5 splits in
 * five, a step of 2 in four, so every subdivision is itself a round number.
 */
export function minorDivisions(stepMm: number, unit: Unit): number {
  const inUnit = stepMm / UNIT_FACTOR[unit]
  if (!Number.isFinite(inUnit) || inUnit <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(inUnit) + 1e-9))
  const leading = Math.round(inUnit / magnitude)
  return leading === 2 ? 4 : 5
}

export type RulerTick = {
  /** Position along the axis, in model millimetres. */
  posMm: number
  major: boolean
  /** Only set on major ticks. */
  label?: string
}

export type RulerScale = {
  stepMm: number
  minorStepMm: number | null
  ticks: RulerTick[]
}

export type RulerInput = {
  /** Visible model range along the axis, in millimetres. */
  fromMm: number
  toMm: number
  /** Pixels per millimetre. */
  scale: number
  unit: Unit
  /** Model position the ruler reads as zero. Defaults to the surface origin. */
  originMm?: number
}

/**
 * Every tick to draw for one ruler, ordered from `fromMm` to `toMm`.
 *
 * Ticks are laid out relative to the origin, not to the surface, so the zero
 * mark is always a labelled tick and every label stays a round number wherever
 * the user drags the origin to.
 */
export function rulerScale({ fromMm, toMm, scale, unit, originMm = 0 }: RulerInput): RulerScale {
  const empty: RulerScale = { stepMm: 0, minorStepMm: null, ticks: [] }
  if (!Number.isFinite(fromMm) || !Number.isFinite(toMm) || toMm <= fromMm) return empty
  if (!Number.isFinite(scale) || scale <= 0) return empty
  const origin = Number.isFinite(originMm) ? originMm : 0

  const stepMm = niceStepMm(MIN_MAJOR_PX, scale, unit)
  if (stepMm <= 0) return empty

  const divisions = minorDivisions(stepMm, unit)
  const minorCandidate = stepMm / divisions
  const minorStepMm = minorCandidate * scale >= MIN_MINOR_PX ? roundMm(minorCandidate) : null
  const tickStep = minorStepMm ?? stepMm

  // A very wide range at a very small scale must never produce a runaway list.
  const count = Math.floor((toMm - fromMm) / tickStep) + 2
  if (count > 4000) return empty

  const ticks: RulerTick[] = []
  const first = Math.ceil((fromMm - origin) / tickStep - 1e-9)
  for (let i = 0; i < count; i += 1) {
    const offsetMm = (first + i) * tickStep
    const posMm = roundMm(origin + offsetMm)
    if (posMm > toMm + 1e-9) break
    const ratio = offsetMm / stepMm
    const major = Math.abs(ratio - Math.round(ratio)) < 1e-6
    ticks.push(major ? { posMm, major, label: formatNumber(roundMm(offsetMm), unit) } : { posMm, major })
  }
  return { stepMm, minorStepMm, ticks }
}
