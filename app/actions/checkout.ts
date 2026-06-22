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
  billIds?:   string[]
}): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  const supabase = await createClient()

  // Guard double-submit: reject if contract already terminated
  const { data: contract } = await supabase
    .from('contracts')
    .select('status')
    .eq('id', data.contractId)
    .single()
  if (!contract) return { success: false, message: 'ไม่พบสัญญาเช่า' }
  if (contract.status === 'terminated') return { success: false, message: 'สัญญานี้ถูกยกเลิกแล้ว' }

  // 1. Terminate contract
  const { error: e1 } = await supabase
    .from('contracts')
    .update({ status: 'terminated', end_date: data.moveOutDate })
    .eq('id', data.contractId)
  if (e1) return { success: false, message: `อัพเดทสัญญาไม่สำเร็จ: ${e1.message}` }

  // 2. Unlink LINE — เช็คหลัง step 1 เพื่อให้รันได้แม้ step 3 จะพลาด
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

  // 4. Re-fetch bills server-side to get authoritative remaining amounts
  //    Only process billIds that belong to this contract (IDOR guard)
  const billIds = data.billIds ?? []
  if (billIds.length > 0) {
    type BillRow = { id: string; total_amount: number; payments: { amount: number }[] | null }
    const { data: bills } = await supabase
      .from('bills')
      .select('id, total_amount, payments(amount)')
      .eq('contract_id', data.contractId)  // ownership check
      .in('id', billIds)
      .in('status', ['pending', 'overdue'])

    const paidAt = new Date(data.moveOutDate).toISOString()

    for (const bill of (bills ?? []) as unknown as BillRow[]) {
      const alreadyPaid = (bill.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.max(0, Number(bill.total_amount) - alreadyPaid)
      if (remaining <= 0) continue

      const { error: pe } = await supabase.from('payments').insert({
        bill_id: bill.id,
        amount: remaining,
        payment_method: 'other',
        note: 'หักจากเงินมัดจำ (ย้ายออก)',
        paid_at: paidAt,
      })
      if (pe) return { success: false, message: `บันทึกการชำระไม่สำเร็จ: ${pe.message}` }

      const { error: be } = await supabase.from('bills').update({ status: 'paid' }).eq('id', bill.id)
      if (be) return { success: false, message: `อัพเดทบิลไม่สำเร็จ: ${be.message}` }
    }
  }

  logAudit({ action: 'tenant_checkout', entityType: 'contract', entityId: data.contractId, tenantId: data.tenantId, roomId: data.roomId, description: `ย้ายออก วันที่ ${data.moveOutDate}${data.note ? ` — ${data.note}` : ''}` }).catch(() => {})

  revalidatePath(`/tenants/${data.tenantId}`)
  revalidatePath('/tenants')
  revalidatePath('/rooms')
  revalidatePath('/bills')

  return { success: true, message: 'บันทึกการย้ายออกเรียบร้อย' }
}
