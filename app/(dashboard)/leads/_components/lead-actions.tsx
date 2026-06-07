'use client'

import { useTransition } from 'react'
import { updateLeadStatus, deleteLead } from '@/app/actions/leads'
import { Loader2, Phone, MessageCircle, CheckCircle2, XCircle, Trash2 } from 'lucide-react'

type Status = 'new' | 'contacted' | 'converted' | 'dismissed'

const statusConfig: Record<Status, { label: string; className: string }> = {
  new:       { label: 'ใหม่',        className: 'bg-sky-50 text-sky-700 border-sky-200' },
  contacted: { label: 'ติดต่อแล้ว',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  converted: { label: 'เช่าแล้ว',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  dismissed: { label: 'ไม่สนใจ',    className: 'bg-slate-50 text-slate-400 border-slate-200' },
}

export function LeadActions({ id, status, phone }: { id: string; status: Status; phone: string }) {
  const [isPending, startTransition] = useTransition()

  function setStatus(s: Status) {
    startTransition(async () => { await updateLeadStatus(id, s) })
  }

  function remove() {
    if (!confirm('ลบรายชื่อนี้?')) return
    startTransition(async () => { await deleteLead(id) })
  }

  const cfg = statusConfig[status]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Status badge */}
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
        {cfg.label}
      </span>

      {isPending ? (
        <Loader2 className="size-3.5 animate-spin text-slate-400" />
      ) : (
        <div className="flex items-center gap-1">
          {status !== 'contacted' && status !== 'converted' && (
            <button
              type="button"
              onClick={() => setStatus('contacted')}
              title="ทำเครื่องหมายว่าติดต่อแล้ว"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 transition"
            >
              <Phone className="size-3" /> ติดต่อแล้ว
            </button>
          )}
          {status !== 'converted' && (
            <button
              type="button"
              onClick={() => setStatus('converted')}
              title="เช่าแล้ว"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 transition"
            >
              <CheckCircle2 className="size-3" /> เช่าแล้ว
            </button>
          )}
          {status !== 'dismissed' && status !== 'converted' && (
            <button
              type="button"
              onClick={() => setStatus('dismissed')}
              title="ไม่สนใจ"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 transition"
            >
              <XCircle className="size-3" /> ไม่สนใจ
            </button>
          )}
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-2 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-50 transition"
          >
            <MessageCircle className="size-3" /> โทร
          </a>
          <button
            type="button"
            onClick={remove}
            className="inline-flex items-center rounded-lg border border-rose-200 p-1 text-rose-400 hover:bg-rose-50 transition"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}
