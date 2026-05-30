import type { RepairStatus, RepairPriority } from '@/lib/definitions'

const statusConfig: Record<RepairStatus, { label: string; dot: string; className: string }> = {
  pending:     { label: 'รอดำเนินการ', dot: 'bg-amber-400',   className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'   },
  in_progress: { label: 'กำลังซ่อม',  dot: 'bg-blue-400',    className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'      },
  done:        { label: 'เสร็จแล้ว',  dot: 'bg-emerald-400', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:   { label: 'ยกเลิก',     dot: 'bg-slate-400',   className: 'bg-slate-100 text-slate-500'                        },
}

const priorityConfig: Record<RepairPriority, { label: string; className: string }> = {
  low:    { label: 'ต่ำ',      className: 'bg-slate-100 text-slate-600'                      },
  normal: { label: 'ปกติ',    className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'       },
  high:   { label: 'สูง',      className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  urgent: { label: 'ด่วนมาก', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'   },
}

const priorityIcon: Record<RepairPriority, string> = {
  low: '🟢', normal: '🔵', high: '🟠', urgent: '🔴',
}

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  const { label, dot, className } = statusConfig[status] ?? statusConfig.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export function RepairPriorityBadge({ priority }: { priority: RepairPriority }) {
  const { label, className } = priorityConfig[priority] ?? priorityConfig.normal
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      {priorityIcon[priority]} {label}
    </span>
  )
}
