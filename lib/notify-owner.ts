import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { sendOwnerTelegramMessage } from '@/lib/telegram'

async function sendOwnerLineMessage(text: string): Promise<void> {
  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig?.ownerLineUserId) return
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineConfig.channelAccessToken}` },
    body: JSON.stringify({ to: lineConfig.ownerLineUserId, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[line owner notify]', res.status, body)
  }
}

export async function notifyOwner(text: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('settings')
    .select('owner_notify_channel')
    .eq('id', 1)
    .maybeSingle()

  const channel = (data?.owner_notify_channel as string | null) ?? 'telegram'

  const tasks: Promise<void>[] = []
  if (channel === 'telegram' || channel === 'both') tasks.push(sendOwnerTelegramMessage(text))
  if (channel === 'line' || channel === 'both') tasks.push(sendOwnerLineMessage(text))

  await Promise.allSettled(tasks)
}
