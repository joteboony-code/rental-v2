'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { sendPaymentReceiptNotification } from './line'

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
  const supabase = await createClient()
  const { data } = await supabase
    .from('pending_slips')
    .select('*, tenants(full_name, phone), rooms(room_number, floor)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PendingSlip[]
}

export async function getPendingSlip(id: string): Promise<PendingSlip | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pending_slips')
    .select('*, tenants(id, full_name, phone, line_user_id), rooms(id, room_number, floor)')
    .eq('id', id)
    .single()
  return data as unknown as PendingSlip | null
}

export async function getTenantOutstandingBills(tenantId: string): Promise<OutstandingBill[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select('id, billing_month, due_date, total_amount, status, rooms(room_number), payments(amount)')
    .eq('tenant_id', tenantId)
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const billId = String(formData.get('bill_id') ?? '').trim()
  const amount = Number(formData.get('amount'))
  const paymentMethod = String(formData.get('payment_method') ?? 'transfer')
  const paidAt = String(formData.get('paid_at') ?? new Date().toISOString())
  const note = String(formData.get('note') ?? '').trim() || null

  if (!billId) return { success: false, message: 'กรุณาเลือกบิล' }
  if (!amount || amount <= 0) return { success: false, message: 'กรุณาระบุจำนวนเงิน' }

  const { data: slip } = await supabase
    .from('pending_slips')
    .select('slip_url, slip_ref')
    .eq('id', slipId)
    .single()
  if (!slip) return { success: false, message: 'ไม่พบสลิปนี้' }

  const { error: payErr } = await supabase.from('payments').insert({
    bill_id: billId,
    amount,
    payment_method: paymentMethod,
    slip_url: slip.slip_url,
    slip_ref: slip.slip_ref,
    note,
    paid_at: paidAt,
    recorded_by: user?.id ?? null,
  })
  if (payErr) return { success: false, message: `บันทึกไม่สำเร็จ: ${payErr.message}` }

  await updateBillStatusAndNotify(supabase, billId)

  await supabase.from('pending_slips').update({
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    reviewed_by: user?.id ?? null,
    admin_note: note,
  }).eq('id', slipId)

  revalidatePath('/payment-reviews')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills')

  return { success: true, message: 'อนุมัติสลิปและบันทึกการชำระเงินแล้ว' }
}

export async function approveSlipOldestFirst(
  slipId: string,
  tenantId: string,
  amount: number,
  paidAt: string,
  paymentMethod: string,
  note: string | null
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: slip } = await supabase
    .from('pending_slips')
    .select('slip_url, slip_ref')
    .eq('id', slipId)
    .single()

  const { data: bills } = await supabase
    .from('bills')
    .select('id, total_amount, billing_month, due_date, status, payments(amount)')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .order('billing_month', { ascending: true })

  type BillRow = {
    id: string; total_amount: number; billing_month: string; due_date: string | null; status: string
    payments: { amount: number }[] | null
  }

  const outstanding = ((bills ?? []) as unknown as BillRow[]).map((b) => ({
    ...b,
    paid: (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
    remaining: Math.max(0, Number(b.total_amount) - (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)),
  })).filter((b) => b.remaining >= 1)

  if (outstanding.length === 0) return { success: false, message: 'ไม่พบบิลค้างชำระ' }

  let remaining = amount
  let appliedCount = 0

  for (const bill of outstanding) {
    if (remaining <= 0) break
    const toPay = Math.min(remaining, bill.remaining)
    await supabase.from('payments').insert({
      bill_id: bill.id,
      amount: toPay,
      payment_method: paymentMethod,
      slip_url: slip?.slip_url ?? null,
      slip_ref: slip?.slip_ref ?? null,
      note,
      paid_at: paidAt,
      recorded_by: user?.id ?? null,
    })
    await updateBillStatusAndNotify(supabase, bill.id)
    remaining -= toPay
    appliedCount++
  }

  await supabase.from('pending_slips').update({
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    reviewed_by: user?.id ?? null,
    admin_note: note,
  }).eq('id', slipId)

  revalidatePath('/payment-reviews')
  revalidatePath('/bills')

  return { success: true, message: `ตัดหนี้เก่าสุดก่อน ${appliedCount} บิล เรียบร้อยแล้ว` }
}

export async function rejectSlip(
  slipId: string,
  note: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('pending_slips').update({
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: user?.id ?? null,
    admin_note: note || 'ปฏิเสธโดยเจ้าของหอ',
  }).eq('id', slipId)

  revalidatePath('/payment-reviews')
  return { success: true, message: 'ปฏิเสธสลิปแล้ว' }
}

export async function getPendingSlipCount(): Promise<number> {
  const supabase = createServiceClient()
  const { count } = await supabase
    .from('pending_slips')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}

// ── internal helper ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateBillStatusAndNotify(supabase: any, billId: string) {
  const { data: bill } = await supabase
    .from('bills').select('total_amount, status').eq('id', billId).single()
  if (!bill) return

  const { data: allPayments } = await supabase
    .from('payments').select('amount').eq('bill_id', billId)
  const totalPaid = (allPayments ?? []).reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0)
  const totalAmount = Number(bill.total_amount)
  const fullyPaid = totalPaid >= totalAmount
  const newStatus = fullyPaid ? 'paid' : 'pending'

  if (newStatus !== bill.status) {
    await supabase.from('bills').update({ status: newStatus }).eq('id', billId)
  }

  sendPaymentReceiptNotification(billId, totalPaid, totalAmount).catch(() => {})
}
