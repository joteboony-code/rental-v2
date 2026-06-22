'use server'

import { createClient } from '@/lib/supabase/server'

export type MatchRule =
  | 'unique_single_bill'
  | 'total_all_outstanding'
  | 'single_room_total'
  | 'unique_single_overpay'
  | 'total_all_overpay'
  | 'single_room_overpay'
  | 'ambiguous'
  | 'overpaid'
  | 'no_match'
  | 'no_outstanding'

export type SimBill = {
  billId: string
  roomNumber: string
  billingMonth: string
  dueDate: string | null
  remaining: number
}

export type SimPayEntry = {
  billId: string
  roomNumber: string
  billingMonth: string
  amountToPay: number
}

export type MatchSimResult = {
  matchRule: MatchRule
  canAutoPay: boolean
  billsToPay: SimPayEntry[]
  outstandingBills: SimBill[]
  totalOutstanding: number
  transferAmount: number
  creditAmount: number
  candidates?: { room: string; month: string; remaining: number }[]
  reason: string
}

const OVERPAY_MAX = 10

function billSortKey(b: { due_date?: string | null; billing_month: string }) {
  return b.due_date ?? b.billing_month
}

export async function simulatePaymentMatch(
  tenantId: string,
  amount: number
): Promise<MatchSimResult> {
  const supabase = await createClient()

  // Get all tenant_ids sharing the same line_user_id as this tenant
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('line_user_id')
    .eq('id', tenantId)
    .maybeSingle()

  let allTenantIds: string[] = [tenantId]
  if (tenantRow?.line_user_id) {
    const { data: linked } = await supabase
      .from('tenants')
      .select('id')
      .eq('line_user_id', tenantRow.line_user_id)
    if (linked && linked.length > 0) {
      allTenantIds = linked.map((t) => t.id as string)
    }
  }

  const { data: rawBills } = await supabase
    .from('bills')
    .select('id, tenant_id, total_amount, billing_month, due_date, status, rooms(room_number), payments(amount)')
    .in('tenant_id', allTenantIds)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .order('billing_month', { ascending: true })
    .limit(50)

  type RJ = { room_number: string }
  type PayJ = { amount: number | string }
  type BillRow = {
    id: string; tenant_id: string; total_amount: number | string
    billing_month: string; due_date: string | null; status: string
    rooms: RJ | null; payments: PayJ[] | null
  }

  const outstanding = ((rawBills ?? []) as unknown as BillRow[])
    .map((b) => {
      const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      return {
        id:            b.id,
        tenant_id:     b.tenant_id,
        billing_month: b.billing_month,
        due_date:      b.due_date,
        roomNumber:    (b.rooms as RJ | null)?.room_number ?? '?',
        remainingAmount: Math.max(0, Number(b.total_amount) - paid),
      }
    })
    .filter((b) => b.remainingAmount >= 1)
    .sort((a, b) => billSortKey(a).localeCompare(billSortKey(b)))

  const outstandingBills: SimBill[] = outstanding.map((b) => ({
    billId:       b.id,
    roomNumber:   b.roomNumber,
    billingMonth: b.billing_month,
    dueDate:      b.due_date,
    remaining:    b.remainingAmount,
  }))

  const totalOutstanding = outstanding.reduce((s, b) => s + b.remainingAmount, 0)

  const base: Omit<MatchSimResult, 'matchRule' | 'canAutoPay' | 'billsToPay' | 'creditAmount' | 'reason'> = {
    outstandingBills,
    totalOutstanding,
    transferAmount: amount,
  }

  if (outstanding.length === 0) {
    return { ...base, matchRule: 'no_outstanding', canAutoPay: false, billsToPay: [], creditAmount: 0, reason: 'ไม่มีบิลค้างชำระ' }
  }

  // Pre-compute room groups (needed for cross-rule conflict detection)
  const byRoom = new Map<string, typeof outstanding>()
  for (const b of outstanding) {
    if (!byRoom.has(b.roomNumber)) byRoom.set(b.roomNumber, [])
    byRoom.get(b.roomNumber)!.push(b)
  }
  const roomExact:   { rn: string; bills: typeof outstanding }[] = []
  const roomOverpay: { rn: string; bills: typeof outstanding; over: number }[] = []
  for (const [rn, rBills] of byRoom) {
    const rTotal = rBills.reduce((s, b) => s + b.remainingAmount, 0)
    if (Math.abs(rTotal - amount) < 1) roomExact.push({ rn, bills: rBills })
    const over = amount - rTotal
    if (over > 0 && over <= OVERPAY_MAX) roomOverpay.push({ rn, bills: rBills, over })
  }

  // Rule 1: unique single-bill exact
  const singleMatches = outstanding.filter((b) => Math.abs(b.remainingAmount - amount) < 1)

  // Cross-rule conflict: single-bill match collides with a room total (different bill set)
  // e.g. amount = ห้อง B single bill = ห้อง A (2 bills) total → ambiguous, not auto-pay
  let crossRuleConflict = false
  if (singleMatches.length === 1) {
    const b = singleMatches[0]
    crossRuleConflict =
      (Math.abs(totalOutstanding - amount) < 1 && outstanding.length > 1) ||
      roomExact.some(({ bills }) => !(bills.length === 1 && bills[0].id === b.id))
  }

  if (singleMatches.length === 1 && !crossRuleConflict) {
    const b = singleMatches[0]
    return {
      ...base, matchRule: 'unique_single_bill', canAutoPay: true, creditAmount: 0,
      billsToPay: [{ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: amount }],
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} ตรงกับห้อง ${b.roomNumber} (${new Date(b.billing_month).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}) แบบ unique`,
    }
  }

  // Rule 1b: unique single-bill overpay
  if (singleMatches.length === 0) {
    const overpayMatches = outstanding.filter((b) => {
      const over = amount - b.remainingAmount
      return over > 0 && over <= OVERPAY_MAX
    })
    if (overpayMatches.length === 1) {
      const b = overpayMatches[0]
      const credit = amount - b.remainingAmount
      return {
        ...base, matchRule: 'unique_single_overpay', canAutoPay: true, creditAmount: credit,
        billsToPay: [{ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: b.remainingAmount }],
        reason: `ยอด ฿${amount.toLocaleString('th-TH')} เกินยอดค้างห้อง ${b.roomNumber} อยู่ ฿${credit} → ตัดบิล ฿${b.remainingAmount.toLocaleString('th-TH')} บันทึกเครดิต ฿${credit}`,
      }
    }
  }

  // Rule 2: total all exact
  if (outstanding.length >= 1 && Math.abs(totalOutstanding - amount) < 1) {
    return {
      ...base, matchRule: 'total_all_outstanding', canAutoPay: true, creditAmount: 0,
      billsToPay: outstanding.map((b) => ({ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: b.remainingAmount })),
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} ตรงกับยอดค้างรวมทุกห้อง (${outstanding.length} บิล)`,
    }
  }

  // Rule 2b: total all overpay
  const overAll = amount - totalOutstanding
  if (outstanding.length >= 1 && overAll > 0 && overAll <= OVERPAY_MAX) {
    return {
      ...base, matchRule: 'total_all_overpay', canAutoPay: true, creditAmount: overAll,
      billsToPay: outstanding.map((b) => ({ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: b.remainingAmount })),
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} เกินยอดค้างรวม ฿${totalOutstanding.toLocaleString('th-TH')} อยู่ ฿${overAll} → ตัดทุกบิล บันทึกเครดิต ฿${overAll}`,
    }
  }

  // Rule 3: room total exact
  if (roomExact.length === 1) {
    const { rn, bills: rBills } = roomExact[0]
    return {
      ...base, matchRule: 'single_room_total', canAutoPay: true, creditAmount: 0,
      billsToPay: rBills.map((b) => ({ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: b.remainingAmount })),
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} ตรงกับยอดค้างรวมห้อง ${rn} แบบ unique`,
    }
  }

  // Rule 3b: room total overpay
  if (roomExact.length === 0 && roomOverpay.length === 1) {
    const { rn, bills: rBills, over } = roomOverpay[0]
    const rOut = rBills.reduce((s, b) => s + b.remainingAmount, 0)
    return {
      ...base, matchRule: 'single_room_overpay', canAutoPay: true, creditAmount: over,
      billsToPay: rBills.map((b) => ({ billId: b.id, roomNumber: b.roomNumber, billingMonth: b.billing_month, amountToPay: b.remainingAmount })),
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} เกินยอดค้างห้อง ${rn} (฿${rOut.toLocaleString('th-TH')}) อยู่ ฿${over} → บันทึกเครดิต ฿${over}`,
    }
  }

  // Rule 4: ambiguous (within-rule + cross-rule)
  const isAmbiguous = singleMatches.length > 1 || roomExact.length > 1 || crossRuleConflict
  if (isAmbiguous) {
    let candidates: { room: string; month: string; remaining: number }[]
    if (crossRuleConflict) {
      const seen = new Set<string>()
      const parts: typeof outstanding = []
      for (const b of [...singleMatches, ...roomExact.flatMap((m) => m.bills)]) {
        if (!seen.has(b.id)) { seen.add(b.id); parts.push(b) }
      }
      candidates = parts.map((b) => ({ room: b.roomNumber, month: b.billing_month, remaining: b.remainingAmount }))
    } else {
      candidates = (singleMatches.length > 1 ? singleMatches : roomExact.flatMap((m) => m.bills))
        .map((b) => ({ room: b.roomNumber, month: b.billing_month, remaining: b.remainingAmount }))
    }
    return {
      ...base, matchRule: 'ambiguous', canAutoPay: false, billsToPay: [], creditAmount: 0, candidates,
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} ตรงกับหลายบิล ต้องให้เจ้าของเลือกเอง`,
    }
  }

  // Overpay too large
  if (totalOutstanding > 0 && amount > totalOutstanding + OVERPAY_MAX) {
    return {
      ...base, matchRule: 'overpaid', canAutoPay: false, billsToPay: [], creditAmount: 0,
      reason: `ยอด ฿${amount.toLocaleString('th-TH')} เกินยอดค้างรวม ฿${totalOutstanding.toLocaleString('th-TH')} มากเกินไป (เกิน ฿${(amount - totalOutstanding).toLocaleString('th-TH')})`,
    }
  }

  return {
    ...base, matchRule: 'no_match', canAutoPay: false, billsToPay: [], creditAmount: 0,
    reason: `ไม่พบบิลที่ยอดตรงกัน (ค้างรวม ฿${totalOutstanding.toLocaleString('th-TH')})`,
  }
}

export async function getTenantsForMatchTest() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contracts')
    .select('tenant_id, tenants(full_name, line_user_id), rooms(room_number)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  type Row = { tenant_id: string; tenants: { full_name: string; line_user_id: string | null } | null; rooms: { room_number: string } | null }
  const seen = new Set<string>()
  const out: { id: string; full_name: string; room_number: string; has_line: boolean }[] = []
  for (const r of ((data ?? []) as unknown as Row[])) {
    if (seen.has(r.tenant_id)) continue
    seen.add(r.tenant_id)
    out.push({
      id:          r.tenant_id,
      full_name:   r.tenants?.full_name ?? '—',
      room_number: r.rooms?.room_number ?? '—',
      has_line:    Boolean(r.tenants?.line_user_id),
    })
  }
  return out.sort((a, b) => (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0))
}
