import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, Wallet, Receipt, ExternalLink, CreditCard, Smartphone, Banknote, HelpCircle } from 'lucide-react'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const monthFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
    transfer:    { label: 'โอนเงิน',   icon: Smartphone, cls: 'bg-blue-50 text-blue-700' },
    cash:        { label: 'เงินสด',    icon: Banknote,   cls: 'bg-emerald-50 text-emerald-700' },
    card:        { label: 'บัตร',      icon: CreditCard, cls: 'bg-violet-50 text-violet-700' },
  }
  const m = map[method] ?? { label: method, icon: HelpCircle, cls: 'bg-slate-100 text-slate-500' }
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.cls}`}>
      <Icon className="size-3" />
      {m.label}
    </span>
  )
}

export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tenant?: string }>
}) {
  const { month, tenant: tenantFilter } = await searchParams
  const supabase = await createClient()

  const query = supabase
    .from('payments')
    .select(`
      id, amount, payment_method, slip_url, slip_ref, note, paid_at,
      bills (
        id, billing_month, total_amount,
        tenants ( id, full_name ),
        rooms   ( room_number )
      )
    `)
    .order('paid_at', { ascending: false })
    .limit(500)

  const { data: rawPayments } = await query

  type BillJoin = {
    id: string
    billing_month: string
    total_amount: number
    tenants: { id: string; full_name: string } | null
    rooms:   { room_number: string } | null
  }

  const payments = (rawPayments ?? []).map((p) => ({
    ...p,
    bill: p.bills as unknown as BillJoin | null,
  }))

  // Apply filters client-side (small dataset)
  const filtered = payments.filter((p) => {
    if (month && p.bill?.billing_month?.slice(0, 7) !== month) return false
    if (tenantFilter && p.bill?.tenants?.id !== tenantFilter) return false
    return true
  })

  // Stats
  const totalAmount   = filtered.reduce((s, p) => s + Number(p.amount), 0)
  const thisMonth     = new Date().toISOString().slice(0, 7)
  const thisMonthAmt  = payments
    .filter((p) => p.bill?.billing_month?.slice(0, 7) === thisMonth)
    .reduce((s, p) => s + Number(p.amount), 0)

  // Available months for filter
  const monthSet = new Set(payments.map((p) => p.bill?.billing_month?.slice(0, 7)).filter(Boolean))
  const months = [...monthSet].sort((a, b) => b!.localeCompare(a!)) as string[]

  // Group by month for display
  const groups: Record<string, typeof filtered> = {}
  for (const p of filtered) {
    const m = p.bill?.billing_month?.slice(0, 7) ?? 'unknown'
    if (!groups[m]) groups[m] = []
    groups[m].push(p)
  }
  const groupEntries = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <Link href="/bills"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> บิลทั้งหมด
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Wallet className="size-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">รายงาน</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ประวัติการชำระเงิน</h1>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
          <p className="text-xs text-slate-400 mb-1">รายการทั้งหมด</p>
          <p className="text-2xl font-bold text-slate-950">{filtered.length}</p>
          <p className="text-xs text-slate-400">ครั้ง</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
          <p className="text-xs text-slate-400 mb-1">ยอดรวม</p>
          <p className="text-lg font-bold text-emerald-600 break-all leading-tight">฿{fmt(totalAmount)}</p>
          <p className="text-xs text-slate-400">{month ? monthFmt(month + '-01') : 'ทุกเดือน'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
          <p className="text-xs text-slate-400 mb-1">เดือนนี้</p>
          <p className="text-lg font-bold text-slate-950 break-all leading-tight">฿{fmt(thisMonthAmt)}</p>
          <p className="text-xs text-slate-400">{monthFmt(thisMonth + '-01')}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/bills/payments"
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            !month ? 'bg-slate-950 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          ทั้งหมด
        </Link>
        {months.map((m) => (
          <Link
            key={m}
            href={`/bills/payments?month=${m}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              month === m ? 'bg-slate-950 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {monthFmt(m + '-01')}
          </Link>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center text-slate-400">
          <Receipt className="size-8 mx-auto mb-3 text-slate-300" />
          <p>ยังไม่มีประวัติการชำระเงิน</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupEntries.map(([m, items]) => (
            <div key={m} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

              {/* Month header */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-700">{monthFmt(m + '-01')}</p>
                <p className="text-sm font-bold text-emerald-600">
                  ฿{fmt(items.reduce((s, p) => s + Number(p.amount), 0))}
                  <span className="text-xs font-normal text-slate-400 ml-1">({items.length} รายการ)</span>
                </p>
              </div>

              {/* Payment rows */}
              <div className="divide-y divide-slate-50">
                {items.map((p) => {
                  const tenant = p.bill?.tenants
                  const room   = p.bill?.rooms
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                      {/* Avatar */}
                      <div className="size-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-xs font-bold text-emerald-700">
                        {(tenant?.full_name ?? '?').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/tenants/${tenant?.id}`}
                            className="font-semibold text-slate-800 hover:text-slate-950 text-sm"
                          >
                            {tenant?.full_name ?? '—'}
                          </Link>
                          <span className="text-xs text-slate-400">ห้อง {room?.room_number ?? '—'}</span>
                          <MethodBadge method={p.payment_method ?? 'transfer'} />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{dateFmt(p.paid_at as string)}</p>
                        {p.slip_ref && (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">Ref: {p.slip_ref}</p>
                        )}
                      </div>

                      {/* Amount + slip */}
                      <div className="text-right shrink-0">
                        <p className="font-bold text-emerald-600 text-sm">฿{fmt(Number(p.amount))}</p>
                        {p.slip_url && (
                          <a
                            href={p.slip_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 mt-0.5"
                          >
                            ดูสลิป <ExternalLink className="size-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
