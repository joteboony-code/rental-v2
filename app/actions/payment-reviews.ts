'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendPaymentReceiptNotification } from '@/lib/line-notify'
import { logAudit } from './audit'
import { getAuthedUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

const VALID_PAYMENT_METHODS = ['cash', 'transfer', 'promptpay'] as const
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number]
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function getAuthorizedContractIds(
  supabase: SupabaseServerClient,
  lineUserId: string | null,
  fallbackTenantId?: string | null
): Promise<string[]> {
  const ids = new Set<string>()

  if (lineUserId) {
    const [{ data: dedicated }, { data: linkedTenants }] = await Promise.all([
      supabase
        .from('contracts')
        .select('id')
        .eq('status', 'active')
        .eq('line_recipient_user_id', lineUserId),
      supabase.from('tenants').select('id').eq('line_user_id', lineUserId),
    ])
    for (const contract of dedicated ?? []) ids.add(contract.id)

    const tenantIds = (linkedTenants ?? []).map((tenant) => tenant.id)
    if (tenantIds.length > 0) {
      const { data: fallback } = await supabase
        .from('contracts')
        .select('id')
        .in('tenant_id', tenantIds)
        .eq('status', 'active')
        .is('line_recipient_user_id', null)
      for (const contract of fallback ?? []) ids.add(contract.id)
    }
  }

  if (ids.size === 0 && fallbackTenantId) {
    const { data: fallback } = await supabase
      .from('contracts')
      .select('id')
      .eq('tenant_id', fallbackTenantId)
      .eq('status', 'active')
    for (const contract of fallback ?? []) ids.add(contract.id)
  }

  return [...ids]
}
function sanitizePaymentMethod(raw: string): PaymentMethod {
  return (VALID_PAYMENT_METHODS as readonly string[]).includes(raw) ? (raw as PaymentMethod) : 'transfer'
}

export type PendingSlip = {
  id: string
  tenant_id: string | null
  room_id: string | null
  line_user_id: string | null
  source: string
  slip_url: string | null
  amount: number | null
  paid_at: string | null
  slip_ref: string | null
  sender_name: string | null
  slipok_status: string
  slipok_code: number | null
  slipok_message: string | null
  match_candidates: unknown
  match_rule: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  tenants: { full_name: string; phone: string | null } | null
  rooms: { room_number: string; floor: number | null } | null
}

export type OutstandingBill = {
  id: string
  billing_month: string
  due_date: string | null
  total_amount: number
  remaining: number
  status: string
  room_number: string
}

export async function getPendingSlips(): Promise<PendingSlip[]> {
  if (!(await getAuthedUser())) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('pending_slips')
    .select('*, tenants(full_name, phone), rooms(room_number, floor)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PendingSlip[]
}

export async function getPendingSlip(id: string): Promise<PendingSlip | null> {
  if (!(await getAuthedUser())) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('pending_slips')
    .select('*, tenants(id, full_name, phone, line_user_id), rooms(id, room_number, floor)')
    .eq('id', id)
    .single()
  return data as unknown as PendingSlip | null
}

export async function getTenantOutstandingBills(lineUserId: string | null, fallbackTenantId?: string | null): Promise<OutstandingBill[]> {
  if (!(await getAuthedUser())) return []
  const supabase = await createClient()

  const contractIds = await getAuthorizedContractIds(supabase, lineUserId, fallbackTenantId)
  if (contractIds.length === 0) return []

  const { data } = await supabase
    .from('bills')
    .select('id, billing_month, due_date, total_amount, status, rooms(room_number), payments(amount)')
    .in('contract_id', contractIds)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .order('billing_month', { ascending: true })

  type Row = {
    id: string
    billing_month: string
    due_date: string | null
    total_amount: number
    status: string
    rooms: { room_number: string } | null
    payments: { amount: number }[] | null
  }

  return ((data ?? []) as unknown as Row[])
    .map((b) => {
      const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.max(0, Number(b.total_amount) - paid)
      return {
        id: b.id,
        billing_month: b.billing_month,
        due_date: b.due_date,
        total_amount: Number(b.total_amount),
        remaining,
        status: b.status,
        room_number: (b.rooms as { room_number: string } | null)?.room_number ?? '—',
      }
    })
    .filter((b) => b.remaining >= 1)
}

export async function approveSlip(
  slipId: string,
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  const billId = String(formData.get('bill_id') ?? '').trim()
  const amount = Number(formData.get('amount'))
  const paymentMethod = sanitizePaymentMethod(String(formData.get('payment_method') ?? 'transfer'))
  const paidAt = String(formData.get('paid_at') ?? new Date().toISOString())
  const note = String(formData.get('note') ?? '').trim() || null

  if (!billId) return { success: false, message: 'กรุณาเลือกบิล' }
  if (!amount || amount <= 0) return { success: false, message: 'กรุณาระบุจำนวนเงิน' }

  const { data, error } = await createServiceClient().rpc('admin_approve_pending_slip', {
    p_slip_id: slipId,
    p_bill_id: billId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_paid_at: paidAt,
    p_note: note,
    p_reviewed_by: user.id,
  })
  if (error || !data) {
    const detail = error?.message ?? 'ไม่สามารถอนุมัติสลิปได้'
    return { success: false, message: detail.includes('exceeds') ? 'ยอดเงินเกินยอดค้างชำระ' : detail }
  }
  const meta = data as { payment_id: string; tenant_id: string; room_id: string | null; slip_ref: string | null }
  await updateBillStatusAndNotify(supabase, billId)

  logAudit({
    action: 'slip_approve',
    entityType: 'pending_slip',
    entityId: slipId,
    tenantId: meta?.tenant_id ?? null,
    roomId: meta?.room_id ?? null,
    newValue: {
      payment_id: meta.payment_id,
      amount,
      bill_id: billId,
      tenant_id: meta?.tenant_id ?? null,
      room_id: meta?.room_id ?? null,
      slip_ref: meta.slip_ref,
    },
    description: `อนุมัติสลิป ฿${amount.toLocaleString('th-TH')} → บิล ${billId}`,
  }).catch(() => {})

  revalidatePath('/payment-reviews')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills')
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')

  return { success: true, message: 'อนุมัติสลิปและบันทึกการชำระเงินแล้ว' }
}

export async function approveSlipOldestFirst(
  slipId: string,
  tenantId: string,
  amount: number,
  paidAt: string,
  paymentMethod: string,
  note: string | null,
  lineUserId?: string | null
): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

  if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'จำนวนเงินไม่ถูกต้อง' }
  if (amount > 1_000_000) return { success: false, message: 'จำนวนเงินสูงเกินไป กรุณาตรวจสอบ' }

  const { data, error } = await createServiceClient().rpc('admin_approve_slip_oldest_first', {
    p_slip_id: slipId, p_tenant_id: tenantId, p_line_user_id: lineUserId ?? null,
    p_amount: amount, p_paid_at: paidAt, p_payment_method: sanitizePaymentMethod(paymentMethod),
    p_note: note, p_reviewed_by: user.id,
  })
  if (error || !Array.isArray(data)) {
    return { success: false, message: error?.code === '23505' ? 'สลิปนี้บันทึกไปแล้ว'
      : error?.message.includes('exceeds') ? 'ยอดเงินเกินยอดค้างชำระ กรุณาตรวจสอบยอดก่อนอนุมัติ'
      : 'อนุมัติไม่สำเร็จ กรุณาตรวจสอบรายการแล้วลองใหม่' }
  }
  const applied = data as { payment_id: string; bill_id: string; room_id: string | null; amount: number; total_paid: number; total_amount: number }[]
  const appliedCount = applied.length
  for (const item of applied) {
    await sendPaymentReceiptNotification(item.bill_id, Number(item.total_paid), Number(item.total_amount))
      .catch((err) => console.error('[payment-reviews] Receipt notification failed', err))
  }
  await logAudit({ action: 'slip_apply_oldest_first', entityType: 'pending_slip', entityId: slipId,
    tenantId, newValue: { amount, applied_count: appliedCount, applied },
    description: `ตัดหนี้เก่าสุด ${appliedCount} บิล ยอด ฿${amount.toLocaleString('th-TH')}`,
  }).catch(() => {})

  revalidatePath('/payment-reviews')
  revalidatePath('/bills')
  for (const item of applied) revalidatePath(`/bills/${item.bill_id}`)
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')

  return { success: true, message: `ตัดหนี้เก่าสุดก่อน ${appliedCount} บิล เรียบร้อยแล้ว` }
}

// บันทึกเป็นเงินรับล่วงหน้า (ไม่มีบิลให้ตัด)
export async function saveSlipAsAdvance(
  slipId: string,
  tenantId: string,
  roomId: string | null,
  amount: number,
  note: string | null
): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return { success: false, message: 'กรุณาระบุจำนวนเงินที่ถูกต้อง' }
  }
  const { data: creditId, error } = await createServiceClient().rpc('admin_save_slip_as_advance', {
    p_slip_id: slipId, p_tenant_id: tenantId, p_room_id: roomId, p_amount: amount,
    p_note: note, p_reviewed_by: user.id,
  })
  if (error || !creditId) return { success: false, message: error?.code === '23505'
    ? 'สลิปนี้บันทึกไปแล้ว' : 'บันทึกเงินล่วงหน้าไม่สำเร็จ กรุณาตรวจสอบรายการแล้วลองใหม่' }
  await logAudit({ action: 'tenant_credit_create', entityType: 'tenant_credit', entityId: String(creditId),
    tenantId, roomId, newValue: { amount, note, slip_id: slipId },
    description: `บันทึกสลิปเป็นเงินรับล่วงหน้า ฿${amount.toLocaleString('th-TH')}`,
  }).catch(() => {})

  revalidatePath('/payment-reviews')
  return { success: true, message: 'บันทึกเป็นเงินรับล่วงหน้าแล้ว' }
}

// เปลี่ยนผู้เช่า/ห้องของสลิป (กรณีระบบจับผิด)
export async function reassignSlipTenant(
  slipId: string,
  tenantId: string,
  roomId: string | null
): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const { data: oldSlip } = await supabase
    .from('pending_slips')
    .select('tenant_id, room_id, amount, slip_ref')
    .eq('id', slipId)
    .single()

  const { data: updated, error } = await supabase
    .from('pending_slips')
    .update({ tenant_id: tenantId, room_id: roomId })
    .eq('id', slipId)
    .eq('status', 'pending')
    .select('id')
  if (error) return { success: false, message: error.message }
  if (!updated || updated.length === 0) return { success: false, message: 'สลิปนี้ถูกดำเนินการไปแล้ว ไม่สามารถเปลี่ยนผู้เช่าได้' }

  logAudit({
    action: 'slip_reassign',
    entityType: 'pending_slip',
    entityId: slipId,
    tenantId,
    roomId,
    oldValue: {
      tenant_id: oldSlip?.tenant_id ?? null,
      room_id: oldSlip?.room_id ?? null,
      amount: oldSlip?.amount ?? null,
      slip_ref: oldSlip?.slip_ref ?? null,
    },
    newValue: {
      tenant_id: tenantId,
      room_id: roomId,
      amount: oldSlip?.amount ?? null,
      slip_ref: oldSlip?.slip_ref ?? null,
    },
    description: `ย้ายสลิป ${slipId} จากผู้เช่า ${oldSlip?.tenant_id ?? '-'} / ห้อง ${oldSlip?.room_id ?? '-'} ไปผู้เช่า ${tenantId} / ห้อง ${roomId ?? '-'}`,
  }).catch(() => {})

  revalidatePath(`/payment-reviews/${slipId}`)
  return { success: true, message: 'เปลี่ยนผู้เช่าแล้ว' }
}

// รายชื่อผู้เช่าทั้งหมด สำหรับ dropdown เปลี่ยนผู้เช่า
export async function getAllTenantsForSelect(): Promise<{ id: string; full_name: string; room_id: string | null; room_number: string | null }[]> {
  if (!(await getAuthedUser())) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('contracts')
    .select('tenant_id, room_id, tenants(full_name), rooms(room_number)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  type Row = { tenant_id: string; room_id: string | null; tenants: { full_name: string } | null; rooms: { room_number: string } | null }
  const seen = new Set<string>()
  const out: { id: string; full_name: string; room_id: string | null; room_number: string | null }[] = []
  for (const r of ((data ?? []) as unknown as Row[])) {
    const key = `${r.tenant_id}-${r.room_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: r.tenant_id,
      full_name: r.tenants?.full_name ?? '—',
      room_id: r.room_id,
      room_number: r.rooms?.room_number ?? null,
    })
  }
  return out
}

export async function rejectSlip(
  slipId: string,
  note: string
): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  // Atomic claim — only reject if still pending (race guard)
  const { data: updated } = await supabase.from('pending_slips').update({
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    admin_note: note || 'ปฏิเสธโดยเจ้าของหอ',
  }).eq('id', slipId).eq('status', 'pending').select('id')

  if (!updated || updated.length === 0) {
    return { success: false, message: 'สลิปนี้ถูกดำเนินการไปแล้วหรือไม่พบ' }
  }

  logAudit({ action: 'slip_reject', entityType: 'pending_slip', entityId: slipId, description: `ปฏิเสธสลิป — ${note || 'ปฏิเสธโดยเจ้าของหอ'}` }).catch(() => {})

  revalidatePath('/payment-reviews')
  return { success: true, message: 'ปฏิเสธสลิปแล้ว' }
}

export async function getPendingSlipCount(): Promise<number> {
  if (!(await getAuthedUser())) return 0
  const supabase = await createClient()
  const { count } = await supabase
    .from('pending_slips')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}

// ── internal helper ──────────────────────────────────────────────────────────

// Status is committed by the RPC; never rewrite it from an out-of-transaction read.
async function updateBillStatusAndNotify(supabase: SupabaseServerClient, billId: string) {
  const { data: bill, error } = await supabase.from('bills')
    .select('total_amount, payments(amount)').eq('id', billId).single()
  if (error || !bill) return
  const totalPaid = (bill.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  await sendPaymentReceiptNotification(billId, totalPaid, Number(bill.total_amount)).catch((err) => {
    console.error('[payment-reviews] LINE receipt notification failed:', err)
  })
}
