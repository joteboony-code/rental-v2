'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PaymentPromise = {
  id: string
  tenant_id: string | null
  room_id: string | null
  bill_id: string | null
  promise_date: string
  amount: number | null
  note: string | null
  status: 'active' | 'paid' | 'missed' | 'cancelled'
  created_at: string
  resolved_at: string | null
}

export async function createPromise(
  data: { tenantId: string | null; roomId: string | null; billId: string | null; promiseDate: string; amount: number | null; note: string | null }
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!data.promiseDate) return { success: false, message: 'กรุณาระบุวันที่นัดจ่าย' }

  // ยกเลิก promise active เดิมของบิลนี้ (ถ้ามี) ก่อนสร้างใหม่
  if (data.billId) {
    await supabase.from('payment_promises')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('bill_id', data.billId).eq('status', 'active')
  }

  const { error } = await supabase.from('payment_promises').insert({
    tenant_id: data.tenantId,
    room_id: data.roomId,
    bill_id: data.billId,
    promise_date: data.promiseDate,
    amount: data.amount,
    note: data.note,
    status: 'active',
    created_by: user?.id ?? null,
  })

  if (error) return { success: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath('/bills')
  if (data.billId) revalidatePath(`/bills/${data.billId}`)
  return { success: true, message: 'บันทึกนัดจ่ายเรียบร้อยแล้ว' }
}

export async function cancelPromise(promiseId: string, billId?: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase.from('payment_promises')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', promiseId)
  revalidatePath('/bills')
  if (billId) revalidatePath(`/bills/${billId}`)
  return { success: true }
}

export async function getActivePromiseForBill(billId: string): Promise<PaymentPromise | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payment_promises')
    .select('*')
    .eq('bill_id', billId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as PaymentPromise | null
}
