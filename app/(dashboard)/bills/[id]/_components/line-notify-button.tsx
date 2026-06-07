'use client'

import { useState, useTransition } from 'react'
import { sendLineBillNotification } from '@/app/actions/line'
import { MessageCircle, Loader2, Check, AlertCircle } from 'lucide-react'

interface Props {
  billId: string
  hasLineUserId: boolean
  billingMonth: string
  currentBillingMonth: string | null
  remaining: number
  status: string
}

type SendMode = 'text' | 'flex'

function monthKey(value: string | null) {
  return value ? value.slice(0, 7) : null
}

function thaiMonth(value: string) {
  return new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export function LineNotifyButton({
  billId,
  hasLineUserId,
  billingMonth,
  currentBillingMonth,
  remaining,
  status,
}: Props) {
  const [, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [pending, setPending] = useState<SendMode | null>(null)
  const [confirmMode, setConfirmMode] = useState<SendMode | null>(null)

  const isPaid = status === 'paid' || remaining <= 0
  const isOldBill = Boolean(currentBillingMonth && monthKey(billingMonth) !== monthKey(currentBillingMonth))

  function requestSend(mode: SendMode) {
    setResult(null)
    if (isOldBill) {
      setConfirmMode(mode)
      return
    }
    send(mode)
  }

  function send(mode: SendMode) {
    setResult(null)
    setPending(mode)
    setConfirmMode(null)
    startTransition(async () => {
      const res = await sendLineBillNotification(billId, mode)
      setResult(res)
      setPending(null)
    })
  }

  if (!hasLineUserId) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
        <MessageCircle className="size-3.5" />
        ผู้เช่าไม่มี LINE User ID
      </div>
    )
  }

  if (isPaid) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
        <Check className="size-3.5" />
        บิลนี้ชำระแล้ว ไม่สามารถส่งใบแจ้งค่าเช่าได้
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => requestSend('text')}
          disabled={!!pending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50"
        >
          {pending === 'text' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MessageCircle className="size-3.5 text-green-500" />
          )}
          ข้อความ
        </button>

        <button
          type="button"
          onClick={() => requestSend('flex')}
          disabled={!!pending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50 shadow-sm shadow-green-500/20"
        >
          {pending === 'flex' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MessageCircle className="size-3.5" />
          )}
          Flex Message
        </button>
      </div>

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

      {confirmMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                <AlertCircle className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-950">ยืนยันส่งบิลเก่า</p>
                <p className="text-sm text-slate-600">
                  คุณกำลังส่งบิลเก่า รอบ {thaiMonth(billingMonth)} ยอดค้างล่าสุด {fmt(remaining)} บาท ต้องการส่งจริงหรือไม่?
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmMode(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => send(confirmMode)}
                className="rounded-xl bg-green-500 px-3 py-2 text-sm font-semibold text-white hover:bg-green-600"
              >
                ส่งจริง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
