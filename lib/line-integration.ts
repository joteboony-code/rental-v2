import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'

export const DEFAULT_DORM_ID = '00000000-0000-0000-0000-000000000001'

export type LineIntegrationPublic = {
  dorm_id: string
  line_oa_basic_id: string | null
  line_liff_id: string | null
  line_liff_id_pairing: string | null
  app_url: string | null
  owner_line_user_id: string | null
  token_last4: string | null
  channel_secret_last4: string | null
  connected_at: string | null
  updated_at: string | null
  login_notify_enabled: boolean
}

export type LineMessagingConfig = {
  channelAccessToken: string
  channelSecret: string | null
  liffId: string | null
  appUrl: string | null
  ownerLineUserId: string | null
}

export async function getLineIntegrationPublic(
  dormId = DEFAULT_DORM_ID
): Promise<LineIntegrationPublic | null> {
  // ใช้ service client (อ่านเฉพาะคอลัมน์ที่ไม่ sensitive) เพราะหน้านี้เรียกใน
  // context ของ anon (tenant ที่ยังไม่ล็อกอิน) — RLS ของ line_integrations ปิด anon แล้ว
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select(
      'dorm_id, line_oa_basic_id, line_liff_id, line_liff_id_pairing, app_url, owner_line_user_id, token_last4, channel_secret_last4, connected_at, updated_at, login_notify_enabled'
    )
    .eq('dorm_id', dormId)
    .maybeSingle()

  if (data) {
    const row = data as LineIntegrationPublic
    // ถ้าตั้งค่า line_liff_id_pairing ไว้แล้วใช้เลย
    // ถ้าไม่มี (column ไม่ถูก migrate หรือยังไม่ได้กรอก) ให้ fallback ไปใช้ line_liff_id
    // เพื่อให้ QR ลงทะเบียนแสดงเป็น LIFF URL ได้เมื่อมี LIFF ID อย่างน้อยหนึ่งตัว
    return {
      ...row,
      line_liff_id_pairing: row.line_liff_id_pairing ?? row.line_liff_id ?? null,
    }
  }

  const { data: legacySettings } = await supabase
    .from('settings')
    .select('line_liff_id, app_url')
    .eq('id', 1)
    .maybeSingle()

  if (!legacySettings?.line_liff_id && !legacySettings?.app_url) return null

  return {
    dorm_id: dormId,
    line_oa_basic_id: null,
    line_liff_id: legacySettings.line_liff_id ?? null,
    // fallback: legacy ใช้ line_liff_id เป็น pairing ด้วย เพราะยังไม่มี column แยก
    line_liff_id_pairing: legacySettings.line_liff_id ?? null,
    app_url: legacySettings.app_url ?? null,
    owner_line_user_id: null,
    token_last4: null,
    channel_secret_last4: null,
    connected_at: null,
    updated_at: null,
    login_notify_enabled: true,
  }
}

export async function getLineMessagingConfig(
  dormId = DEFAULT_DORM_ID
): Promise<LineMessagingConfig | null> {
  // ใช้ service client เพราะต้องอ่าน encrypted token เพื่อถอดรหัสส่งข้อความ
  // (เป็น operation ฝั่ง server เท่านั้น) และถูกเรียกจาก context anon ด้วย (pair/registration/cron)
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select(
      'encrypted_channel_access_token, encrypted_channel_secret, line_liff_id, app_url, owner_line_user_id'
    )
    .eq('dorm_id', dormId)
    .maybeSingle()

  if (!data?.encrypted_channel_access_token) return null

  return {
    channelAccessToken: await decryptSecret(data.encrypted_channel_access_token),
    channelSecret: data.encrypted_channel_secret
      ? await decryptSecret(data.encrypted_channel_secret)
      : null,
    liffId: data.line_liff_id ?? null,
    appUrl: data.app_url ?? null,
    ownerLineUserId: data.owner_line_user_id ?? null,
  }
}
