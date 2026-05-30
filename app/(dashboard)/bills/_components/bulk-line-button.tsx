'use client'

import { useState } from 'react'
import { sendBulkLineBillNotification } from '@/app/actions/line'
import { MessageCircle, Loader2, Check, AlertCircle, Send } from 'lucide-react'

export function BulkLineButton({ billingMonth }: { billingMonth: string }) {
  const [pending, setPending]   = useState<'text' | 'flex' | null>(null)
  const [result,  setResult]    = useState<{ success: boolean; sent: number; failed: number; message: string } | null>(null)
  const [open,    setOpen]      = useState(false)

  async function send(mode: 'text' | 'flex') {
    setPending(mode)
    setResult(null)
    const res = await sendBulkLineBillNotification(billingMonth, mode)
    setResult(res)
    setPending(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-all shadow-sm shadow-green-500/20"
      >
        <Send className="size-3.5" /> แจ้งทุกห้องผ่าน LINE
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
        <MessageCircle className="size-4 text-green-500 shrink-0" />
        <span className="text-xs text-slate-600 font-medium">ส่งทุกห้องที่รอชำระ</span>
        <div className="flex gap-1.5 ml-2">
          <button
            type="button"
            onClick={() => send('text')}
            disabled={!!pending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {pending === 'text' ? <Loader2 className="size-3 animate-spin" /> : <MessageCircle className="size-3 text-green-500" />}
            ข้อความ
          </button>
          <button
            type="button"
            onClick={() => send('flex')}
            disabled={!!pending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50"
          >
            {pending === 'flex' ? <Loader2 className="size-3 animate-spin" /> : <MessageCircle className="size-3" />}
            Flex
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setResult(null) }}
            className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            ✕
          </button>
        </div>
      </div>

      {result && (
        <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl ${
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
