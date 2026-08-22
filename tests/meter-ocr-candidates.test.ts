import { describe, expect, it } from 'vitest'
import { extractMeterCandidates } from '@/supabase/functions/_shared/meter-candidates'

describe('extractMeterCandidates', () => {
  it('returns at most three plausible readings without values below the previous reading', () => {
    const result = extractMeterCandidates('12553\n1255\n12554\n999', 12543)
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result).toContain(12553)
    expect(result.every((value) => value >= 12543)).toBe(true)
  })

  it('offers the integer reading when Vision includes a red decimal digit', () => {
    expect(extractMeterCandidates('12553.1 kWh', 12543)).toContain(12553)
  })

  it('normalizes a common OCR letter O into zero', () => {
    expect(extractMeterCandidates('16O1 m3', 1597)).toContain(1601)
  })

  it('returns no suggestion when nothing plausible is found', () => {
    expect(extractMeterCandidates('MISAKI kWh', 12543)).toEqual([])
  })
})
