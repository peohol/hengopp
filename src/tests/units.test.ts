import { describe, expect, it } from 'vitest'
import {
  formatLength,
  formatNumber,
  mmToUnit,
  parseLengthToMm,
  parseNumberInput,
  parsePositiveLengthToMm,
  roundMm,
  roundToStep,
  unitToMm,
} from '@/utils/units'

describe('unit conversion', () => {
  it('converts cm to mm', () => {
    expect(unitToMm(12.3, 'cm')).toBe(123)
    expect(unitToMm(0.1, 'cm')).toBe(1)
    expect(unitToMm(250, 'cm')).toBe(2500)
  })

  it('converts mm to cm', () => {
    expect(mmToUnit(123, 'cm')).toBe(12.3)
    expect(mmToUnit(1, 'cm')).toBe(0.1)
  })

  it('is identity for mm', () => {
    expect(unitToMm(37.5, 'mm')).toBe(37.5)
    expect(mmToUnit(37.5, 'mm')).toBe(37.5)
  })

  it('round-trips without floating point drift', () => {
    for (const cm of [0.1, 0.3, 1.1, 2.7, 12.3, 99.9, 1234.5]) {
      expect(mmToUnit(unitToMm(cm, 'cm'), 'cm')).toBe(cm)
    }
    // Repeated conversions must not accumulate error.
    let mm = 123
    for (let i = 0; i < 200; i += 1) mm = unitToMm(mmToUnit(mm, 'cm'), 'cm')
    expect(mm).toBe(123)
  })

  it('accumulates additions without drift', () => {
    let mm = 0
    for (let i = 0; i < 1000; i += 1) mm = roundMm(mm + 0.1)
    expect(mm).toBe(100)
  })
})

describe('parsing user input', () => {
  it('accepts comma as decimal separator', () => {
    expect(parseNumberInput('12,5')).toEqual({ ok: true, value: 12.5 })
    expect(parseNumberInput('12.5')).toEqual({ ok: true, value: 12.5 })
    expect(parseLengthToMm('12,5', 'cm')).toEqual({ ok: true, value: 125 })
  })

  it('tolerates whitespace, plus signs and unit suffixes', () => {
    expect(parseNumberInput('  +7,25 ')).toEqual({ ok: true, value: 7.25 })
    expect(parseLengthToMm('30 cm', 'cm')).toEqual({ ok: true, value: 300 })
    expect(parseNumberInput('-4')).toEqual({ ok: true, value: -4 })
  })

  it('rejects invalid input', () => {
    expect(parseNumberInput('').ok).toBe(false)
    expect(parseNumberInput('abc').ok).toBe(false)
    expect(parseNumberInput('1,2,3').ok).toBe(false)
    expect(parseNumberInput('12px').ok).toBe(false)
  })

  it('rejects non-positive widths and heights', () => {
    expect(parsePositiveLengthToMm('0', 'cm').ok).toBe(false)
    expect(parsePositiveLengthToMm('-5', 'cm').ok).toBe(false)
    expect(parsePositiveLengthToMm('0,1', 'cm')).toEqual({ ok: true, value: 1 })
  })
})

describe('rounding to the movement step', () => {
  it('rounds to the nearest multiple', () => {
    expect(roundToStep(123, 10)).toBe(120)
    expect(roundToStep(126, 10)).toBe(130)
    expect(roundToStep(7, 5)).toBe(5)
    expect(roundToStep(7.5, 5)).toBe(10)
    expect(roundToStep(-12, 5)).toBe(-10)
  })

  it('leaves the value alone for a non-positive step', () => {
    expect(roundToStep(123.456, 0)).toBe(123.456)
  })

  it('does not introduce floating point noise', () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3)
    expect(roundToStep(12.299999999, 0.1)).toBe(12.3)
  })
})

describe('formatting', () => {
  it('avoids unnecessary decimals', () => {
    expect(formatNumber(1000, 'cm')).toBe('100')
    expect(formatNumber(1005, 'cm')).toBe('100,5')
    expect(formatNumber(1000, 'mm')).toBe('1000')
    expect(formatLength(125, 'cm')).toBe('12,5 cm')
    expect(formatLength(125, 'mm')).toBe('125 mm')
  })

  it('never renders negative zero', () => {
    expect(formatNumber(-0, 'cm')).toBe('0')
    expect(roundMm(-0.00001)).toBe(0)
  })
})
