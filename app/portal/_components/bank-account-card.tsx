'use client'

import { useState } from 'react'
import { Ban, Banknote, Check, Copy } from 'lucide-react'

type BankAccount = {
  bankName: string | null | undefined
  accountNo: string | null | undefined
  accountName: string | null | undefined
}

// แสดงเลขบัญชีธนาคาร + ปุ่มคัดลอก (ใช้แทน QR PromptPay ใน Portal)
export function BankAccountCard({
  bankAccount,
  amountLabel,
}: {
  bankAccount: BankAccount
  amountLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  const { bankName, accountNo, accountName } = bankAccount
  const hasAccount = Boolean(accountNo)

  const getBankStyle = () => {
    if (!bankName) return { bg: 'bg-slate-50', text: 'text-slate-950', subText: 'text-slate-500', btn: 'bg-slate-950', border: 'border-slate-950' }
    
    const name = bankName.toLowerCase()
    if (name.includes('กสิกร')) {
      return { bg: 'bg-[#00A950]', text: 'text-white', subText: 'text-emerald-100', btn: 'bg-white text-[#00A950]', border: 'border-[#00A950]' }
    }
    if (name.includes('ttb') || name.includes('ทหารไทย')) {
      return { bg: 'bg-[#0056B3]', text: 'text-white', subText: 'text-blue-100', btn: 'bg-white text-[#0056B3]', border: 'border-[#0056B3]' }
    }
    if (name.includes('กรุงศรี')) {
      return { bg: 'bg-[#FFD700]', text: 'text-slate-900', subText: 'text-slate-700', btn: 'bg-slate-900 text-white', border: 'border-amber-500' }
    }
    return { bg: 'bg-slate-50', text: 'text-slate-950', subText: 'text-slate-500', btn: 'bg-slate-950', border: 'border-slate-950' }
  }

  const style = getBankStyle()

  async function handleCopy() {
    if (!accountNo) return
    try {
      await navigator.clipboard.writeText(accountNo)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API อาจไม่พร้อมในบางบริบท → fallback ด้วย text selection
      setCopied(false)
    }
  }

  if (!hasAccount) return null

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
        <Ban className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">ยกเลิกแล้ว</span> — ได้ยกเลิกการชำระผ่าน QR PromptPay ตามนโยบายใหม่
          กรุณาโอนผ่านเลขบัญชีด้านล่างนี้แทน
        </p>
      </div>

      <div className="mt-3 mb-3 flex items-center gap-2">
        <Banknote className="size-4 text-slate-400" />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          ชำระผ่านเลขบัญชี
        </p>
      </div>

      <div className={`mt-2 rounded-2xl border-2 ${style.border} ${style.bg} px-4 py-4 text-center transition-colors`}>
        {bankName && (
          <p className={`text-sm font-semibold ${style.text}`}>{bankName}</p>
        )}
        {accountName && (
          <p className={`mt-0.5 text-xs ${style.subText}`}>{accountName}</p>
        )}
        <p className={`mt-1 break-all font-mono text-3xl font-extrabold tracking-wider ${style.text}`}>
          {accountNo}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl ${style.btn} px-4 py-3 text-base font-bold transition-colors hover:opacity-90 active:scale-[0.99]`}
        >
          {copied ? <Check className="size-5 text-emerald-400" /> : <Copy className="size-5" />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}
        </button>
      </div>

      {amountLabel && (
        <p className="mt-3 text-center text-xs text-slate-400">{amountLabel}</p>
      )}

      {/* Fallback: ถ้า Clipboard API ล้มเหลว ผู้ใช้ยังเห็นเลขบัญชีชัดเจน */}
      <p className="mt-3 text-center text-xs text-slate-400">
        โอนแล้วอย่าลืมส่งสลิปให้เจ้าของห้องนะครับ 🙏
      </p>
    </div>
  )
}
