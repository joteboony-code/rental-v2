'use client'

import { useState, useTransition } from 'react'
import { snoozeBill, clearSnooze } from '@/app/actions/reminders'
import { BellOff, Loader2, Check, X } from 'lucide-react'

interface Props {
  billId:      string
  snoozeUntil: string | null
  snoozeNote:  string | null
}

export function SnoozeButton({ billId, snoozeUntil, snoozeNote }: Props) {
  const [pending, start]  = useTransition()
  const [open,    setOpen] = useState(false)
  const [date,    setDate] = useState(snoozeUntil ?? '')
  const [note,    setNote] = useState(snoozeNote ?? '')
  const [msg,     setMsg]  = useState('')

  const today    = new Date().toISOString().slice(0, 10)
  const isActive = snoozeUntil && snoozeUntil >= today

  function save() {
    if (!date) { setMsg('กรุณาเลือกวันที่'); return }
    start(async () => {
      const res = await snoozeBill(billId, date, note)
      setMsg(res.message)
      if (res.success) setOpen(false)
    })
  }

  function resume() {
    start(async () => {
      const res = await clearSnooze(billId)
      setMsg(res.message)
    })
  }

  if (isActive) {
    // Show "snoozed" badge + cancel
    const label = new Date(snoozeUntil!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">
          <BellOff className="size-3" />
          งดถึง {label}
        </span>
        <button
          type="button"
          onClick={resume}
          disabled={pending}
          title="เปิดการแจ้งเตือน"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-full border border-transparent hover:border-amber-100 transition"
      >
        <BellOff className="size-3" />
        งดแจ้งเตือน
      </button>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3 min-w-[260px]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
          <BellOff className="size-3.5" />
          งดแจ้งเตือนถึงวันที่
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="size-3.5" />
        </button>
      </div>

      <input
        type="date"
        value={date}
        min={today}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      <input
        type="text"
        placeholder="หมายเหตุ (เช่น ผู้เช่าจะจ่ายวันที่...)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      {msg && (
        <p className="text-xs text-amber-700">{msg}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !date}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-xl border border-amber-200 text-xs text-amber-700 hover:bg-amber-100 transition"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
