import { describe, expect, it } from 'vitest'
import {
  completedMonthMarkerKey,
  evaluateBillingCompletion,
  type CompletionBill,
} from '@/lib/backup-completion'

const bill = (
  roomId: string,
  total: number,
  payments: number[],
  status = 'pending'
): CompletionBill => ({
  room_id: roomId,
  status,
  total_amount: total,
  payments: payments.map((amount) => ({ amount })),
})

describe('billing completion backup trigger', () => {
  it('completes when every occupied room has a fully paid bill', () => {
    const result = evaluateBillingCompletion(
      ['room-1', 'room-2'],
      [bill('room-1', 3_000, [1_000, 2_000]), bill('room-2', 3_200, [3_200], 'paid')]
    )

    expect(result).toMatchObject({ complete: true, reason: 'complete', unpaidBills: 0 })
  })

  it('waits when an occupied room has no bill', () => {
    const result = evaluateBillingCompletion(
      ['room-1', 'room-2'],
      [bill('room-1', 3_000, [3_000])]
    )

    expect(result).toMatchObject({ complete: false, reason: 'missing_bills' })
  })

  it('waits while any active bill still has a balance', () => {
    const result = evaluateBillingCompletion(
      ['room-1', 'room-2'],
      [bill('room-1', 3_000, [3_000]), bill('room-2', 3_200, [3_000])]
    )

    expect(result).toMatchObject({ complete: false, reason: 'unpaid_bills', unpaidBills: 1 })
  })

  it('ignores cancelled bills and creates a stable monthly marker', () => {
    const result = evaluateBillingCompletion(
      ['room-1'],
      [bill('room-1', 3_000, [3_000]), bill('vacant-room', 3_000, [], 'cancelled')]
    )

    expect(result.complete).toBe(true)
    expect(completedMonthMarkerKey('2026-07-01')).toBe(
      'rental-v2-state/completed-months/2026-07.json'
    )
  })
})
