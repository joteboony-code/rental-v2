import { createServiceClient } from '@/lib/supabase/service'

export async function sendOwnerTelegramMessage(text: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('settings')
    .select('telegram_bot_token, telegram_chat_id')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.telegram_bot_token || !data?.telegram_chat_id) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${data.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: data.telegram_chat_id, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[telegram]', res.status, body)
    }
  } catch (e) {
    console.error('[telegram]', e)
  }
}
