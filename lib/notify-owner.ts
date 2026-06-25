import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { sendOwnerTelegramMessage } from '@/lib/telegram'
import { maybeDecryptSecret } from '@/lib/crypto-secrets'

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

type SettingsRow = Record<string, unknown>

function buildLineFlexMessage(text: string, link: { label: string; url: string }) {
  return {
    type: 'flex',
    altText: text.slice(0, 400),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text, wrap: true, size: 'sm' }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: link.label, uri: link.url },
          style: 'primary',
        }],
      },
    },
  }
}

async function sendOwnerLineMessage(text: string, link?: { label: string; url: string }): Promise<void> {
  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig?.ownerLineUserId) return
  const message = link ? buildLineFlexMessage(text, link) : { type: 'text', text }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineConfig.channelAccessToken}` },
    body: JSON.stringify({ to: lineConfig.ownerLineUserId, messages: [message] }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[line owner notify]', res.status, body)
  }
}

export async function notifyOwner(text: string, type?: OwnerNotifyType, link?: { label: string; url: string }): Promise<void> {
  const supabase = createServiceClient()
  // Single DB read: fetch channel setting, toggles, AND telegram credentials together
  const { data: rawData, error: dbErr } = await supabase
    .from('settings')
    .select('owner_notify_channel, telegram_bot_token, telegram_chat_id, notify_slip_enabled, notify_repair_enabled, notify_registration_enabled, notify_contract_enabled, notify_lead_enabled, notify_daily_summary_enabled, notify_reminder_summary_enabled, notify_expiring_contract_enabled')
    .eq('id', 1)
    .maybeSingle()

  if (dbErr) console.error('[notify-owner] settings fetch failed', dbErr.message)

  const data = rawData as unknown as SettingsRow | null

  // Check type-specific toggle (default: enabled when column missing)
  if (type && data) {
    const col = TYPE_COLUMN[type]
    if (data[col] === false) return
  }

  const channel = (data?.owner_notify_channel as string | null) ?? 'telegram'

  const tasks: Promise<void>[] = []

  if (channel === 'telegram' || channel === 'both') {
    const rawToken = data?.telegram_bot_token as string | null
    const chatId = data?.telegram_chat_id as string | null
    if (rawToken && chatId) {
      tasks.push(
        maybeDecryptSecret(rawToken)
          .then((token) => sendOwnerTelegramMessage(text, token, chatId, link))
          .catch((e) => { console.error('[telegram decrypt]', e) })
      )
    } else {
      console.warn('[notify-owner] Telegram credentials missing in settings')
    }
  }

  if (channel === 'line' || channel === 'both') {
    tasks.push(sendOwnerLineMessage(text, link))
  }

  if (tasks.length === 0) {
    console.warn('[notify-owner] no channel configured — notification dropped')
  }

  await Promise.allSettled(tasks)
}
