import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { updateSettings } from '@/app/actions/settings'
import { SettingsForm } from './_components/settings-form'
import { Settings, MessageSquareText, ChevronRight, PenLine } from 'lucide-react'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { OwnerSignatureUpload } from './_components/owner-signature-upload'
import { ChangePasswordSection } from './_components/change-password-section'
import { PaymentSettingsForm } from './_components/payment-settings-form'
import { TwoFactorSection } from './_components/two-factor-section'

export default async function SettingsPage() {
  const supabase = await createClient()
  const [{ data: settings }, { data: slipokRow }, lineIntegration] = await Promise.all([
    supabase
      .from('settings')
      .select(
        'id, water_unit_price, electricity_unit_price, late_fee_per_day, billing_day, due_day, promptpay_id, promptpay_name, trash_fee, current_billing_month, reminder_days, reminder_enabled, anomaly_threshold_pct, slipok_branch_id, bank_accounts_text, owner_name, owner_id_card, owner_address, owner_signature_url, updated_at'
      )
      .eq('id', 1)
      .single(),
    supabase.from('settings').select('slipok_api_key').eq('id', 1).single(),
    getLineIntegrationPublic(),
  ])

  // เช็คว่ามี API key แล้วหรือยัง โดยไม่ส่งค่าจริงไป browser
  const hasSlipokKey = !!(slipokRow?.slipok_api_key && String(slipokRow.slipok_api_key).trim())

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

      {/* ลิงก์ไปหน้าแก้ข้อความ LINE */}
      <Link href="/settings/templates"
        className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
        <div className="size-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
          <MessageSquareText className="size-4 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">ข้อความ LINE</p>
          <p className="text-xs text-slate-400">แก้ไขข้อความแจ้งเตือน รับชำระ ฯลฯ</p>
        </div>
        <ChevronRight className="size-4 text-slate-300" />
      </Link>

      {/* ── ลายเซ็นเจ้าของหอ (แยกออกมาเพราะต้อง upload file) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <PenLine className="size-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-800">ลายเซ็นเจ้าของหอ</h2>
          <span className="ml-auto text-xs text-slate-400">ฝังในสัญญาเช่า PDF อัตโนมัติ</span>
        </div>
        <div className="px-5 py-5">
          <OwnerSignatureUpload
            currentUrl={(settings as { owner_signature_url?: string | null } | null)?.owner_signature_url ?? null}
          />
        </div>
      </div>

      <PaymentSettingsForm settings={settings ?? undefined} />

      <SettingsForm
        action={updateSettings}
        settings={settings ?? undefined}
        lineIntegration={lineIntegration ?? undefined}
        hasSlipokKey={hasSlipokKey}
      />

      <TwoFactorSection />

      <ChangePasswordSection />
    </div>
  )
}
