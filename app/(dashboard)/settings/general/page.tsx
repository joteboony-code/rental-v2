import Link from 'next/link'
import { ChevronLeft, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateGeneralSettings } from '@/app/actions/settings'
import { GeneralSettingsForm } from '../_components/general-settings-form'

export default async function GeneralSettingsPage() {
  const supabase = await createClient()
  const [{ data: settings }, { data: slipokRow }] = await Promise.all([
    supabase
      .from('settings')
      .select('id, water_unit_price, electricity_unit_price, late_fee_per_day, billing_day, due_day, trash_fee, reminder_days, reminder_enabled, meter_ocr_enabled, anomaly_threshold_pct, slipok_branch_id')
      .eq('id', 1)
      .single(),
    supabase.from('settings').select('slipok_api_key').eq('id', 1).single(),
  ])

  const hasSlipokKey = !!(slipokRow?.slipok_api_key && String(slipokRow.slipok_api_key).trim())

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Zap className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ตั้งค่า</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ทั่วไป</h1>
          </div>
        </div>
      </div>

      <GeneralSettingsForm
        action={updateGeneralSettings}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings={settings as any}
        hasSlipokKey={hasSlipokKey}
      />
    </div>
  )
}
