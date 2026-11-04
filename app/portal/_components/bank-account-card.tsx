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

      {bankName && (
        <p className="text-sm font-semibold text-slate-800">{bankName}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          {accountName && (
            <p className="truncate text-xs text-slate-500">{accountName}</p>
          )}
          <p className="truncate font-mono text-xl font-bold tracking-wide text-slate-950">
            {accountNo}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors bg-slate-950 text-white hover:bg-slate-800"
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
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
