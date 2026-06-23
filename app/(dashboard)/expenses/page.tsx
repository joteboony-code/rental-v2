import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react'
import { ExpenseForm } from './_components/expense-form'
import { DeleteExpenseButton } from './_components/delete-expense-button'

interface Props {
  searchParams: Promise<{ month?: string }>
}

type CategoryKey = 'maintenance' | 'utility' | 'common_area' | 'salary' | 'other'

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  maintenance:  'ซ่อมบำรุง',
  utility:      'สาธารณูปโภค',
  common_area:  'ส่วนกลาง',
  salary:       'เงินเดือน',
  other:        'อื่นๆ',
}

const CATEGORY_BADGE: Record<CategoryKey, string> = {
  maintenance:  'bg-amber-100 text-amber-700',
  utility:      'bg-blue-100 text-blue-700',
  common_area:  'bg-teal-100 text-teal-700',
  salary:       'bg-violet-100 text-violet-700',
  other:        'bg-slate-100 text-slate-600',
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function ExpensesPage({ searchParams }: Props) {
  const { month } = await searchParams
  const now = new Date()
  const currentMonth =
    month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [yearStr, monthStr] = currentMonth.split('-')
  const monthStart = `${yearStr}-${monthStr}-01`
  // last day of month
  const nextMonthStart = shiftMonth(currentMonth, 1)
  const monthEnd = `${nextMonthStart}-01`

  const supabase = await createClient()

  const [{ data: expenses }, { data: rooms }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, rooms ( room_number )')
      .gte('expense_date', monthStart)
      .lt('expense_date', monthEnd)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('rooms')
      .select('id, room_number')
      .eq('status', 'occupied')
      .order('room_number'),
  ])

  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0)

  const monthLabel = new Date(monthStart).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
  })

  const prevMonth = shiftMonth(currentMonth, -1)
  const nextMonth = shiftMonth(currentMonth, 1)

  const occupiedRooms = (rooms ?? []) as { id: string; room_number: string }[]

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
            การเงิน
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">
            ค่าใช้จ่าย
          </h1>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-1 bg-white rounded-2xl border border-slate-100 shadow-sm px-2 py-1.5">
          <Link
            href={`/expenses?month=${prevMonth}`}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="text-sm font-semibold text-slate-700 px-2 min-w-[130px] text-center">
            {monthLabel}
          </span>
          <Link
            href={`/expenses?month=${nextMonth}`}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* ── Summary card ── */}
      <div className="bg-slate-950 rounded-2xl p-5 text-white">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">
          ค่าใช้จ่ายรวมเดือนนี้
        </p>
        <p className="text-3xl md:text-4xl font-bold tracking-tight">
          ฿{fmt(total)}
        </p>
        <p className="text-slate-400 text-xs mt-1">{(expenses ?? []).length} รายการ</p>
      </div>

      {/* ── Add Form ── */}
      <ExpenseForm rooms={occupiedRooms} />

      {/* ── List ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!expenses || expenses.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="size-8 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-400 text-sm">ยังไม่มีค่าใช้จ่ายในเดือนนี้</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    วันที่
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    ประเภท
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    รายการ
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    ห้อง
                  </th>
                  <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    จำนวนเงิน
                  </th>
                  <th className="px-4 py-3.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const room = e.rooms as { room_number: string } | null
                  const cat  = e.category as CategoryKey
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(e.expense_date).toLocaleDateString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_BADGE[cat] ?? 'bg-slate-100 text-slate-500'}`}
                        >
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-700 line-clamp-1">{e.description}</p>
                        {e.note && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{e.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">
                        {room ? `ห้อง ${room.room_number}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-slate-950">
                        ฿{fmt(Number(e.amount))}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <DeleteExpenseButton id={e.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-slate-100">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-sm font-medium text-slate-500 text-right">
                    รวม {expenses.length} รายการ
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">
                    ฿{fmt(total)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-slate-100">
              {expenses.map((e) => {
                const room = e.rooms as { room_number: string } | null
                const cat  = e.category as CategoryKey
                return (
                  <div key={e.id} className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_BADGE[cat] ?? 'bg-slate-100 text-slate-500'}`}
                        >
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(e.expense_date).toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                        {room && (
                          <span className="text-xs text-slate-400">ห้อง {room.room_number}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-700 line-clamp-1">
                        {e.description}
                      </p>
                      {e.note && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{e.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-bold text-slate-950 text-sm">฿{fmt(Number(e.amount))}</p>
                      <DeleteExpenseButton id={e.id} />
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between items-center px-4 py-3 bg-slate-50">
                <span className="text-xs text-slate-500">{expenses.length} รายการ</span>
                <span className="text-sm font-bold text-slate-950">฿{fmt(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
