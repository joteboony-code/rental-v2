'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'

export type LoginState =
  | { error: string }
  | { mfaRequired: true; factorId: string; challengeId: string }
  | undefined

async function sendLoginNotification() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, owner_line_user_id')
    .maybeSingle()
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

  const supabase = await createClient()
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }

  // Use admin API to reliably check verified MFA factors —
  // getAuthenticatorAssuranceLevel() reads request cookies which don't yet
  // contain the new session written by signInWithPassword in this same request.
  const userId = authData.user?.id
  if (userId) {
    const service = createServiceClient()
    const { data: mfaData } = await service.auth.admin.mfa.listFactors({ userId })
    const verifiedTotp = mfaData?.factors?.find(
      (f) => f.factor_type === 'totp' && f.status === 'verified'
    )
    if (verifiedTotp) {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id })
      if (challenge) {
        return { mfaRequired: true, factorId: verifiedTotp.id, challengeId: challenge.id }
      }
    }
  }

  sendLoginNotification().catch(() => {})
  redirect('/rooms')
}

export async function verifyMfa(_: unknown, formData: FormData): Promise<{ error?: string }> {
  const factorId   = String(formData.get('factor_id')   ?? '')
  const challengeId = String(formData.get('challenge_id') ?? '')
  const code       = String(formData.get('code')        ?? '').replace(/\s/g, '')

  if (!code || code.length !== 6) return { error: 'กรุณากรอกรหัส 6 หลัก' }

  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
  if (error) return { error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }

  sendLoginNotification().catch(() => {})
  redirect('/rooms')
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
