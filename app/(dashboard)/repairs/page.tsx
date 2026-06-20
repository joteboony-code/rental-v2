import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { RepairStatusBadge, RepairPriorityBadge } from './_components/repair-status-badge'
import { Wrench, Plus } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { CountUp } from '@/components/ui/count-up'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function RepairsPage({ searchParams }: Props) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('repair_requests')
    .select(`*, rooms ( room_number, floor ), tenants ( full_name )`)
    .order('created_at', { ascending: false })

  if (status && ['pending', 'in_progress', 'done', 'cancelled'].includes(status)) {
    query = query.eq('status', status)
  }

  const [{ data: repairs }, { data: allRepairs }] = await Promise.all([
    query,
    supabase.from('repair_requests').select('status, priority'),
  ])

  const stats = {
    pending:     allRepairs?.filter((r) => r.status === 'pending').length     ?? 0,
    in_progress: allRepairs?.filter((r) => r.status === 'in_progress').length ?? 0,
    done:        allRepairs?.filter((r) => r.status === 'done').length        ?? 0,
    urgent:      allRepairs?.filter((r) => r.priority === 'urgent' && r.status !== 'done').length ?? 0,
    total:       allRepairs?.length ?? 0,
  }

  const filterTabs = [
    { value: '',            label: 'ทั้งหมด',      count: stats.total       },
    { value: 'pending',     label: 'รอดำเนินการ',  count: stats.pending     },
    { value: 'in_progress', label: 'กำลังซ่อม',    count: stats.in_progress },
    { value: 'done',        label: 'เสร็จแล้ว',    count: stats.done        },
  ]

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">แจ้งซ่อม</h1>
        </div>
        <Link href="/repairs/new"
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
          <Plus className="size-4" /> แจ้งซ่อมใหม่
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard tone="amber"   label="รอดำเนินการ" value={<CountUp value={stats.pending} />}     hint="รายการ" />
        <StatCard tone="blue"    label="กำลังซ่อม"   value={<CountUp value={stats.in_progress} />} hint="รายการ" />
        <StatCard tone="emerald" label="เสร็จแล้ว"   value={<CountUp value={stats.done} />}        hint="รายการ" />
        <StatCard tone={stats.urgent > 0 ? 'rose' : 'slate'} label="ด่วนมาก" value={<CountUp value={stats.urgent} />} hint="รายการ" />
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTabs.map(({ value, label, count }) => (
          <Link key={value}
            href={`/repairs${value ? `?status=${value}` : ''}`}
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

      {/* ── List ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!repairs || repairs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Wrench}
              title="ไม่มีรายการแจ้งซ่อม"
              action={
                <Link href="/repairs/new"
                  className={buttonVariants({ variant: 'default', size: 'sm' }) + ' mt-1 rounded-xl bg-slate-950 hover:bg-slate-800'}>
                  แจ้งซ่อมใหม่
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ห้อง</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">หัวข้อ</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ความเร่งด่วน</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">สถานะ</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">วันที่</th>
                  <th className="px-5 py-4 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((repair) => {
                  type RoomJoin   = { room_number: string; floor: number | null }
                  type TenantJoin = { full_name: string }
                  const room   = repair.rooms   as unknown as RoomJoin   | null
                  const tenant = repair.tenants as unknown as TenantJoin | null
                  return (
                    <tr key={repair.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 transition-colors">
                            {room?.room_number ?? '—'}
                          </div>
                          {room && <span className="text-xs text-slate-400">แถวที่ {roomRow(room.room_number)}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-700 line-clamp-1">{repair.title}</p>
                        {tenant && <p className="text-xs text-slate-400 mt-0.5">{tenant.full_name}</p>}
                      </td>
                      <td className="px-4 py-4"><RepairPriorityBadge priority={repair.priority} /></td>
                      <td className="px-4 py-4"><RepairStatusBadge status={repair.status} /></td>
                      <td className="px-4 py-4 text-slate-400 text-xs">
                        {new Date(repair.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/repairs/${repair.id}`}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                          จัดการ →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {repairs.map((repair) => {
                type RoomJoin   = { room_number: string; floor: number | null }
                type TenantJoin = { full_name: string }
                const room   = repair.rooms   as unknown as RoomJoin   | null
                const tenant = repair.tenants as unknown as TenantJoin | null
                return (
                  <Link key={repair.id} href={`/repairs/${repair.id}`}
                    className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors">
                    <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0 mt-0.5">
                      {room?.room_number ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 text-sm line-clamp-1">{repair.title}</p>
                      {tenant && <p className="text-xs text-slate-400 mt-0.5">{tenant.full_name}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <RepairStatusBadge status={repair.status} />
                        <RepairPriorityBadge priority={repair.priority} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">
                        {new Date(repair.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


