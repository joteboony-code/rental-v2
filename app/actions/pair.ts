'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { logAudit } from './audit'

export async function unlinkTenantLine(tenantId: string): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tenants')
    .update({ line_user_id: null, line_display_name: null, line_picture_url: null })
    .eq('id', tenantId)

  if (error) return { success: false, message: error.message }

  logAudit({ action: 'line_unpair', entityType: 'tenant', entityId: tenantId, tenantId, description: `ยกเลิกจับคู่ LINE` }).catch(() => {})

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
  const roomNumber   = String(formData.get('room_number')    ?? '').trim()
  const lineUserId   = String(formData.get('line_user_id')   ?? '').trim()
  const displayName  = String(formData.get('line_display_name') ?? '').trim() || null
  const pictureUrl   = String(formData.get('line_picture_url')  ?? '').trim() || null

  if (!roomNumber || !lineUserId) {
    return {
      success: false,
      message: 'กรุณาเปิดหน้านี้ผ่าน LINE เพื่อดึง LINE User ID อัตโนมัติ',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pair_tenant_line', {
    p_room_number:   roomNumber,
    p_line_user_id:  lineUserId,
    p_display_name:  displayName,
    p_picture_url:   pictureUrl,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  const result = Array.isArray(data) ? data[0] : data
  if (result?.success) {
    logAudit({ action: 'line_pair', description: `จับคู่ LINE ห้อง ${roomNumber}` }).catch(() => {})
  }
  return {
    success: Boolean(result?.success),
    message: result?.message ?? 'ไม่สามารถเชื่อม LINE ได้',
    tenantName: result?.tenant_name ?? null,
    roomNumber: result?.room_number ?? null,
  }
}

export async function syncLineProfiles(): Promise<{ success: boolean; updated: number; message: string }> {
  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return { success: false, updated: 0, message: 'ยังไม่ได้ตั้งค่า LINE' }

  const supabase = createServiceClient()

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, line_user_id')
    .not('line_user_id', 'is', null)

  if (!tenants?.length) return { success: true, updated: 0, message: 'ไม่มีผู้เช่าที่จับคู่ LINE' }

  const results = await Promise.allSettled(
    tenants.map(async (tenant) => {
      const res = await fetch(`https://api.line.me/v2/bot/profile/${tenant.line_user_id}`, {
        headers: { Authorization: `Bearer ${lineConfig.channelAccessToken}` },
      })
      if (!res.ok) return false
      const profile = await res.json() as { displayName?: string; pictureUrl?: string }
      await supabase
        .from('tenants')
        .update({
          line_display_name: profile.displayName ?? null,
          line_picture_url:  profile.pictureUrl  ?? null,
        })
        .eq('id', tenant.id)
      return true
    })
  )
  const updated = results.filter((r) => r.status === 'fulfilled' && r.value === true).length

  revalidatePath('/tenants')
  return { success: true, updated, message: `อัปเดตสำเร็จ ${updated} จาก ${tenants.length} คน` }
}
