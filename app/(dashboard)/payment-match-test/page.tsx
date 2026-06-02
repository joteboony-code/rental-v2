import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { simulatePaymentMatch, getTenantsForMatchTest } from '@/app/actions/payment-match'
import { ChevronLeft, CheckCircle, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
const thaiMonth = (s: string) => new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

const RULE_META: Record<string, { label: string; color: string; icon: 'ok' | 'warn' | 'no' }> = {
  unique_single_bill:    { label: 'unique_single_bill',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'ok'   },
  unique_single_overpay: { label: 'unique_single_overpay', color: 'bg-teal-50 text-teal-700 border-teal-200',           icon: 'ok'   },
  total_all_outstanding: { label: 'total_all_outstanding', color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'ok'   },
  total_all_overpay:     { label: 'total_all_overpay',     color: 'bg-teal-50 text-teal-700 border-teal-200',           icon: 'ok'   },
  single_room_total:     { label: 'single_room_total',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'ok'   },
  single_room_overpay:   { label: 'single_room_overpay',   color: 'bg-teal-50 text-teal-700 border-teal-200',           icon: 'ok'   },
  ambiguous:             { label: 'ambiguous',             color: 'bg-amber-50 text-amber-700 border-amber-200',        icon: 'warn' },
  overpaid:              { label: 'overpaid',              color: 'bg-orange-50 text-orange-700 border-orange-200',     icon: 'warn' },
  no_match:              { label: 'no_match',              color: 'bg-red-50 text-red-700 border-red-200',              icon: 'no'   },
  no_outstanding:        { label: 'no_outstanding',        color: 'bg-slate-100 text-slate-500 border-slate-200',       icon: 'no'   },
}

export default async function PaymentMatchTestPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string; amount?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tenant_id, amount: amountStr } = await searchParams
  const amount = amountStr ? Number(amountStr) : null

  const tenants = await getTenantsForMatchTest()
  const result  = tenant_id && amount && amount > 0
    ? await simulatePaymentMatch(tenant_id, amount)
    : null

  const selectedTenant = tenants.find((t) => t.id === tenant_id)
  const meta = result ? (RULE_META[result.matchRule] ?? { label: result.matchRule, color: 'bg-slate-100 text-slate-600 border-slate-200', icon: 'no' as const }) : null

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <Link href="/home" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> หน้าหลัก
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">เครื่องมือ</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ทดสอบ Payment Match</h1>
        <p className="text-sm text-slate-400 mt-1">จำลองการจับคู่ยอดโอน — ไม่มีการบันทึกข้อมูลจริง</p>
      </div>

      {/* Form */}
      <form method="GET" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ผู้เช่า</label>
            <select
              name="tenant_id"
              defaultValue={tenant_id ?? ''}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950"
            >
              <option value="">เลือกผู้เช่า…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  ห้อง {t.room_number} — {t.full_name}{t.has_line ? '' : ' (ไม่มี LINE)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ยอดโอน (บาท)</label>
            <input
              type="number"
              name="amount"
              step="0.01"
              min="1"
              defaultValue={amountStr ?? ''}
              placeholder="เช่น 3611"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950"
            />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 bg-slate-950 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          ทดสอบ <ArrowRight className="size-4" />
        </button>
      </form>

      {/* Result */}
      {result && meta && (
        <div className="space-y-4">

          {/* Rule banner */}
          <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${meta.color}`}>
            {meta.icon === 'ok'   && <CheckCircle  className="size-5 shrink-0 mt-0.5" />}
            {meta.icon === 'warn' && <AlertTriangle className="size-5 shrink-0 mt-0.5" />}
            {meta.icon === 'no'   && <XCircle       className="size-5 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold">{meta.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${result.canAutoPay ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  {result.canAutoPay ? '✓ auto-pay ได้' : '✗ ต้องตรวจด้วยตนเอง'}
                </span>
                {result.creditAmount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">
                    เครดิต ฿{fmt(result.creditAmount)}
                  </span>
                )}
              </div>
              <p className="text-sm mt-1 opacity-80">{result.reason}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            {/* Bills to pay */}
            {result.canAutoPay && result.billsToPay.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">จะตัดบิล</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {result.billsToPay.map((b) => (
                    <div key={b.billId} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">ห้อง {b.roomNumber}</p>
                        <p className="text-xs text-slate-400">{thaiMonth(b.billingMonth)}</p>
                      </div>
                      <p className="font-bold text-emerald-600 text-sm">฿{fmt(b.amountToPay)}</p>
                    </div>
                  ))}
                  {result.creditAmount > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-violet-50">
                      <p className="text-sm text-violet-700 font-semibold">🎁 เครดิตส่วนเกิน</p>
                      <p className="font-bold text-violet-600 text-sm">+฿{fmt(result.creditAmount)}</p>
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-500">ยอดโอน ฿{fmt(result.transferAmount)}</span>
                  <span className="text-xs font-bold text-slate-700">
                    ตัดบิล ฿{fmt(result.billsToPay.reduce((s, b) => s + b.amountToPay, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Ambiguous candidates */}
            {result.matchRule === 'ambiguous' && result.candidates && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">บิลที่อาจตรงกัน</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {result.candidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">ห้อง {c.room}</p>
                        <p className="text-xs text-slate-400">{thaiMonth(c.month)}</p>
                      </div>
                      <p className="font-bold text-amber-600 text-sm">฿{fmt(c.remaining)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All outstanding bills (context) */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">บิลค้างทั้งหมด</p>
              </div>
              {result.outstandingBills.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">ไม่มีบิลค้าง</p>
              ) : (
                <>
                  <div className="divide-y divide-slate-50">
                    {result.outstandingBills.map((b) => (
                      <div key={b.billId} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">ห้อง {b.roomNumber}</p>
                          <p className="text-xs text-slate-400">{thaiMonth(b.billingMonth)}</p>
                        </div>
                        <p className="font-bold text-rose-500 text-sm">฿{fmt(b.remaining)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs text-slate-500">ค้างรวม</span>
                    <span className="text-xs font-bold text-slate-700">฿{fmt(result.totalOutstanding)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Context: who's being tested */}
          {selectedTenant && (
            <p className="text-xs text-slate-400">
              ทดสอบกับผู้เช่า: <strong className="text-slate-600">{selectedTenant.full_name}</strong> · ห้อง {selectedTenant.room_number} · ยอดโอน ฿{amount ? fmt(amount) : '—'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
