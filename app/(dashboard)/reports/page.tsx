import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BarChart2 } from 'lucide-react'

interface Props {
  searchParams: Promise<{ year?: string }>
}

const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const pct = (a: number, b: number) =>
  b === 0 ? 0 : Math.round((a / b) * 100)

export default async function ReportsPage({ searchParams }: Props) {
  const { year: yearParam } = await searchParams
  const currentYear = new Date().getFullYear()
  const year = yearParam ? parseInt(yearParam) : currentYear

  const yearStart = `${year}-01-01`
  const yearEnd   = `${year + 1}-01-01`

  const supabase = await createClient()

  // ── 1. Monthly actual revenue (payments joined with bills, filtered by billing_month in year) ──
  const { data: paymentsRaw } = await supabase
    .from('payments')
    .select('amount, bills ( billing_month )')
    .gte('paid_at', yearStart)
    .lt('paid_at', yearEnd)

  // ── 2. Monthly expected revenue (bills not cancelled, billing_month in year) ──
  const { data: billsRaw } = await supabase
    .from('bills')
    .select('billing_month, total_amount, status')
    .gte('billing_month', yearStart)
    .lt('billing_month', yearEnd)
    .neq('status', 'cancelled')

  // ── 3. Current occupancy ──
  const { data: roomsRaw } = await supabase
    .from('rooms')
    .select('status')

  // ── Build monthly arrays ──
  const monthlyRevenue  = Array(12).fill(0) as number[]
  const monthlyExpected = Array(12).fill(0) as number[]

  type BillJoin = { billing_month: string } | null
  for (const p of paymentsRaw ?? []) {
    const bm = (p.bills as unknown as BillJoin)?.billing_month
    if (!bm) continue
    const m = new Date(bm).getMonth() // 0-indexed
    monthlyRevenue[m] += Number(p.amount)
  }

  for (const b of billsRaw ?? []) {
    const m = new Date(b.billing_month).getMonth()
    monthlyExpected[m] += Number(b.total_amount)
  }

  // ── Occupancy ──
  const rooms     = roomsRaw ?? []
  const occupied  = rooms.filter((r) => r.status === 'occupied').length
  const total     = rooms.length

  // ── Annual totals ──
  const annualRevenue  = monthlyRevenue.reduce((s, v) => s + v, 0)
  const annualExpected = monthlyExpected.reduce((s, v) => s + v, 0)
  const collectionRate = pct(annualRevenue, annualExpected)

  // ── Year selector ──
  const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear]

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
            วิเคราะห์
          </p>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
              <BarChart2 className="size-5 text-indigo-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">
              รายงานรายได้
            </h1>
          </div>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-1 bg-white rounded-2xl border border-slate-100 shadow-sm px-2 py-1.5">
          {years.map((y) => (
            <Link
              key={y}
              href={`/reports?year=${y}`}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                y === year
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">รายรับจริงทั้งปี</p>
          <p className="text-2xl font-bold text-emerald-600 leading-tight">฿{fmt(annualRevenue)}</p>
          <p className="text-xs text-slate-400">บาท</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">คาดหวังทั้งปี</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">฿{fmt(annualExpected)}</p>
          <p className="text-xs text-slate-400">บาท</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">อัตราเก็บเงิน</p>
          <p className={`text-2xl font-bold leading-tight ${
            collectionRate >= 90 ? 'text-emerald-600' :
            collectionRate >= 70 ? 'text-amber-500' : 'text-rose-500'
          }`}>
            {collectionRate}%
          </p>
          <p className="text-xs text-slate-400">ของยอดที่ออกบิล</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">ห้องที่มีผู้เช่า</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">
            {occupied}/{total}
          </p>
          <p className="text-xs text-slate-400">ห้อง ({total > 0 ? Math.round((occupied / total) * 100) : 0}%)</p>
        </div>
      </div>

      {/* ── Monthly table ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">รายได้รายเดือน ปี {year}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                เดือน
              </th>
              <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                คาดหวัง
              </th>
              <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                เก็บได้จริง
              </th>
              <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                %
              </th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest hidden sm:table-cell">
                สถานะ
              </th>
            </tr>
          </thead>
          <tbody>
            {MONTH_NAMES.map((name, i) => {
              const expected = monthlyExpected[i]
              const revenue  = monthlyRevenue[i]
              const rate     = pct(revenue, expected)
              const isFuture = year === currentYear && i > new Date().getMonth()

              let statusLabel = ''
              let statusCls   = ''
              if (isFuture) {
                statusLabel = 'ยังไม่ถึง'
                statusCls   = 'bg-slate-100 text-slate-400'
              } else if (expected === 0) {
                statusLabel = 'ไม่มีข้อมูล'
                statusCls   = 'bg-slate-100 text-slate-400'
              } else if (rate >= 95) {
                statusLabel = 'ดีมาก'
                statusCls   = 'bg-emerald-100 text-emerald-700'
              } else if (rate >= 80) {
                statusLabel = 'ดี'
                statusCls   = 'bg-blue-100 text-blue-700'
              } else if (rate >= 60) {
                statusLabel = 'พอใช้'
                statusCls   = 'bg-amber-100 text-amber-700'
              } else {
                statusLabel = 'ต่ำ'
                statusCls   = 'bg-rose-100 text-rose-700'
              }

              return (
                <tr
                  key={i}
                  className={`border-b border-slate-50 last:border-0 transition-colors ${
                    isFuture ? 'opacity-40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-slate-700">{name}</td>
                  <td className="px-4 py-3.5 text-right text-slate-500">
                    {expected > 0 ? `฿${fmt(expected)}` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                    {revenue > 0 ? `฿${fmt(revenue)}` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {expected > 0 ? (
                      <span className={`font-bold ${
                        rate >= 90 ? 'text-emerald-600' :
                        rate >= 70 ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                        {rate}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCls}`}>
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            <tr>
              <td className="px-5 py-3.5 font-bold text-slate-700">รวมทั้งปี</td>
              <td className="px-4 py-3.5 text-right font-bold text-slate-700">
                ฿{fmt(annualExpected)}
              </td>
              <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
                ฿{fmt(annualRevenue)}
              </td>
              <td className="px-4 py-3.5 text-right font-bold text-slate-700">
                {collectionRate}%
              </td>
              <td className="hidden sm:table-cell"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
