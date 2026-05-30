'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function unlinkTenantLine(tenantId: string): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tenants')
    .update({ line_user_id: null })
    .eq('id', tenantId)

  if (error) return { success: false, message: error.message }
  revalidatePath(`/tenants/${tenantId}`)
  return { success: true }
}

export type PairLineState =
  | {
      success?: boolean
      message?: string
      tenantName?: string | null
      roomNumber?: string | null
    }
  | undefined

export async function pairTenantLine(
  state: PairLineState,
  formData: FormData
): Promise<PairLineState> {
  const roomNumber = String(formData.get('room_number') ?? '').trim()
  const lineUserId = String(formData.get('line_user_id') ?? '').trim()

  if (!roomNumber || !lineUserId) {
    return {
      success: false,
      message: 'กรุณาเปิดหน้านี้ผ่าน LINE เพื่อดึง LINE User ID อัตโนมัติ',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pair_tenant_line', {
    p_room_number: roomNumber,
    p_line_user_id: lineUserId,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  const result = Array.isArray(data) ? data[0] : data
  return {
    success: Boolean(result?.success),
    message: result?.message ?? 'ไม่สามารถเชื่อม LINE ได้',
    tenantName: result?.tenant_name ?? null,
    roomNumber: result?.room_number ?? null,
  }
}
