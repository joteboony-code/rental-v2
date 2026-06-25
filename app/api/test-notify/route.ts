import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { maybeDecryptSecret } from '@/lib/crypto-secrets'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('x-cron-secret') !== secret && new URL(req.url).searchParams.get('secret') !== secret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result: Record<string, unknown> = {}

  // 1. ENCRYPTION_KEY
  result.encryption_key_set = !!process.env.ENCRYPTION_KEY

  // 2. Read settings from DB
  const supabase = createServiceClient()
  const { data, error: dbErr } = await supabase
    .from('settings')
    .select('owner_notify_channel, telegram_bot_token, telegram_chat_id')
    .eq('id', 1)
    .maybeSingle()

  result.db_error = dbErr?.message ?? null
  result.channel = (data as Record<string, unknown> | null)?.owner_notify_channel ?? null
  result.token_present = !!((data as Record<string, unknown> | null)?.telegram_bot_token)
  result.token_prefix = ((data as Record<string, unknown> | null)?.telegram_bot_token as string | null)?.slice(0, 5) ?? null
  result.chat_id = (data as Record<string, unknown> | null)?.telegram_chat_id ?? null

  // 3. Decrypt token
  const rawToken = (data as Record<string, unknown> | null)?.telegram_bot_token as string | null
  let decryptedToken: string | null = null
  let decryptError: string | null = null
  if (rawToken) {
    try {
      decryptedToken = await maybeDecryptSecret(rawToken)
      result.decrypt_ok = true
      result.token_last4 = decryptedToken.slice(-4)
    } catch (e) {
      decryptError = String(e)
      result.decrypt_ok = false
      result.decrypt_error = decryptError
    }
  } else {
    result.decrypt_ok = false
    result.decrypt_error = 'no token in DB'
  }

  // 4. Send test Telegram message
  if (decryptedToken && result.chat_id) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${decryptedToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: result.chat_id, text: '🔔 ทดสอบการแจ้งเตือน Telegram' }),
      })
      const body = await res.json() as unknown
      result.telegram_status = res.status
      result.telegram_ok = res.ok
      result.telegram_response = body
    } catch (e) {
      result.telegram_ok = false
      result.telegram_error = String(e)
    }
  } else {
    result.telegram_ok = false
    result.telegram_skip = 'missing token or chat_id'
  }

  return NextResponse.json(result)
}
