import { describe, expect, it } from 'vitest'
import { formatMeterReadingLines } from './meter-message'

describe('formatMeterReadingLines', () => {
  it('formats water and electricity readings', () => {
    expect(formatMeterReadingLines({
      water_prev: 120,
      water_curr: 125,
      water_units: 5,
      electricity_prev: 1000,
      electricity_curr: 1085,
      electricity_units: 85,
    })).toEqual([
      '💧 น้ำ: 120 → 125 = 5 หน่วย',
      '⚡ ไฟ: 1,000 → 1,085 = 85 หน่วย',
    ])
  })

  it('calculates units when recorded units are missing', () => {
    expect(formatMeterReadingLines({
      water_prev: 10,
      water_curr: 13.5,
      water_units: null,
      electricity_prev: null,
      electricity_curr: null,
      electricity_units: null,
    })).toEqual(['💧 น้ำ: 10 → 13.5 = 3.5 หน่วย'])
  })

  it('omits meter details when readings are unavailable', () => {
    expect(formatMeterReadingLines(null)).toEqual([])
  })
})
