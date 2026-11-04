'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  LineIntegrationSchema,
  SettingsSchema,
  type SettingsFormState,
} from '@/lib/definitions'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'
import { encryptSecret, secretLast4 } from '@/lib/crypto-secrets'
import { getAuthedUser } from '@/lib/require-admin'
import { isRateLimited } from '@/lib/rate-limit'
import { logAudit } from './audit'

function createPasswordVerificationClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  )
}

export async function updateSettings(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  if (!(await getAuthedUser())) return { message: 'ไม่มีสิทธิ์ใช้งาน' }

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
    meter_ocr_enabled:          formData.get('meter_ocr_enabled') === 'on',
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

// ─── Update payment info (requires password confirmation) ────
export async function updatePaymentSettings(
  _: unknown,
  formData: FormData
): Promise<{ success?: boolean; message: string }> {
  const currentPassword  = String(formData.get('current_password') ?? '').trim()
  const promptpayId      = String(formData.get('promptpay_id') ?? '').trim()
  const promptpayName    = String(formData.get('promptpay_name') ?? '').trim() || 'ห้องเช่า'
  const bankAccountsText = String(formData.get('bank_accounts_text') ?? '').trim()
  const bankAccountNo    = String(formData.get('bank_account_no') ?? '').trim()
  const bankAccountName  = String(formData.get('bank_account_name') ?? '').trim()
  const bankName         = String(formData.get('bank_name') ?? '').trim()

  // Dropdown: กรอกบัญชีของแถวที่เลือก แล้วบันทึกลงช่องแถวนั้น
  const selectedRow = Number(formData.get('selected_row') ?? '1')
  const row = (selectedRow >= 1 && selectedRow <= 3) ? selectedRow : 1
  const targetName = `bank_name_${row}`
  const targetNo   = `bank_account_no_${row}`
  const targetAcc  = `bank_account_name_${row}`

  if (!currentPassword) return { message: 'กรุณายืนยันรหัสผ่านก่อนบันทึก' }

  // PromptPay ID: เบอร์มือถือ 10 หลัก (0xxxxxxxxx) หรือเลขบัตร/นิติบุคคล 13 หลัก หรือเว้นว่างได้
  if (promptpayId && !/^(0\d{9}|\d{13})$/.test(promptpayId)) {
    return { message: 'รหัส PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก (0xxxxxxxxx) หรือเลขบัตรประชาชน/นิติบุคคล 13 หลัก' }
  }

  // เลขบัญชี: ตัวเลขหรือมีขีดคั่นได้ (เช่น 9197253892 หรือ 919-7-253892)
  if (bankAccountNo && !/^[\d\s-]+$/.test(bankAccountNo.replace(/\./g, ''))) {
    return { message: 'เลขบัญชีกรอกได้เฉพาะตัวเลขและเครื่องหมายขีด (-)' }
  }

  const user = await getAuthedUser()
  if (!user?.email) return { message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  const { error: verifyError } = await createPasswordVerificationClient().auth.signInWithPassword({
    email: user.email, password: currentPassword,
  })
  if (verifyError) return { message: 'รหัสผ่านไม่ถูกต้อง' }

  // Step-up auth: if 2FA is enabled, require a FRESH OTP from the authenticator
  // (same as login) — proves possession of the device right now, so a hijacked
  // session alone can't change the bank account / PromptPay.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totp = factors?.totp?.find((f) => f.status === 'verified')
  if (totp) {
    const otpCode = String(formData.get('otp_code') ?? '').replace(/\s/g, '')
    if (!/^\d{6}$/.test(otpCode)) return { message: 'กรุณากรอกรหัส OTP 6 หลักจากแอป Authenticator' }
    if (await isRateLimited(`mfa:payment:${user.id}`, 5, 5 * 60)) {
      return { message: 'ลองรหัส OTP ผิดหลายครั้ง กรุณารอ 5 นาที' }
    }
    const { error: otpError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: otpCode })
    if (otpError) return { message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }
  }

  const rowCols = ['bank_name_1','bank_account_no_1','bank_account_name_1',
    'bank_name_2','bank_account_no_2','bank_account_name_2',
    'bank_name_3','bank_account_no_3','bank_account_name_3']

  const { data: before } = await supabase
    .from('settings').select('promptpay_id, bank_accounts_text, bank_account_no, bank_account_name, bank_name, ' + rowCols.join(', ')).eq('id', 1).single() as { data: Record<string, string | null> | null }

  // บันทึก promptpay + bank_accounts_text + เฉพาะแถวที่เลือกใน drop-down
  const rowUpdate: Record<string, string | null> = {
    [targetName]: bankName || null,
    [targetNo]:   bankAccountNo || null,
    [targetAcc]:  bankAccountName || null,
  }

  const { error } = await supabase
    .from('settings')
    .update({
      promptpay_id: promptpayId, promptpay_name: promptpayName, bank_accounts_text: bankAccountsText || null,
      ...rowUpdate,
    })
    .eq('id', 1)

  if (error) return { message: `เกิดข้อผิดพลาด: ${error.message}` }

  const changed =
    promptpayId !== (before?.promptpay_id ?? '') || promptpayName !== (before?.promptpay_name ?? '')
    || bankAccountsText !== (before?.bank_accounts_text ?? '')
    || Object.keys(rowUpdate).some((c) => rowUpdate[c] !== (before?.[c as keyof typeof before] ?? null))

  if (changed) {
    logAudit({
      action: 'settings_update',
      entityType: 'settings',
      entityId: '1',
      oldValue: {
        ...Object.fromEntries(Object.keys(rowUpdate).map((c) => [c, before?.[c as keyof typeof before] ?? null])),
      },
      newValue: rowUpdate,
      description: `เปลี่ยนข้อมูลบัญชีแถวที่ ${row} (ยืนยัน${totp ? 'รหัสผ่าน + OTP' : 'รหัสผ่าน'}แล้ว)`,
    }).catch(() => {})
  }

  revalidatePath('/settings')
  return { success: true, message: `บันทึกข้อมูลการชำระเงินของแถวที่ ${row} แล้ว` }
}

// ─── Change password + sign out all devices ─────────────────
export async function changePasswordAndSignOutAll(
  _: unknown,
  formData: FormData
): Promise<{ success?: boolean; message: string }> {
  const currentPassword = String(formData.get('current_password') ?? '').trim()
  const newPassword     = String(formData.get('new_password') ?? '').trim()
  const confirm         = String(formData.get('confirm_password') ?? '').trim()

  if (!currentPassword)           return { message: 'กรุณากรอกรหัสผ่านปัจจุบัน' }
  if (newPassword.length < 8)     return { message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' }
  if (newPassword !== confirm)     return { message: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' }
  if (newPassword === currentPassword) return { message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเก่า' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { message: 'ไม่มีสิทธิ์ใช้งาน' }

  // Verify current password before allowing any change
  // Verify the old password without replacing the current AAL2 session cookies.
  const { error: verifyError } = await createPasswordVerificationClient().auth.signInWithPassword({
    email:    user.email,
    password: currentPassword,
  })
  if (verifyError) return { message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { message: `เกิดข้อผิดพลาด: ${error.message}` }

  // Revoke ALL sessions including current device
  await createServiceClient().auth.admin.signOut(user.id, 'global')

  return { success: true, message: 'เปลี่ยนรหัสผ่านและออกจากระบบทุกเครื่องแล้ว' }
}

// ─── General settings (utilities / billing / reminders / SlipOK) ────
const GeneralSettingsSchema = SettingsSchema.omit({
  owner_name: true,
  owner_id_card: true,
  owner_address: true,
})

export async function updateGeneralSettings(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  if (!(await getAuthedUser())) return { message: 'ไม่มีสิทธิ์ใช้งาน' }

  const raw = {
    water_unit_price:       formData.get('water_unit_price'),
    electricity_unit_price: formData.get('electricity_unit_price'),
    late_fee_per_day:       formData.get('late_fee_per_day'),
    billing_day:            formData.get('billing_day'),
    due_day:                formData.get('due_day'),
    trash_fee:              formData.get('trash_fee'),
    reminder_days:          formData.get('reminder_days'),
    reminder_enabled:       formData.get('reminder_enabled') === 'on',
    meter_ocr_enabled:      formData.get('meter_ocr_enabled') === 'on',
    anomaly_threshold_pct:  formData.get('anomaly_threshold_pct'),
    slipok_branch_id:       formData.get('slipok_branch_id'),
  }
  const slipokApiKey = String(formData.get('slipok_api_key') ?? '').trim()

  const parsed = GeneralSettingsSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const supabase = await createClient()
  const settingsUpdate: Record<string, unknown> = { ...parsed.data }
  if (slipokApiKey) settingsUpdate.slipok_api_key = await encryptSecret(slipokApiKey)

  const { error } = await supabase.from('settings').update(settingsUpdate).eq('id', 1)
  if (error) return { message: `เกิดข้อผิดพลาด: ${error.message}` }

  revalidatePath('/settings/general')
  return { success: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' }
}

// ─── LINE integration + owner info ──────────────────────────
export async function updateLineAndOwnerSettings(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  if (!(await getAuthedUser())) return { message: 'ไม่มีสิทธิ์ใช้งาน' }

  const lineRaw = {
    line_channel_access_token: formData.get('line_channel_access_token'),
    line_channel_secret:       formData.get('line_channel_secret'),
    line_oa_basic_id:          formData.get('line_oa_basic_id'),
    line_liff_id:              formData.get('line_liff_id'),
    line_liff_id_pairing:      formData.get('line_liff_id_pairing'),
    app_url:                   formData.get('app_url'),
    owner_line_user_id:        formData.get('owner_line_user_id'),
  }

  const parsedLine = LineIntegrationSchema.safeParse(lineRaw)
  if (!parsedLine.success) return { errors: parsedLine.error.flatten().fieldErrors }

  const ownerName        = String(formData.get('owner_name') ?? '').trim()
  const ownerIdCard      = String(formData.get('owner_id_card') ?? '').trim()
  const ownerAddress     = String(formData.get('owner_address') ?? '').trim()
  const telegramBotToken    = (formData.get('telegram_bot_token')    as string | null)?.trim() || null
  const telegramChatId      = (formData.get('telegram_chat_id')      as string | null)?.trim() || null
  const ownerNotifyChannel  = (formData.get('owner_notify_channel')  as string | null)?.trim() || 'telegram'

  const supabase = await createClient()

  const settingsUpdate: Record<string, string | boolean | null> = {
    owner_name: ownerName, owner_id_card: ownerIdCard, owner_address: ownerAddress,
    owner_notify_channel: ['line', 'telegram', 'both'].includes(ownerNotifyChannel) ? ownerNotifyChannel : 'telegram',
    notify_slip_enabled:              formData.get('notify_slip_enabled')              === 'on',
    notify_repair_enabled:            formData.get('notify_repair_enabled')            === 'on',
    notify_registration_enabled:      formData.get('notify_registration_enabled')      === 'on',
    notify_contract_enabled:          formData.get('notify_contract_enabled')          === 'on',
    notify_lead_enabled:              formData.get('notify_lead_enabled')              === 'on',
    notify_daily_summary_enabled:     formData.get('notify_daily_summary_enabled')     === 'on',
    notify_reminder_summary_enabled:  formData.get('notify_reminder_summary_enabled')  === 'on',
    notify_expiring_contract_enabled: formData.get('notify_expiring_contract_enabled') === 'on',
  }
  if (telegramChatId !== null) settingsUpdate.telegram_chat_id = telegramChatId
  if (telegramBotToken) {
    settingsUpdate.telegram_bot_token      = await encryptSecret(telegramBotToken)
    settingsUpdate.telegram_bot_token_last4 = secretLast4(telegramBotToken)
  }

  const { error: ownerError } = await supabase.from('settings').update(settingsUpdate).eq('id', 1)
  if (ownerError) return { message: `เกิดข้อผิดพลาด: ${ownerError.message}` }

  const loginNotifyEnabled        = formData.get('login_notify_enabled') === 'on'
  const billReminderNotifyEnabled = formData.get('bill_reminder_notify_enabled') === 'on'

  const lineData = parsedLine.data
  const lineUpdate: Record<string, string | boolean | null> = {
    dorm_id:                          DEFAULT_DORM_ID,
    line_oa_basic_id:                 lineData.line_oa_basic_id || null,
    line_liff_id:                     lineData.line_liff_id || null,
    line_liff_id_pairing:             lineData.line_liff_id_pairing || null,
    app_url:                          lineData.app_url || null,
    owner_line_user_id:               lineData.owner_line_user_id || null,
    login_notify_enabled:             loginNotifyEnabled,
    bill_reminder_notify_enabled:     billReminderNotifyEnabled,
  }
  if (lineData.line_channel_access_token) {
    lineUpdate.encrypted_channel_access_token = await encryptSecret(lineData.line_channel_access_token)
    lineUpdate.token_last4    = secretLast4(lineData.line_channel_access_token)
    lineUpdate.connected_at   = new Date().toISOString()
  }
  if (lineData.line_channel_secret) {
    lineUpdate.encrypted_channel_secret  = await encryptSecret(lineData.line_channel_secret)
    lineUpdate.channel_secret_last4      = secretLast4(lineData.line_channel_secret)
  }

  const { error: lineError } = await supabase
    .from('line_integrations')
    .upsert(lineUpdate, { onConflict: 'dorm_id' })
  if (lineError) return { message: `เกิดข้อผิดพลาด: ${lineError.message}` }

  revalidatePath('/settings/line')
  return { success: true, message: 'บันทึกการตั้งค่า LINE และข้อมูลผู้ให้เช่าเรียบร้อยแล้ว' }
}

// ─── Shift current billing month ────────────────────────────
export async function shiftBillingMonth(
  direction: 'prev' | 'next'
): Promise<{ success: boolean; month: string }> {
  if (!(await getAuthedUser())) return { success: false, month: '' }

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

