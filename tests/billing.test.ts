import { describe, expect, it } from 'vitest'
import { dueDateForBillingMonth, prorateRent } from '@/lib/billing'

describe('billing calculations', () => {
  it('moves December bills into January of the next year', () => {
    expect(dueDateForBillingMonth('2026-12', 10)).toBe('2027-01-10')
  })

  it('rejects invalid billing inputs', () => {
    expect(() => dueDateForBillingMonth('2026-13', 10)).toThrow()
    expect(() => dueDateForBillingMonth('2026-01', 31)).toThrow()
  })

  it('prorates the first month using the actual number of days', () => {
    expect(prorateRent(3100, '2026-07', '2026-07-16')).toBe(1600)
    expect(prorateRent(3100, '2026-07', '2026-06-16')).toBe(3100)
  })
})
