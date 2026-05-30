'use client'

import { useState } from 'react'
import { sendOverdueReminders } from '@/app/actions/reminders'
import { Bell, Loader2, Check, AlertCircle, MessageCircle, ChevronDown, X } from 'lucide-react'

interface Props {
  billingMonth:    string
  isReminderDay:   boolean
  nextReminderDay: number | null
  reminderDays:    number[]
}

export function SendRemindersButton({
  billingMonth,
  isReminderDay,
  nextReminderDay,
  reminderDays,
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [pending, setPending] = useState<'text' | 'flex' | null>(null)
  const [result,  setResult]  = useState<{
    success: boolean
    sent: number
    snoozed: number
    noLine: number
    message: string
  } | null>(null)

  async function send(mode: 'text' | 'flex') {
    setPending(mode)
    setResult(null)
    const res = await sendOverdueReminders(billingMonth, mode)
    setResult(res)
    setPending(null)
  }

  const today = new Date().getDate()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
          isReminderDay
            ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/25 animate-pulse'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300 hover:text-rose-600'
        }`}
      >
        <Bell className="size-3.5" />
        แจ้งเตือนค้างชำระ
        {isReminderDay && (
          <span className="ml-1 text-rose-200">• วันนี้</span>
        )}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-lg p-4 space-y-4 min-w-[300px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className={`size-4 ${isReminderDay ? 'text-rose-600' : 'text-slate-500'}`} />
          <p className="text-sm font-semibold text-slate-800">แจ้งเตือนค้างชำระ</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="size-4" />
        </button>
      </div>

      {/* Day indicator */}
      <div className={`text-xs px-3 py-2 rounded-xl ${
        isReminderDay
          ? 'bg-rose-50 text-rose-700 border border-rose-100'
          : 'bg-slate-50 text-slate-500 border border-slate-100'
      }`}>
        {isReminderDay ? (
          <span className="font-semibold">🔔 วันนี้เป็นวันแจ้งเตือน (วันที่ {today})</span>
        ) : (
          <>วันแจ้งเตือน: {reminderDays.map(d => `${d}`).join(', ')} · ถัดไป: วันที่ {nextReminderDay ?? '—'}</>
        )}
      </div>

      {/* Info */}
      <p className="text-xs text-slate-500">
        ส่งแจ้งเตือนไปยังผู้เช่าที่มีบิลค้างชำระ <span className="font-semibold text-amber-600">(ยกเว้นที่งดแจ้งเตือน)</span>
      </p>

      {/* Send buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => send('text')}
          disabled={!!pending}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {pending === 'text' ? <Loader2 className="size-3.5 animate-spin" /> : <MessageCircle className="size-3.5 text-green-500" />}
          ข้อความ
        </button>
        <button
          type="button"
          onClick={() => send('flex')}
          disabled={!!pending}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50"
        >
          {pending === 'flex' ? <Loader2 className="size-3.5 animate-spin" /> : <MessageCircle className="size-3.5" />}
          Flex
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          {result.success
            ? <Check className="size-3.5 shrink-0 mt-0.5" />
            : <AlertCircle className="size-3.5 shrink-0 mt-0.5" />}
          <div>
            <p className="font-semibold">{result.message}</p>
            {result.success && result.snoozed > 0 && (
              <p className="text-emerald-600 mt-0.5">งดแจ้งเตือน {result.snoozed} ห้อง (ตามที่ตั้งค่าไว้)</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
