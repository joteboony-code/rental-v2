export type CompletionBill = {
  room_id: string | null
  status: string
  total_amount: number | string | null
  payments: Array<{ amount: number | string | null }> | null
}

export type BillingCompletion = {
  complete: boolean
  reason: 'complete' | 'no_occupied_rooms' | 'missing_bills' | 'unpaid_bills'
  occupiedRooms: number
  billedRooms: number
  activeBills: number
  unpaidBills: number
}

export function evaluateBillingCompletion(
  occupiedRoomIds: string[],
  bills: CompletionBill[]
): BillingCompletion {
  const occupiedRooms = new Set(occupiedRoomIds)
  const activeBills = bills.filter((bill) => bill.status !== 'cancelled')
  const billedRooms = new Set(
    activeBills
      .map((bill) => bill.room_id)
      .filter((roomId): roomId is string => !!roomId)
  )
  const unpaidBills = activeBills.filter((bill) => {
    const paid = (bill.payments ?? []).reduce(
      (total, payment) => total + Number(payment.amount ?? 0),
      0
    )
    return paid + 0.01 < Number(bill.total_amount ?? 0)
  }).length

  const base = {
    occupiedRooms: occupiedRooms.size,
    billedRooms: billedRooms.size,
    activeBills: activeBills.length,
    unpaidBills,
  }

  if (occupiedRooms.size === 0) {
    return { ...base, complete: false, reason: 'no_occupied_rooms' }
  }

  const hasEveryOccupiedRoom = [...occupiedRooms].every((roomId) => billedRooms.has(roomId))
  if (!hasEveryOccupiedRoom) {
    return { ...base, complete: false, reason: 'missing_bills' }
  }

  if (unpaidBills > 0) {
    return { ...base, complete: false, reason: 'unpaid_bills' }
  }

  return { ...base, complete: true, reason: 'complete' }
}

export function completedMonthMarkerKey(billingMonth: string): string {
  const month = billingMonth.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid billing month')
  return `rental-v2-state/completed-months/${month}.json`
}
