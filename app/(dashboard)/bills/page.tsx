import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { BillStatusBadge } from './_components/bill-status-badge'
import { ClipboardList, Download, History, ArrowRight, Wallet } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { BulkLineButton } from './_components/bulk-line-button'
import { BillingMonthNav } from './_components/billing-month-nav'
import { SendRemindersButton } from './_components/send-reminders-button'
import { SnoozeButton } from './_components/snooze-button'
import { LineQuotaBadge } from './_components/line-quota-badge'
import { parseReminderDays, isTodayReminderDay, nextReminderDay } from '@/lib/reminder-utils'
import { CountUp } from '@/components/ui/count-up'

interface Props {
  searchParams: Promise<{ month?: string; status?: string }>
}

export default async function BillsPage({ searchParams }: Props) {
  const { month, status } = await searchParams

  const supabase = await createClient()

  // ดึง settings และ bills พร้อมกัน (แต่ billing month ต้องรู้ก่อน query bills)
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('current_billing_month, reminder_days, reminder_enabled')
    .eq('id', 1)
    .single()

  const settingsMonth = settingsRow?.current_billing_month
    ? (settingsRow.current_billing_month as string).slice(0, 7)
    : null
  const reminderDays   = parseReminderDays((settingsRow?.reminder_days as string | null) ?? '5,10')
  const reminderActive = settingsRow?.reminder_enabled !== false
  const todayIsRemDay  = reminderActive && isTodayReminderDay(reminderDays)
  const nextRemDay     = nextReminderDay(reminderDays)

  const now = new Date()
  const currentMonth = month ?? settingsMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yearStr, monthStr] = currentMonth.split('-')
  const billingMonth = `${yearStr}-${monthStr}-01`

  let billsQuery = supabase
    .from('bills')
    .select(`*, rooms ( room_number, floor ), tenants ( full_name, phone ), snooze_until, snooze_note`)
    .eq('billing_month', billingMonth)

  if (status && ['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
    billsQuery = billsQuery.eq('status', status)
  }

  // ดึง filtered bills + all bills stats พร้อมกัน
  const [{ data: rawBills }, { data: allBills }] = await Promise.all([
    billsQuery,
    supabase.from('bills').select('status, total_amount').eq('billing_month', billingMonth),
  ])
  // numeric sort by room_number (stored as text → "10" < "2" alphabetically)
  const bills = rawBills?.slice().sort((a, b) => {
    const ra = (a.rooms as { room_number: string } | null)?.room_number ?? ''
    const rb = (b.rooms as { room_number: string } | null)?.room_number ?? ''
    return (parseInt(ra) || 0) - (parseInt(rb) || 0)
  })
  const stats = {
    total:   allBills?.length ?? 0,
    pending: allBills?.filter((b) => b.status === 'pending').length  ?? 0,
    paid:    allBills?.filter((b) => b.status === 'paid').length     ?? 0,
    overdue: allBills?.filter((b) => b.status === 'overdue').length  ?? 0,
    revenue: allBills?.filter((b) => b.status === 'paid')
              .reduce((s, b) => s + Number(b.total_amount), 0) ?? 0,
    total_amount: allBills?.reduce((s, b) => s + Number(b.total_amount), 0) ?? 0,
  }

  const monthLabel = new Date(billingMonth).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })

  const filterTabs = [
    { value: '',        label: 'ทั้งหมด',   count: stats.total   },
    { value: 'pending', label: 'รอชำระ',   count: stats.pending },
    { value: 'paid',    label: 'ชำระแล้ว', count: stats.paid    },
    { value: 'overdue', label: 'เกินกำหนด', count: stats.overdue },
  ]

  const paidPct = stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ประจำเดือน {monthLabel}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">บิล / ชำระเงิน</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
            <Link href="/bills/payments"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' hidden md:inline-flex rounded-xl gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50'}>
              <Wallet className="size-3.5" /> ประวัติชำระ
            </Link>
            <Link href="/bills/history"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' hidden md:inline-flex rounded-xl gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50'}>
              <History className="size-3.5" /> ประวัติบิล
            </Link>
            <a href={`/bills/export?month=${currentMonth}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' hidden md:inline-flex rounded-xl gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50'}>
              <Download className="size-3.5" /> Export เดือน
            </a>
            <a href={`/bills/export?year=${yearStr}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' hidden md:inline-flex rounded-xl gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50'}>
              <Download className="size-3.5" /> Export ทั้งปี
            </a>
            <Link href={`/bills/meter?month=${currentMonth}`}
              className={buttonVariants({ variant: 'default', size: 'sm' }) + ' rounded-xl gap-1.5 bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
              <ClipboardList className="size-3.5" /> บันทึกมิเตอร์
            </Link>
          </div>
        </div>
      </div>

      {/* ── Billing month nav + action buttons ── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <BillingMonthNav currentMonth={currentMonth} />
          <div className="flex items-center gap-2">
            <SendRemindersButton
              billingMonth={billingMonth}
              isReminderDay={todayIsRemDay}
              nextReminderDay={nextRemDay}
              reminderDays={reminderDays}
            />
            <BulkLineButton billingMonth={billingMonth} />
          </div>
        </div>
        <Suspense fallback={null}>
          <LineQuotaBadge />
        </Suspense>
      </div>

      {/* ── Month picker ── */}
      <form method="get" className="flex items-center gap-2">
        <input type="month" name="month" defaultValue={currentMonth}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm" />
        <button type="submit"
          className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-colors text-slate-600">
          ดู
        </button>
      </form>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-white to-slate-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">ทั้งหมด</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight"><CountUp value={stats.total} /></p>
          <p className="text-xs text-slate-400 mt-1">รายการ</p>
        </div>
        <div className="bg-gradient-to-br from-white to-amber-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest mb-2">รอชำระ</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight"><CountUp value={stats.pending} /></p>
          <p className="text-xs text-slate-400 mt-1">รายการ</p>
        </div>
        <div className="bg-gradient-to-br from-white to-emerald-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-2">ชำระแล้ว</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight"><CountUp value={stats.paid} /></p>
          <p className="text-xs text-slate-400 mt-1">รายการ</p>
        </div>
        <div className="bg-gradient-to-br from-white to-rose-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest mb-2">เกินกำหนด</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight"><CountUp value={stats.overdue} /></p>
          <p className="text-xs text-slate-400 mt-1">รายการ</p>
        </div>
      </div>

      {/* ── Revenue + progress ── */}
      {stats.total > 0 && (
        <div className="bg-slate-950 rounded-2xl p-5 md:p-6 text-white">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">รายได้ที่รับแล้ว</p>
              <p className="text-3xl md:text-4xl font-bold tracking-tight">
                ฿<CountUp value={stats.revenue} format="currency-th" />
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs mb-1">จากยอดรวม</p>
              <p className="text-slate-300 font-semibold text-lg">฿{stats.total_amount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all duration-700"
              style={{ width: `${paidPct}%` }} />
          </div>
          <p className="text-slate-400 text-xs mt-2">{paidPct}% ชำระแล้ว</p>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTabs.map(({ value, label, count }) => (
          <Link key={value}
            href={`/bills?month=${currentMonth}${value ? `&status=${value}` : ''}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              (status ?? '') === value
                ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}>
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
              (status ?? '') === value ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
            }`}>{count}</span>
          </Link>
        ))}
      </div>

      {/* ── Table / Cards ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!bills || bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <p className="font-semibold text-slate-600 mb-1">ยังไม่มีบิลในเดือนนี้</p>
            <Link href={`/bills/meter?month=${currentMonth}`}
              className={buttonVariants({ variant: 'default', size: 'sm' }) + ' mt-4 rounded-xl bg-slate-950 hover:bg-slate-800'}>
              บันทึกมิเตอร์ + ออกบิล
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ห้อง</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ผู้เช่า</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-blue-400 uppercase tracking-widest">น้ำ</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-widest">ไฟ</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">รวม</th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">สถานะ</th>
                  <th className="px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">แจ้งเตือน</th>
                  <th className="px-5 py-4 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const room   = bill.rooms   as { room_number: string; floor: number | null } | null
                  const tenant = bill.tenants as { full_name: string } | null
                  return (
                    <tr key={bill.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 transition-colors">
                            {room?.room_number ?? '—'}
                          </div>
                          <span className="text-xs text-slate-400">แถวที่ {roomRow(room?.room_number ?? '1')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700 font-medium">{tenant?.full_name ?? '—'}</td>
                      <td className="px-4 py-4 text-right text-blue-600 font-medium">{Number(bill.water_amount).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-amber-600 font-medium">{Number(bill.electricity_amount).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-bold text-slate-950">
                        ฿{Number(bill.total_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <BillStatusBadge status={bill.status} />
                      </td>
                      <td className="px-4 py-4">
                        {bill.status !== 'paid' && (
                          <SnoozeButton
                            billId={bill.id}
                            snoozeUntil={(bill.snooze_until as string | null) ?? null}
                            snoozeNote={(bill.snooze_note as string | null) ?? null}
                          />
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/bills/${bill.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                          ดูบิล <ArrowRight className="size-3.5" strokeWidth={1.8} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-slate-100">
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-sm font-medium text-slate-500 text-right">
                    รวม {bills.length} รายการ
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">
                    ฿{bills.reduce((s, b) => s + Number(b.total_amount), 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {bills.map((bill) => {
                const room   = bill.rooms   as { room_number: string; floor: number | null } | null
                const tenant = bill.tenants as { full_name: string } | null
                return (
                  <Link key={bill.id} href={`/bills/${bill.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                    <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                      {room?.room_number ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{tenant?.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="text-blue-500">น้ำ {Number(bill.water_amount).toLocaleString()}</span>
                        <span className="mx-1">·</span>
                        <span className="text-amber-500">ไฟ {Number(bill.electricity_amount).toLocaleString()}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-bold text-slate-950 text-sm">฿{Number(bill.total_amount).toLocaleString()}</p>
                      <BillStatusBadge status={bill.status} />
                    </div>
                  </Link>
                )
              })}
              <div className="px-4 py-3 flex justify-between items-center bg-slate-50">
                <span className="text-xs text-slate-500">{bills.length} รายการ</span>
                <span className="text-sm font-bold text-slate-900">
                  ฿{bills.reduce((s, b) => s + Number(b.total_amount), 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


