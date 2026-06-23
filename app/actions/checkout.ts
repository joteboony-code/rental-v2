'use server'

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

  const { data: result, error } = await supabase.rpc('checkout_tenant', {
    p_contract_id:   data.contractId,
    p_room_id:       data.roomId,
    p_tenant_id:     data.tenantId,
    p_move_out_date: data.moveOutDate,
    p_note:          data.note ?? null,
    p_bill_ids:      data.billIds ?? [],
  })

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }

  const res = result as { success: boolean; message: string } | null
  if (!res?.success) return { success: false, message: res?.message ?? 'เกิดข้อผิดพลาด' }

  logAudit({
    action: 'tenant_checkout',
    entityType: 'contract',
    entityId: data.contractId,
    tenantId: data.tenantId,
    roomId: data.roomId,
    description: `ย้ายออก วันที่ ${data.moveOutDate}${data.note ? ` — ${data.note}` : ''}`,
  }).catch(() => {})

  return { success: true, message: 'บันทึกการย้ายออกเรียบร้อย' }
}
