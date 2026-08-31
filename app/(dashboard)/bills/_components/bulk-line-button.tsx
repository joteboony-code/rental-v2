'use client'

import { useState } from 'react'
import {
  sendBulkLineBillNotification,
  type BulkLineResult,
} from '@/app/actions/line'
import { MessageCircle, Loader2, Check, AlertCircle, Send, RotateCcw } from 'lucide-react'

export function BulkLineButton({ billingMonth }: { billingMonth: string }) {
  const [pending, setPending]   = useState<'text' | 'flex' | null>(null)
  const [result,  setResult]    = useState<BulkLineResult | null>(null)
  const [lastMode, setLastMode] = useState<'text' | 'flex'>('flex')
  const [open,    setOpen]      = useState(false)

  async function send(mode: 'text' | 'flex', roomIds: string[] = []) {
    setPending(mode)
    setResult(null)
    setLastMode(mode)
    try {
      const res = await sendBulkLineBillNotification(billingMonth, mode, roomIds)
      setResult(res)
    } catch {
      setResult({ success: false, sent: 0, failed: 0, recipients: 0, failures: [],
        message: 'การเชื่อมต่อขัดข้อง ผลการส่งอาจบันทึกไม่ครบ กรุณาตรวจประวัติส่ง LINE ก่อนส่งซ้ำ' })
    } finally {
      setPending(null)
    }
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

  const retryRoomIds = result?.failures
    .filter((failure) => failure.retryable)
    .flatMap((failure) => failure.roomIds) ?? []

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

      <p className="max-w-xl text-xs text-slate-500 text-right">
        ส่งครบห้องที่มี LINE แล้วจะเริ่มนับการเปิด Portal รอบบิลนี้ · ส่งซ้ำเดือนเดิมไม่รีเซ็ต
      </p>

      {result && (
        <div className={`w-full max-w-xl space-y-2 text-xs px-3 py-2 rounded-xl ${
          result.failed > 0
            ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : result.success
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          <div className="flex items-center gap-1.5 font-medium">
            {result.failed > 0
              ? <AlertCircle className="size-3.5 shrink-0" />
              : result.success
                ? <Check className="size-3.5 shrink-0" />
                : <AlertCircle className="size-3.5 shrink-0" />}
            {result.message}
          </div>

          {result.failures.length > 0 && (
            <ul className="space-y-1 pl-5">
              {result.failures.map((failure) => (
                <li key={`${failure.roomIds.join('-')}-${failure.reason}`} className="list-disc">
                  ห้อง {failure.roomNumbers.join(', ')} — {failure.reason}
                </li>
              ))}
            </ul>
          )}

          {retryRoomIds.length > 0 && (
            <button
              type="button"
              onClick={() => send(lastMode, retryRoomIds)}
              disabled={!!pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending
                ? <Loader2 className="size-3 animate-spin" />
                : <RotateCcw className="size-3" />}
              ลองส่งเฉพาะ {retryRoomIds.length} ห้องที่ล้มเหลว
            </button>
          )}
        </div>
      )}
    </div>
  )
}
