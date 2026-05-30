'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function saveCheckout(data: {
  contractId: string
  roomId:     string
  tenantId:   string
  moveOutDate: string
  note?:      string
  paidBills?: { id: string; amount: number }[]
}): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  // 1. Terminate contract
  const { error: e1 } = await supabase
    .from('contracts')
    .update({ status: 'terminated', end_date: data.moveOutDate })
    .eq('id', data.contractId)
  if (e1) return { success: false, message: `อัพเดทสัญญาไม่สำเร็จ: ${e1.message}` }

  // 2. Set room to available
  const { error: e2 } = await supabase
    .from('rooms')
    .update({ status: 'available' })
    .eq('id', data.roomId)
  if (e2) return { success: false, message: `อัพเดทห้องไม่สำเร็จ: ${e2.message}` }

  // 3. ปิดบิลค้างที่หักด้วยเงินมัดจำ → ชำระแล้ว + บันทึกรายการชำระ
  const paidAt = new Date(data.moveOutDate).toISOString()
  for (const bill of data.paidBills ?? []) {
    await supabase.from('payments').insert({
      bill_id: bill.id,
      amount: bill.amount,
      payment_method: 'other',
      note: 'หักจากเงินมัดจำ (ย้ายออก)',
      paid_at: paidAt,
    })
    await supabase.from('bills').update({ status: 'paid' }).eq('id', bill.id)
  }

  revalidatePath(`/tenants/${data.tenantId}`)
  revalidatePath('/tenants')
  revalidatePath('/rooms')
  revalidatePath('/bills')

  return { success: true, message: 'บันทึกการย้ายออกเรียบร้อย' }
}


