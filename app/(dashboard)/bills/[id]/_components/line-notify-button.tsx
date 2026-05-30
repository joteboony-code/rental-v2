'use client'

import { useState, useTransition } from 'react'
import { sendLineBillNotification } from '@/app/actions/line'
import { MessageCircle, Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react'

interface Props {
  billId:         string
  hasLineUserId:  boolean
}

export function LineNotifyButton({ billId, hasLineUserId }: Props) {
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [pending, setPending] = useState<'text' | 'flex' | null>(null)

  function send(mode: 'text' | 'flex') {
    setResult(null)
    setPending(mode)
    setOpen(false)
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Text message */}
        <button
          type="button"
          onClick={() => send('text')}
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

        {/* Flex message */}
        <button
          type="button"
          onClick={() => send('flex')}
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
    </div>
  )
}
