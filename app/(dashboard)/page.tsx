import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Home, Users, FileText, Wrench, AlertTriangle, TrendingUp, DoorOpen, Clock } from 'lucide-react'
import { CountUp } from '@/components/ui/count-up'

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthLabel = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })

  const [{ data: rooms }, { data: unpaidBills }, { data: paidBills }, { data: repairs }] = await Promise.all([
    supabase.from('rooms').select('status'),
    supabase.from('bills').select('status, total_amount').in('status', ['pending', 'overdue']),
    supabase.from('bills').select('total_amount').eq('status', 'paid').eq('billing_month', currentMonth),
    supabase.from('repairs').select('status'),
  ])

  const stats = {
    availableRooms: rooms?.filter((r) => r.status === 'available').length ?? 0,
    occupiedRooms:  rooms?.filter((r) => r.status === 'occupied').length  ?? 0,
    totalRooms:     rooms?.length ?? 0,
    overdueCount:   unpaidBills?.filter((b) => b.status === 'overdue').length  ?? 0,
    overdueAmount:  unpaidBills?.filter((b) => b.status === 'overdue').reduce((s, b) => s + Number(b.total_amount), 0) ?? 0,
    pendingCount:   unpaidBills?.filter((b) => b.status === 'pending').length  ?? 0,
    revenue:        paidBills?.reduce((s, b) => s + Number(b.total_amount), 0) ?? 0,
    repairsPending: repairs?.filter((r) => r.status === 'pending').length ?? 0,
    repairsInProgress: repairs?.filter((r) => r.status === 'in_progress').length ?? 0,
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl animate-fade-in">

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ภาพรวม</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">แดชบอร์ด</h1>
        <p className="text-sm text-slate-400 mt-1">ประจำเดือน {monthLabel}</p>
      </div>

      {/* ── Overdue Alert ── */}
      {stats.overdueCount > 0 && (
        <Link href="/bills?status=overdue"
          className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 hover:bg-rose-100 transition-colors group">
          <div className="size-9 rounded-xl bg-rose-100 group-hover:bg-rose-200 flex items-center justify-center shrink-0 transition-colors">
            <AlertTriangle className="size-4 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-rose-700 text-sm">มีบิลเกินกำหนด {stats.overdueCount} รายการ</p>
            <p className="text-rose-500 text-xs mt-0.5">
              ยอดค้างชำระรวม ฿{stats.overdueAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })} — กดเพื่อดูรายการ
            </p>
          </div>
          <span className="text-rose-400 text-xs font-semibold shrink-0">ดูทั้งหมด →</span>
        </Link>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/rooms?status=available"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest">ห้องว่าง</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.availableRooms} />
            <span className="text-sm font-normal text-slate-400 ml-1">ห้อง</span>
          </p>
          <div className="h-0.5 rounded-full bg-emerald-500 opacity-40" />
        </Link>

        <Link href="/bills?status=overdue"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest">เกินกำหนด</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.overdueCount} />
            <span className="text-sm font-normal text-slate-400 ml-1">บิล</span>
          </p>
          <div className="h-0.5 rounded-full bg-rose-500 opacity-40" />
        </Link>

        <Link href="/bills?status=pending"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest">รอชำระ</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.pendingCount} />
            <span className="text-sm font-normal text-slate-400 ml-1">บิล</span>
          </p>
          <div className="h-0.5 rounded-full bg-amber-400 opacity-40" />
        </Link>

        <Link href="/repairs"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-widest">รอซ่อม</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.repairsPending} />
            <span className="text-sm font-normal text-slate-400 ml-1">รายการ</span>
          </p>
          <div className="h-0.5 rounded-full bg-orange-400 opacity-40" />
        </Link>
      </div>

      {/* ── Revenue Card ── */}
      <div className="bg-slate-950 rounded-2xl p-5 md:p-6 text-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="size-4 text-emerald-400" />
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">รายได้เดือนนี้</p>
            </div>
            <p className="text-3xl md:text-4xl font-bold tracking-tight">
              ฿<CountUp value={stats.revenue} formatter={(n) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs mb-1">อัตราการเข้าพัก</p>
            <p className="text-2xl font-bold text-slate-200">
              <CountUp value={stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0} />
              <span className="text-sm font-normal text-slate-400">%</span>
            </p>
            <p className="text-slate-500 text-xs mt-0.5">{stats.occupiedRooms}/{stats.totalRooms} ห้อง</p>
          </div>
        </div>
        <Link href="/bills"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
          ดูบิลทั้งหมดของเดือนนี้ →
        </Link>
      </div>

      {/* ── Quick nav ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/rooms',   icon: Home,      label: 'ห้องเช่า',     color: 'text-sky-500',    bg: 'bg-sky-50'    },
          { href: '/tenants', icon: Users,     label: 'ผู้เช่า',      color: 'text-violet-500', bg: 'bg-violet-50' },
          { href: '/bills',   icon: FileText,  label: 'บิล/ชำระเงิน', color: 'text-emerald-500',bg: 'bg-emerald-50'},
          { href: '/repairs', icon: Wrench,    label: 'แจ้งซ่อม',    color: 'text-amber-500',  bg: 'bg-amber-50'  },
        ].map(({ href, icon: Icon, label, color, bg }) => (
          <Link key={href} href={href}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow text-center">
            <div className={`size-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`size-5 ${color}`} />
            </div>
            <span className="text-sm font-semibold text-slate-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* ── In-progress repairs hint ── */}
      {stats.repairsInProgress > 0 && (
        <Link href="/repairs?status=in_progress"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 hover:bg-amber-100 transition-colors">
          <Clock className="size-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            กำลังซ่อม {stats.repairsInProgress} รายการ — กดเพื่อติดตาม
          </p>
        </Link>
      )}

      {/* ── Available rooms hint ── */}
      {stats.availableRooms > 0 && (
        <Link href="/rooms"
          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 hover:bg-emerald-100 transition-colors">
          <DoorOpen className="size-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">
            มีห้องว่าง {stats.availableRooms} ห้อง พร้อมรับผู้เช่าใหม่
          </p>
        </Link>
      )}

    </div>
  )
}
