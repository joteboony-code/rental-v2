'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'
import { getClientIp, isRateLimited } from '@/lib/rate-limit'
import { getAuthedUser } from '@/lib/require-admin'

export type LoginState =
  | { error: string }
  | undefined

async function logSecurityEvent(
  action: string,
  description: string,
  userId: string | null = null
) {
  await createServiceClient().from('audit_logs').insert({
    action,
    entity_type: 'auth',
    entity_id: userId,
    created_by: userId,
    description,
  })
}

async function sendLoginNotification() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, owner_line_user_id, login_notify_enabled')
    .maybeSingle()
  if (!data?.login_notify_enabled) return
  if (!data?.encrypted_channel_access_token || !data?.owner_line_user_id) return

  const token = await decryptSecret(data.encrypted_channel_access_token)
  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: data.owner_line_user_id,
      messages: [{ type: 'text', text: `🔐 มีการเข้าสู่ระบบ\nเวลา: ${now}\n\nถ้าไม่ใช่คุณ → เข้าตั้งค่าและเปลี่ยนรหัสผ่านทันที` }],
    }),
  })
}

export async function login(_: unknown, formData: FormData): Promise<LoginState> {
  const email    = String(formData.get('email')    ?? '')
  const password = String(formData.get('password') ?? '')
  const normalizedEmail = email.trim().toLowerCase()
  const ip = await getClientIp()

  if (
    await isRateLimited(`login:ip:${ip}`, 5, 15 * 60) ||
    await isRateLimited(`login:email:${normalizedEmail}`, 10, 15 * 60)
  ) {
    void logSecurityEvent('login_rate_limited', 'Login attempt rate limited')
    return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    void logSecurityEvent('login_failed', 'Login failed')
    return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    const { data: { user } } = await supabase.auth.getUser()
    void logSecurityEvent('login_password_verified', 'Password accepted; MFA verification required', user?.id ?? null)
    redirect('/mfa')
  }

  await finalizeLogin('password')
  return undefined
}

export async function finalizeLogin(method: 'password' | 'mfa' = 'password'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  void logSecurityEvent('login_success', `Login completed with ${method}`, user?.id ?? null)
  sendLoginNotification().catch(() => {})
  redirect('/rooms')
}

export async function verifyMfa(_: unknown, formData: FormData): Promise<{ error?: string }> {
  const factorId   = String(formData.get('factor_id')   ?? '')
  const challengeId = String(formData.get('challenge_id') ?? '')
  const code       = String(formData.get('code')        ?? '').replace(/\s/g, '')

  if (!factorId || !/^\d{6}$/.test(code)) return { error: 'กรุณากรอกรหัส 6 หลักจากแอป Authenticator' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const { error } = challengeId
    ? await supabase.auth.mfa.verify({ factorId, challengeId, code })
    : await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) {
    const blocked = await isRateLimited(`mfa:verify:${user.id}`, 5, 5 * 60)
    void logSecurityEvent('mfa_failed', 'MFA verification failed', user.id)
    return { error: blocked ? 'ลองรหัสผิดหลายครั้ง กรุณารอ 5 นาที' : 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }
  }

  await finalizeLogin('mfa')
  return {}
}

export async function logMfaSecurityEvent(action: 'mfa_enabled' | 'mfa_disabled') {
  const user = await getAuthedUser()
  if (!user) return
  void logSecurityEvent(action, action === 'mfa_enabled' ? 'MFA enabled' : 'MFA disabled', user.id)
}

export async function cleanupStaleMfaFactors(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const service = createServiceClient()
  const { data } = await service.auth.admin.mfa.listFactors({ userId: user.id })
  await Promise.all(
    (data?.factors ?? [])
      .filter((f) => f.status === 'unverified')
      .map((f) => service.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id }))
  )
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
