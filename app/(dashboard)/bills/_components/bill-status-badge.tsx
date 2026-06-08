import type { BillStatus } from '@/lib/definitions'

const config: Record<BillStatus, { label: string; dot: string; className: string; pulse?: boolean }> = {
  pending:   { label: 'รอชำระ',    dot: 'bg-amber-400',   className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'      },
  paid:      { label: 'ชำระแล้ว',  dot: 'bg-emerald-400', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  overdue:   { label: 'เกินกำหนด', dot: 'bg-rose-500',    className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-300', pulse: true },
  cancelled: { label: 'ยกเลิก',    dot: 'bg-slate-400',   className: 'bg-slate-100 text-slate-500'                           },
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const { label, dot, className, pulse } = config[status] ?? config.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      <span className="relative flex size-1.5">
        {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dot} opacity-60`} />}
        <span className={`relative inline-flex size-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  )
}
