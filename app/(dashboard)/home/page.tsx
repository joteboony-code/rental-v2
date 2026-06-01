import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FileText, Home, Wallet, AlertTriangle, Clock, ArrowRight, TrendingUp } from 'lucide-react'

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now       = new Date()
  const todayThai = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('current_billing_month')
    .eq('id', 1)
    .single()

  const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const thisMonth = settingsRow?.current_billing_month
    ? (settingsRow.current_billing_month as string).slice(0, 10)
    : fallbackMonth

  const [{ data: rooms }, { data: unpaidBills }, { data: thisMonthBills }, { data: recentPayments }] = await Promise.all([
    supabase.from('rooms').select('id, status'),
    supabase.from('bills').select('status, total_amount').in('status', ['pending', 'overdue']),
    supabase.from('bills').select('status, total_amount').eq('billing_month', thisMonth),
    supabase
      .from('payments')
      .select('id, amount, payment_method, paid_at, bills(billing_month, rooms(room_number), tenants(full_name))')
      .order('paid_at', { ascending: false })
      .limit(5),
  ])

  const occupied    = (rooms ?? []).filter((r) => r.status === 'occupied').length
  const available   = (rooms ?? []).filter((r) => r.status === 'available').length
  const totalRooms  = (rooms ?? []).length

  const revenue     = (thisMonthBills ?? []).filter((b) => b.status === 'paid').reduce((s, b) => s + Number(b.total_amount), 0)
  const expected    = (thisMonthBills ?? []).reduce((s, b) => s + Number(b.total_amount), 0)
  const pending     = (unpaidBills ?? []).filter((b) => b.status === 'pending').length
  const overdue     = (unpaidBills ?? []).filter((b) => b.status === 'overdue').length
  const revenuePct  = expected > 0 ? Math.round((revenue / expected) * 100) : 0

  const monthLabel = new Date(thisMonth).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  type BillJoin = { billing_month: string; rooms: { room_number: string } | null; tenants: { full_name: string } | null } | null

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ภาพรวม</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">หน้าหลัก</h1>
        <p className="text-sm text-slate-400 mt-1">{todayThai}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Home} label="มีผู้เช่า" value={occupied} sub={`จาก ${totalRooms} ห้อง`} color="indigo" />
        <StatCard icon={Home} label="ห้องว่าง" value={available} sub="ห้อง" color="emerald" />
        <StatCard icon={AlertTriangle} label="รอชำระ" value={pending + overdue} sub={overdue > 0 ? `เกินกำหนด ${overdue}` : 'บิล'} color={overdue > 0 ? 'rose' : 'amber'} />
        <StatCard icon={Wallet} label="เก็บได้เดือนนี้" value={`฿${fmt(revenue)}`} sub={`${revenuePct}%`} color="slate" />
      </div>

      {/* Revenue bar */}
      {expected > 0 && (
        <div className="bg-slate-950 rounded-2xl px-5 py-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{monthLabel}</p>
              <p className="text-2xl font-bold mt-0.5">฿{fmt(revenue)}</p>
              <p className="text-xs text-slate-400 mt-0.5">จากเป้า ฿{fmt(expected)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-emerald-400">{revenuePct}%</p>
              <p className="text-xs text-slate-400">เก็บได้แล้ว</p>
            </div>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${revenuePct}%` }} />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/bills/meter',    label: 'จดมิเตอร์',       icon: FileText,   color: 'bg-teal-50 text-teal-700' },
          { href: '/bills',          label: 'ดูบิลเดือนนี้',  icon: FileText,   color: 'bg-emerald-50 text-emerald-700' },
          { href: '/bills/payments', label: 'ประวัติชำระ',    icon: Wallet,     color: 'bg-blue-50 text-blue-700' },
          { href: '/tenants',        label: 'จัดการผู้เช่า',  icon: Home,       color: 'bg-violet-50 text-violet-700' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-2.5 rounded-2xl ${color} px-4 py-3.5 text-sm font-semibold hover:opacity-80 transition-opacity`}>
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* Recent payments */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">การชำระล่าสุด</h2>
          </div>
          <Link href="/bills/payments" className="text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="size-3" />
          </Link>
        </div>

        {!recentPayments || recentPayments.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Clock className="size-6 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">ยังไม่มีการชำระเงิน</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentPayments.map((p) => {
              const bill   = p.bills as unknown as BillJoin
              const room   = bill?.rooms
              const tenant = bill?.tenants
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="size-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-xs font-bold text-emerald-700">
                    {(tenant?.full_name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {tenant?.full_name ?? '—'}
                      <span className="ml-2 text-xs font-normal text-slate-400">ห้อง {room?.room_number ?? '—'}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(p.paid_at as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="font-bold text-emerald-600 text-sm shrink-0">฿{fmt(Number(p.amount))}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub: string
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const colors = {
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    rose:    'bg-rose-50 text-rose-600',
    slate:   'bg-slate-100 text-slate-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className={`size-8 rounded-xl ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon className="size-4" />
      </div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-950">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
