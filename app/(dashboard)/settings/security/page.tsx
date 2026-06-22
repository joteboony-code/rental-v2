import Link from 'next/link'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { TwoFactorSection } from '../_components/two-factor-section'
import { ChangePasswordSection } from '../_components/change-password-section'

export default function SecuritySettingsPage() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ตั้งค่า</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ความปลอดภัย</h1>
          </div>
        </div>
      </div>

      <TwoFactorSection />
      <ChangePasswordSection />
    </div>
  )
}
