'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/require-admin'
import { logAudit } from './audit'

export async function saveCheckout(data: {
  contractId: string
  roomId:     string
  tenantId:   string
  moveOutDate: string
  note?:      string
  paidBills?: { id: string; amount: number }[]
}): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  const supabase = await createClient()

  // 1. Terminate contract
  const { error: e1 } = await supabase
    .from('contracts')
    .update({ status: 'terminated', end_date: data.moveOutDate })
    .eq('id', data.contractId)
  if (e1) return { success: false, message: `อัพเดทสัญญาไม่สำเร็จ: ${e1.message}` }

  // 2. Unlink LINE — เช็คหลัง step 1 commit แล้ว เพื่อให้รันได้แม้ step 3 จะพลาด
  const { data: remaining } = await supabase
    .from('contracts')
    .select('id')
    .eq('tenant_id', data.tenantId)
    .eq('status', 'active')
    .limit(1)

  if (!remaining || remaining.length === 0) {
    await supabase
      .from('tenants')
      .update({ line_user_id: null, line_display_name: null, line_picture_url: null })
      .eq('id', data.tenantId)
  }

  // 3. Set room to available
  const { error: e2 } = await supabase
    .from('rooms')
    .update({ status: 'available' })
    .eq('id', data.roomId)
  if (e2) return { success: false, message: `อัพเดทห้องไม่สำเร็จ: ${e2.message}` }

  // 4. ปิดบิลค้างที่หักด้วยเงินมัดจำ → ชำระแล้ว + บันทึกรายการชำระ
  const paidAt = new Date(data.moveOutDate).toISOString()
  for (const bill of data.paidBills ?? []) {
    const { error: pe } = await supabase.from('payments').insert({
      bill_id: bill.id,
      amount: bill.amount,
      payment_method: 'other',
      note: 'หักจากเงินมัดจำ (ย้ายออก)',
      paid_at: paidAt,
    })
    if (pe) return { success: false, message: `บันทึกการชำระไม่สำเร็จ: ${pe.message}` }
    const { error: be } = await supabase.from('bills').update({ status: 'paid' }).eq('id', bill.id)
    if (be) return { success: false, message: `อัพเดทบิลไม่สำเร็จ: ${be.message}` }
  }

  logAudit({ action: 'tenant_checkout', entityType: 'contract', entityId: data.contractId, tenantId: data.tenantId, roomId: data.roomId, description: `ย้ายออก วันที่ ${data.moveOutDate}${data.note ? ` — ${data.note}` : ''}` }).catch(() => {})

  revalidatePath(`/tenants/${data.tenantId}`)
  revalidatePath('/tenants')
  revalidatePath('/rooms')
  revalidatePath('/bills')

  return { success: true, message: 'บันทึกการย้ายออกเรียบร้อย' }
}


