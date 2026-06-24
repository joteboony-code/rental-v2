import Link from 'next/link'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateLineAndOwnerSettings } from '@/app/actions/settings'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { LineSettingsForm } from '../_components/line-settings-form'

export default async function LineSettingsPage() {
  const supabase = await createClient()
  const [{ data: settings }, lineIntegration] = await Promise.all([
    supabase
      .from('settings')
      .select('owner_name, owner_id_card, owner_address, telegram_chat_id, telegram_bot_token_last4, owner_notify_channel, notify_slip_enabled, notify_repair_enabled, notify_registration_enabled, notify_contract_enabled, notify_lead_enabled, notify_daily_summary_enabled, notify_reminder_summary_enabled, notify_expiring_contract_enabled')
      .eq('id', 1)
      .single(),
    getLineIntegrationPublic(),
  ])

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-green-100 flex items-center justify-center shrink-0">
            <MessageCircle className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ตั้งค่า</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">LINE & เอกสาร</h1>
          </div>
        </div>
      </div>

      <LineSettingsForm
        action={updateLineAndOwnerSettings}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings={settings as any}
        lineIntegration={lineIntegration ?? undefined}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        telegramChatId={(settings as any)?.telegram_chat_id ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        telegramBotTokenLast4={(settings as any)?.telegram_bot_token_last4 ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ownerNotifyChannel={(settings as any)?.owner_notify_channel ?? 'telegram'}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notifyToggles={settings as any}
      />
    </div>
  )
}
