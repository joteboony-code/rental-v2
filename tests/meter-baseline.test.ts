import { describe, expect, it } from 'vitest'
import { isMeterBaselineReason, normalizeBillingMonth, resolveMeterBaseline } from '@/lib/meter-baseline'

describe('meter baseline helpers', () => {
  it('normalizes valid billing months and rejects invalid values', () => {
    expect(normalizeBillingMonth('2026-08')).toBe('2026-08-01')
    expect(normalizeBillingMonth('2026-08-01')).toBe('2026-08-01')
    expect(normalizeBillingMonth('2026-13')).toBeNull()
    expect(normalizeBillingMonth('not-a-month')).toBeNull()
  })

  it('uses the previous reading when there is no adjustment', () => {
    expect(resolveMeterBaseline(1596, 12543, null)).toEqual({
      water: 1596,
      electricity: 12543,
      adjusted: false,
      adjustmentId: null,
      reason: null,
    })
  })

  it('uses the adjustment for room 20 after repair', () => {
    expect(resolveMeterBaseline(1596, 12543, {
      id: 'adjustment-20',
      water_baseline: 1601,
      electricity_baseline: 12553,
      reason_code: 'repair',
      reason_note: 'ช่างใช้ระหว่างซ่อมห้อง',
    })).toEqual({
      water: 1601,
      electricity: 12553,
      adjusted: true,
      adjustmentId: 'adjustment-20',
      reason: 'ซ่อมห้อง',
    })
  })

  it('accepts only supported reason codes', () => {
    expect(isMeterBaselineReason('meter_replaced')).toBe(true)
    expect(isMeterBaselineReason('unknown')).toBe(false)
  })
})
