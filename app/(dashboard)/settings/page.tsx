import { createClient } from '@/lib/supabase/server'
import { updateSettings } from '@/app/actions/settings'
import { SettingsForm } from './_components/settings-form'
import { Settings } from 'lucide-react'
import { getLineIntegrationPublic } from '@/lib/line-integration'

export default async function SettingsPage() {
  const supabase = await createClient()
  const [{ data: settings }, lineIntegration] = await Promise.all([
    supabase
      .from('settings')
      .select(
        'id, water_unit_price, electricity_unit_price, late_fee_per_day, billing_day, due_day, promptpay_id, promptpay_name, trash_fee, current_billing_month, reminder_days, reminder_enabled, anomaly_threshold_pct, slipok_branch_id, bank_accounts_text, updated_at'
      )
      .eq('id', 1)
      .single(),
    getLineIntegrationPublic(),
  ])

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ระบบ</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight flex items-center gap-2">
          <Settings className="size-6 text-slate-400" strokeWidth={1.75} />
          ตั้งค่า
        </h1>
      </div>

      <SettingsForm
        action={updateSettings}
        settings={settings ?? undefined}
        lineIntegration={lineIntegration ?? undefined}
      />
    </div>
  )
}
