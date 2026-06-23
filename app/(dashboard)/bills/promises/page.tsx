import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, CalendarClock, AlertTriangle, Clock } from 'lucide-react'
import { CancelPromiseButton } from './_components/cancel-promise-button'

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

const monthFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

type PromiseRow = {
  id: string
  promise_date: string
  amount: number | null
  note: string | null
  bill_id: string | null
  bills: {
    id: string
    billing_month: string
  } | null
  rooms: {
    room_number: string
  } | null
  tenants: {
    full_name: string
  } | null
}

export default async function PromisesPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: rawPromises } = await supabase
    .from('payment_promises')
    .select(`
      id,
      promise_date,
      amount,
      note,
      bill_id,
      bills ( id, billing_month ),
      rooms ( room_number ),
      tenants ( full_name )
    `)
    .eq('status', 'active')
    .order('promise_date', { ascending: true })

  const promises = (rawPromises ?? []) as unknown as PromiseRow[]

  const overdue  = promises.filter((p) => p.promise_date < today)
  const upcoming = promises.filter((p) => p.promise_date >= today)

  function PromiseCard({ p, tone }: { p: PromiseRow; tone: 'rose' | 'normal' }) {
    const isRose = tone === 'rose'
    return (
      <div
        className={`flex items-center gap-4 px-5 py-4 border-b last:border-0 ${
          isRose ? 'border-rose-50 hover:bg-rose-50/40' : 'border-slate-50 hover:bg-slate-50/60'
        } transition-colors`}
      >
        {/* Room badge */}
        <div
          className={`size-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
            isRose ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {p.rooms?.room_number ?? '—'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-800">
              {p.tenants?.full_name ?? '—'}
            </span>
            {p.bills?.billing_month && (
              <span className="text-xs text-slate-400">
                บิลเดือน {monthFmt(p.bills.billing_month)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span
              className={`text-xs font-semibold flex items-center gap-1 ${
                isRose ? 'text-rose-600' : 'text-amber-600'
              }`}
            >
              <CalendarClock className="size-3" />
              {dateFmt(p.promise_date)}
            </span>
            {p.amount != null && (
              <span className="text-xs font-semibold text-slate-700">
                ฿{fmt(Number(p.amount))}
              </span>
            )}
            {p.note && (
              <span className="text-xs text-slate-400 truncate max-w-[200px]">{p.note}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {p.bill_id && (
            <Link
              href={`/bills/${p.bill_id}`}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              ดูบิล →
            </Link>
          )}
          <CancelPromiseButton promiseId={p.id} billId={p.bill_id ?? undefined} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <Link
          href="/bills"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors"
        >
          <ChevronLeft className="size-3.5" /> บิลทั้งหมด
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <CalendarClock className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">
              ติดตามการชำระ
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">
              นัดจ่าย
            </h1>
          </div>
        </div>
      </div>

      {/* Summary */}
      {promises.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
            <p className="text-xs text-rose-500 font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="size-3.5" /> เลยกำหนดแล้ว
            </p>
            <p className="text-2xl font-bold text-rose-700">{overdue.length}</p>
            <p className="text-xs text-rose-400">รายการ</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-xs text-amber-600 font-semibold mb-1 flex items-center gap-1">
              <Clock className="size-3.5" /> กำลังจะถึง
            </p>
            <p className="text-2xl font-bold text-amber-700">{upcoming.length}</p>
            <p className="text-xs text-amber-400">รายการ</p>
          </div>
        </div>
      )}

      {promises.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <CalendarClock className="size-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400 font-medium">ไม่มีนัดจ่ายที่ active อยู่</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Overdue section */}
          {overdue.length > 0 && (
            <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-rose-50 border-b border-rose-100">
                <AlertTriangle className="size-4 text-rose-500 shrink-0" />
                <p className="font-bold text-rose-700 text-sm">เลยกำหนดแล้ว</p>
                <span className="ml-auto text-xs font-bold text-rose-500 bg-rose-100 px-2 py-0.5 rounded-full">
                  {overdue.length} รายการ
                </span>
              </div>
              <div className="divide-y divide-rose-50">
                {overdue.map((p) => (
                  <PromiseCard key={p.id} p={p} tone="rose" />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming section */}
          {upcoming.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Clock className="size-4 text-amber-500 shrink-0" />
                <p className="font-bold text-slate-700 text-sm">กำลังจะถึง</p>
                <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {upcoming.length} รายการ
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {upcoming.map((p) => (
                  <PromiseCard key={p.id} p={p} tone="normal" />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
