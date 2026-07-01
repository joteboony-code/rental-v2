import { describe, expect, it } from 'vitest'
import { bangkokDateKey, dateKeyInTimeZone } from '@/lib/date-utils'

describe('business date utilities', () => {
  it('uses the Bangkok calendar day across the UTC boundary', () => {
    const instant = new Date('2026-06-30T18:30:00.000Z')
    expect(bangkokDateKey(instant)).toBe('2026-07-01')
    expect(dateKeyInTimeZone(instant, 'UTC')).toBe('2026-06-30')
  })
})
