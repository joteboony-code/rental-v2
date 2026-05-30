import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, TrendingUp, CheckCircle, Clock, AlertTriangle } from 'lucide-react'

export default async function BillingHistoryPage() {
  const supabase = await createClient()

  // Group bills by month
  const { data: bills } = await supabase
    .from('bills')
    .select('billing_month, total_amount, status')
    .order('billing_month', { ascending: false })

  // Aggregate by month client-side (Supabase doesn't support GROUP BY easily)
  const monthMap: Record<string, {
    total_bills: number
    paid: number
    pending: number
    overdue: number
    total_amount: number
    paid_amount: number
  }> = {}

  for (const b of bills ?? []) {
    const m = (b.billing_month as string).slice(0, 7)
    if (!monthMap[m]) {
      monthMap[m] = { total_bills: 0, paid: 0, pending: 0, overdue: 0, total_amount: 0, paid_amount: 0 }
    }
    monthMap[m].total_bills++
    monthMap[m].total_amount += Number(b.total_amount)
    if (b.status === 'paid')    { monthMap[m].paid++;    monthMap[m].paid_amount += Number(b.total_amount) }
    if (b.status === 'pending') monthMap[m].pending++
    if (b.status === 'overdue') monthMap[m].overdue++
  }

  const months = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0]))

  const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <Link href="/bills"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> บิลทั้งหมด
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">รายงาน</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ประวัติรอบบิล</h1>
      </div>

      {/* Monthly cards */}
      {months.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center text-slate-400">
          <TrendingUp className="size-8 mx-auto mb-3 text-slate-300" />
          <p>ยังไม่มีประวัติบิล</p>
        </div>
      ) : (
        <div className="space-y-3">
          {months.map(([month, stats]) => {
            const paidPct   = stats.total_bills > 0 ? Math.round((stats.paid / stats.total_bills) * 100) : 0
            const monthLabel = new Date(month + '-01').toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
            return (
              <div key={month} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <Link href={`/admin/bills?month=${month}`}
                      className="font-bold text-slate-950 hover:text-slate-700 text-lg">
                      {monthLabel}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">{stats.total_bills} บิล</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-950">฿{fmt(stats.total_amount)}</p>
                    <p className="text-xs text-emerald-600 font-semibold">เก็บได้ ฿{fmt(stats.paid_amount)}</p>
                  </div>
                </div>

                {/* Status pills */}
                <div className="px-5 pb-4 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                    <CheckCircle className="size-3" /> ชำระแล้ว {stats.paid}
                  </span>
                  {stats.pending > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                      <Clock className="size-3" /> รอชำระ {stats.pending}
                    </span>
                  )}
                  {stats.overdue > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2 py-1 rounded-full">
                      <AlertTriangle className="size-3" /> เกินกำหนด {stats.overdue}
                    </span>
                  )}
                  <div className="flex-1 min-w-[120px]">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 text-right">{paidPct}%</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

