'use client'

import { useState, useTransition } from 'react'
import { approveRegistration, rejectRegistration } from '@/app/actions/registrations'
import { Check, X, Loader2 } from 'lucide-react'

export function RegistrationActions({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition()
  const [rejectMode, setRejectMode] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  if (message) {
    return (
      <p className={`rounded-xl px-4 py-2.5 text-sm font-medium ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
        {message.text}
      </p>
    )
  }

  function handleApprove() {
    startTransition(async () => {
      const res = await approveRegistration(requestId)
      setMessage({ text: res.message, ok: res.success })
    })
  }

  function handleReject() {
    startTransition(async () => {
      const res = await rejectRegistration(requestId, adminNote || undefined)
      setMessage({ text: res.message, ok: res.success })
    })
  }

  if (rejectMode) {
    return (
      <div className="space-y-2">
        <textarea
          value={adminNote}
          onChange={e => setAdminNote(e.target.value)}
          placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)..."
          rows={2}
          className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-300 text-slate-700"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            ยืนยันปฏิเสธ
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(false)}
            className="px-4 h-10 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-600 transition-colors"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        อนุมัติ
      </button>
      <button
        type="button"
        onClick={() => setRejectMode(true)}
        disabled={isPending}
        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-rose-200 text-rose-600 text-sm font-semibold hover:bg-rose-50 transition-colors"
      >
        <X className="size-4" />
        ปฏิเสธ
      </button>
    </div>
  )
}
