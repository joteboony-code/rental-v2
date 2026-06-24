import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { sendOwnerTelegramMessage } from '@/lib/telegram'

export type OwnerNotifyType =
  | 'slip'
  | 'repair'
  | 'registration'
  | 'contract'
  | 'lead'
  | 'daily_summary'
  | 'reminder_summary'
  | 'expiring_contract'

const TYPE_COLUMN: Record<OwnerNotifyType, string> = {
  slip:               'notify_slip_enabled',
  repair:             'notify_repair_enabled',
  registration:       'notify_registration_enabled',
  contract:           'notify_contract_enabled',
  lead:               'notify_lead_enabled',
  daily_summary:      'notify_daily_summary_enabled',
  reminder_summary:   'notify_reminder_summary_enabled',
  expiring_contract:  'notify_expiring_contract_enabled',
}

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

export async function notifyOwner(text: string, type?: OwnerNotifyType): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('settings')
    .select([
      'owner_notify_channel',
      ...Object.values(TYPE_COLUMN),
    ].join(', '))
    .eq('id', 1)
    .maybeSingle()

  // Check type-specific toggle (default: enabled)
  if (type && data) {
    const col = TYPE_COLUMN[type]
    if ((data as unknown as Record<string, unknown>)[col] === false) return
  }

  const channel = (data?.owner_notify_channel as string | null) ?? 'telegram'

  const tasks: Promise<void>[] = []
  if (channel === 'telegram' || channel === 'both') tasks.push(sendOwnerTelegramMessage(text))
  if (channel === 'line' || channel === 'both') tasks.push(sendOwnerLineMessage(text))

  await Promise.allSettled(tasks)
}
