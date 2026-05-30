import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/crypto-secrets'

export const DEFAULT_DORM_ID = '00000000-0000-0000-0000-000000000001'

export type LineIntegrationPublic = {
  dorm_id: string
  line_oa_basic_id: string | null
  line_liff_id: string | null
  app_url: string | null
  owner_line_user_id: string | null
  token_last4: string | null
  channel_secret_last4: string | null
  connected_at: string | null
  updated_at: string | null
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
  const supabase = await createClient()
  const { data } = await supabase
    .from('line_integrations')
    .select(
      'dorm_id, line_oa_basic_id, line_liff_id, app_url, owner_line_user_id, token_last4, channel_secret_last4, connected_at, updated_at'
    )
    .eq('dorm_id', dormId)
    .maybeSingle()

  if (data) return data as LineIntegrationPublic

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
    app_url: legacySettings.app_url ?? null,
    owner_line_user_id: null,
    token_last4: null,
    channel_secret_last4: null,
    connected_at: null,
    updated_at: null,
  }
}

export async function getLineMessagingConfig(
  dormId = DEFAULT_DORM_ID
): Promise<LineMessagingConfig | null> {
  const supabase = await createClient()
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
