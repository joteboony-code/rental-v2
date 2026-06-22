import Link from 'next/link'
import { ChevronLeft, QrCode, PenLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PaymentSettingsForm } from '../_components/payment-settings-form'
import { OwnerSignatureUpload } from '../_components/owner-signature-upload'

export default async function PaymentSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('promptpay_id, promptpay_name, bank_accounts_text, owner_signature_url')
    .eq('id', 1)
    .single()

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <QrCode className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ตั้งค่า</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">การชำระเงิน</h1>
          </div>
        </div>
      </div>

      <PaymentSettingsForm settings={settings ?? undefined} />

      {/* ── ลายเซ็นเจ้าของหอ ── */}
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
    </div>
  )
}
