'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { logAudit } from './audit'
import { getAuthedUser } from '@/lib/require-admin'
import { lineFriendshipErrorMessage, verifyLineFriendship } from '@/lib/line-friendship'
import { revalidatePath } from 'next/cache'

export async function unlinkTenantLine(tenantId: string): Promise<{ success: boolean; message?: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('tenants')
    .update({ line_user_id: null, line_display_name: null, line_picture_url: null })
    .eq('id', tenantId)

  if (error) return { success: false, message: error.message }

  logAudit({ action: 'line_unpair', entityType: 'tenant', entityId: tenantId, tenantId, description: `ยกเลิกจับคู่ LINE` }).catch(() => {})

  return { success: true }
}

export async function unlinkContractLineRecipient(
  contractId: string,
  tenantId: string
): Promise<{ success: boolean; message?: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = createServiceClient()
  const { data: contract, error } = await supabase
    .from('contracts')
    .update({
      line_recipient_user_id: null,
      line_recipient_display_name: null,
      line_recipient_picture_url: null,
    })
    .eq('id', contractId)
    .eq('tenant_id', tenantId)
    .select('room_id')
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!contract) return { success: false, message: 'ไม่พบสัญญา' }

  await logAudit({
    action: 'line_unpair',
    entityType: 'contract',
    entityId: contractId,
    tenantId,
    roomId: contract.room_id,
    description: 'ยกเลิก LINE ผู้รับบิลแยกของสัญญา',
  })
  revalidatePath(`/tenants/${tenantId}`)
  revalidatePath(`/rooms/${contract.room_id}`)
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
  const roomNumber  = String(formData.get('room_number') ?? '').trim()
  const idToken     = String(formData.get('id_token')    ?? '').trim()
  const accessToken = String(formData.get('line_access_token') ?? '').trim()
  const displayName = String(formData.get('line_display_name') ?? '').trim() || null
  const pictureUrl  = String(formData.get('line_picture_url')  ?? '').trim() || null

  if (!roomNumber || !idToken || !accessToken) {
    return {
      success: false,
      message: 'กรุณาเปิดหน้านี้ผ่าน LINE เพื่อดึง LINE User ID อัตโนมัติ',
    }
  }

  // Verify idToken กับ LINE API เพื่อป้องกัน client ส่ง line_user_id ปลอม
  const loginChannelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!loginChannelId) {
    return { success: false, message: 'ระบบยังไม่ได้ตั้งค่า LINE Login Channel' }
  }

  let lineProfile: { sub?: string; name?: string; picture?: string }
  try {
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: loginChannelId }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!verifyRes.ok) {
      return { success: false, message: 'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
    }
    lineProfile = await verifyRes.json() as { sub?: string; name?: string; picture?: string }
  } catch {
    return { success: false, message: 'ตรวจสอบบัญชี LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }
  const lineUserId = lineProfile.sub
  if (!lineUserId) {
    return { success: false, message: 'ไม่สามารถดึง LINE User ID ได้ กรุณาลองใหม่' }
  }

  const friendship = await verifyLineFriendship({
    accessToken,
    expectedUserId: lineUserId,
    loginChannelId,
  })
  if (!friendship.success) {
    return { success: false, message: lineFriendshipErrorMessage(friendship.reason) }
  }

  // ใช้ชื่อ/รูปจาก LINE API (server-verified) แทนที่จะเชื่อ client
  const verifiedName    = lineProfile.name    ?? displayName
  const verifiedPicture = lineProfile.picture ?? pictureUrl

  // The caller has proved ownership of this LINE identity with LINE's token.
  // Use service_role because the RPC is deliberately unavailable to browser roles.
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('pair_tenant_line', {
    p_room_number:   roomNumber,
    p_line_user_id:  lineUserId,
    p_display_name:  verifiedName,
    p_picture_url:   verifiedPicture,
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
  if (!(await getAuthedUser())) return { success: false, updated: 0, message: 'ไม่ได้รับอนุญาต' }
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

  return { success: true, updated, message: `อัปเดตสำเร็จ ${updated} จาก ${tenants.length} คน` }
}
