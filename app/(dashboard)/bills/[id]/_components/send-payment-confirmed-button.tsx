'use client'

import { useState, useTransition } from 'react'
import { sendPaymentConfirmedNotification } from '@/app/actions/line'
import { CheckCircle, Loader2, Check, AlertCircle } from 'lucide-react'

interface Props {
  billId: string
  hasLineUserId: boolean
}

export function SendPaymentConfirmedButton({ billId, hasLineUserId }: Props) {
  const [, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [pending, setPending] = useState(false)

  if (!hasLineUserId) return null

  function send() {
    setResult(null)
    setPending(true)
    startTransition(async () => {
      const res = await sendPaymentConfirmedNotification(billId)
      setResult(res)
      setPending(false)
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-sm shadow-emerald-500/20"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle className="size-3.5" />
        )}
        ส่ง LINE ยืนยันชำระ
      </button>

      {result && (
        <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          {result.success
            ? <Check className="size-3.5 shrink-0" />
            : <AlertCircle className="size-3.5 shrink-0" />}
          {result.message}
        </div>
      )}
    </div>
  )
}
