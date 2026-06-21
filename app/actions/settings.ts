'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  LineIntegrationSchema,
  SettingsSchema,
  type SettingsFormState,
} from '@/lib/definitions'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'
import { encryptSecret, secretLast4 } from '@/lib/crypto-secrets'

export async function updateSettings(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const raw = {
    water_unit_price:           formData.get('water_unit_price'),
    electricity_unit_price:     formData.get('electricity_unit_price'),
    late_fee_per_day:           formData.get('late_fee_per_day'),
    billing_day:                formData.get('billing_day'),
    due_day:                    formData.get('due_day'),
    promptpay_id:               formData.get('promptpay_id'),
    promptpay_name:             formData.get('promptpay_name'),
    trash_fee:                  formData.get('trash_fee'),
    reminder_days:              formData.get('reminder_days'),
    reminder_enabled:           formData.get('reminder_enabled') === 'on',
    anomaly_threshold_pct:      formData.get('anomaly_threshold_pct'),
    slipok_branch_id:           formData.get('slipok_branch_id'),
    bank_accounts_text:         formData.get('bank_accounts_text'),
    owner_name:                 formData.get('owner_name'),
    owner_id_card:              formData.get('owner_id_card'),
    owner_address:              formData.get('owner_address'),
  }
  const slipokApiKey = String(formData.get('slipok_api_key') ?? '').trim()
  const lineRaw = {
    line_channel_access_token: formData.get('line_channel_access_token'),
    line_channel_secret:       formData.get('line_channel_secret'),
    line_oa_basic_id:          formData.get('line_oa_basic_id'),
    line_liff_id:              formData.get('line_liff_id'),
    line_liff_id_pairing:      formData.get('line_liff_id_pairing'),
    app_url:                   formData.get('app_url'),
    owner_line_user_id:        formData.get('owner_line_user_id'),
  }

  const parsed = SettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }
  const parsedLine = LineIntegrationSchema.safeParse(lineRaw)
  if (!parsedLine.success) {
    return { errors: parsedLine.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const settingsUpdate: Record<string, unknown> = { ...parsed.data }
  if (slipokApiKey) {
    // เข้ารหัสก่อนเก็บ — เดิมเก็บ plaintext ในตาราง settings
    settingsUpdate.slipok_api_key = await encryptSecret(slipokApiKey)
  }

  const { error } = await supabase
    .from('settings')
    .update(settingsUpdate)
    .eq('id', 1)

  if (error) return { message: `เกิดข้อผิดพลาด: ${error.message}` }

  const lineData = parsedLine.data
  const lineUpdate: Record<string, string | null> = {
    dorm_id:          DEFAULT_DORM_ID,
    line_oa_basic_id: lineData.line_oa_basic_id || null,
    line_liff_id:     lineData.line_liff_id || null,
    line_liff_id_pairing: lineData.line_liff_id_pairing || null,
    app_url:          lineData.app_url || null,
    owner_line_user_id: lineData.owner_line_user_id || null,
  }

  if (lineData.line_channel_access_token) {
    lineUpdate.encrypted_channel_access_token = await encryptSecret(
      lineData.line_channel_access_token
    )
    lineUpdate.token_last4 = secretLast4(lineData.line_channel_access_token)
    lineUpdate.connected_at = new Date().toISOString()
  }

  if (lineData.line_channel_secret) {
    lineUpdate.encrypted_channel_secret = await encryptSecret(
      lineData.line_channel_secret
    )
    lineUpdate.channel_secret_last4 = secretLast4(lineData.line_channel_secret)
  }

  const { error: lineError } = await supabase
    .from('line_integrations')
    .upsert(lineUpdate, { onConflict: 'dorm_id' })

  if (lineError) return { message: `เกิดข้อผิดพลาด: ${lineError.message}` }

  revalidatePath('/settings')
  return { success: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' }
}

// ─── Shift current billing month ────────────────────────────
export async function shiftBillingMonth(
  direction: 'prev' | 'next'
): Promise<{ success: boolean; month: string }> {
  const supabase = await createClient()
  const { data: s } = await supabase
    .from('settings')
    .select('current_billing_month')
    .eq('id', 1)
    .single()

  const base = s?.current_billing_month
    ? new Date(s.current_billing_month)
    : new Date()
  base.setDate(1)
  base.setMonth(base.getMonth() + (direction === 'next' ? 1 : -1))
  const newMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`

  await supabase
    .from('settings')
    .update({ current_billing_month: newMonth })
    .eq('id', 1)

  revalidatePath('/bills')
  return { success: true, month: newMonth.slice(0, 7) } // "YYYY-MM"
}

