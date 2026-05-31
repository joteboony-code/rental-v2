'use client'

import { Wrench } from 'lucide-react'
import type { PortalRepairItem } from '@/app/actions/portal'

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'รอดำเนินการ', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'กำลังซ่อม',   cls: 'bg-blue-50 text-blue-700' },
  done:        { label: 'เสร็จแล้ว',   cls: 'bg-emerald-50 text-emerald-700' },
  cancelled:   { label: 'ยกเลิก',      cls: 'bg-slate-100 text-slate-500' },
}

const priorityConfig: Record<string, { label: string; cls: string }> = {
  low:    { label: 'ไม่เร่งด่วน', cls: 'text-slate-400' },
  normal: { label: 'ปกติ',       cls: 'text-slate-500' },
  high:   { label: 'เร่งด่วน',   cls: 'text-orange-600' },
  urgent: { label: 'ด่วนมาก',    cls: 'text-rose-600 font-bold' },
}

const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

type Props = { repairs: PortalRepairItem[] }

export function RepairHistory({ repairs }: Props) {
  if (repairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400">
        <Wrench className="size-8 mb-3 text-slate-300" />
        <p className="text-sm">ยังไม่มีประวัติการแจ้งซ่อม</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {repairs.map((r) => {
        const status = statusConfig[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-500' }
        const priority = priorityConfig[r.priority] ?? { label: r.priority, cls: 'text-slate-400' }
        return (
          <div key={r.id} className="rounded-xl border border-slate-100 bg-white p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-800 text-sm leading-snug">{r.title}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                {status.label}
              </span>
            </div>

            {r.description && (
              <p className="text-xs text-slate-500 leading-relaxed">{r.description}</p>
            )}

            {r.photo_url && (
              <a href={r.photo_url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.photo_url}
                  alt="รูปซ่อม"
                  className="w-full max-h-40 object-cover rounded-lg border border-slate-100"
                />
              </a>
            )}

            {r.admin_note && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <span className="font-semibold">📝 หมายเหตุ:</span> {r.admin_note}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className={priority.cls}>{priority.label}</span>
              <span>{dateFmt.format(new Date(r.created_at))}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
