import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ArrowRight, UserPlus, Users, Home, Phone } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { SyncLineButton } from './_components/sync-line-button'
import { CountUp } from '@/components/ui/count-up'

type ContractRow = {
  status: string
  rooms: { id: string; room_number: string; floor: number | null } | null
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function TenantsPage({ searchParams }: Props) {
  const { status } = await searchParams
  const supabase = await createClient()

  const { data: rawTenants } = await supabase
    .from('tenants')
    .select(`
      *,
      contracts!left (
        id, status, monthly_rent, start_date,
        rooms ( id, room_number, floor )
      )
    `)

  const getActive = (t: NonNullable<typeof rawTenants>[number]) =>
    (t.contracts as ContractRow[] | null)?.find((c) => c.status === 'active') ?? null

  const sortRoomNum = (r: string) => {
    const n = parseInt(r, 10)
    return isNaN(n) ? r.padStart(10, '0') : String(n).padStart(10, '0')
  }

  const allTenants = rawTenants?.slice().sort((a, b) => {
    const ca = getActive(a)
    const cb = getActive(b)
    if (ca && cb) {
      const ra = ca.rooms?.room_number ?? ''
      const rb = cb.rooms?.room_number ?? ''
      return sortRoomNum(ra).localeCompare(sortRoomNum(rb))
    }
    if (ca) return -1
    if (cb) return 1
    return a.full_name.localeCompare(b.full_name, 'th')
  })

  const stats = {
    total:    allTenants?.length ?? 0,
    active:   allTenants?.filter((t) => (t.contracts as ContractRow[] | null)?.some((c) => c.status === 'active')).length ?? 0,
    inactive: allTenants?.filter((t) => !(t.contracts as ContractRow[] | null)?.some((c) => c.status === 'active')).length ?? 0,
  }

  const tenants = status === 'active'
    ? allTenants?.filter((t) => (t.contracts as ContractRow[] | null)?.some((c) => c.status === 'active'))
    : status === 'inactive'
    ? allTenants?.filter((t) => !(t.contracts as ContractRow[] | null)?.some((c) => c.status === 'active'))
    : allTenants

  const filterTabs = [
    { value: '',         label: 'ทั้งหมด',     count: stats.total    },
    { value: 'active',   label: 'กำลังเช่า',   count: stats.active   },
    { value: 'inactive', label: 'ไม่มีสัญญา', count: stats.inactive },
  ]

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ผู้เช่า</h1>
        </div>
        <div className="flex items-center gap-2">
          <SyncLineButton />
          <Link href="/tenants/new"
            className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
            <UserPlus className="size-4" /> เพิ่มผู้เช่า
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-white to-slate-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ทั้งหมด</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.total} /><span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-slate-700 opacity-40" />
        </div>
        <div className="bg-gradient-to-br from-white to-violet-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest">กำลังเช่า</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.active} /><span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-violet-500 opacity-40" />
        </div>
        <div className="bg-gradient-to-br from-white to-slate-50/60 rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ไม่มีสัญญา</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            <CountUp value={stats.inactive} /><span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-slate-400 opacity-40" />
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTabs.map(({ value, label, count }) => (
          <Link key={value}
            href={`/tenants${value ? `?status=${value}` : ''}`}
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
        {!tenants || tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="size-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
              <Users className="size-7 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 mb-1">ไม่พบผู้เช่า</p>
            <p className="text-sm text-slate-400 mb-5">ลองเปลี่ยนตัวกรอง หรือเพิ่มผู้เช่าใหม่</p>
            <Link href="/tenants/new"
              className={buttonVariants({ variant: 'default', size: 'sm' }) + ' rounded-xl bg-slate-950 hover:bg-slate-800'}>
              <UserPlus className="size-4 mr-1.5" /> เพิ่มผู้เช่าคนแรก
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ผู้เช่า</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ห้อง</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">เบอร์โทร</th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">สถานะ</th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">Portal</th>
                  <th className="px-5 py-4 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant, i) => {
                  const activeContract = getActive(tenant)
                  const prevActive = i > 0 ? getActive(tenants[i - 1]) : true
                  const showDivider = !activeContract && !!prevActive && i > 0
                  return (
                    <Fragment key={tenant.id}>
                      {showDivider && (
                        <tr>
                          <td colSpan={6} className="px-6 py-2 bg-slate-50 border-y border-slate-100">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ไม่มีสัญญาเช่า</span>
                          </td>
                        </tr>
                      )}
                    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 transition-colors shrink-0">
                            {tenant.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-700">{tenant.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {activeContract?.rooms ? (
                          <Link href={`/rooms/${activeContract.rooms.id}`}
                            className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                            <Home className="size-3.5 text-slate-400" />
                            ห้อง {activeContract.rooms.room_number}
                            {` แถวที่ ${roomRow(activeContract.rooms.room_number)}`}
                          </Link>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {tenant.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3.5 text-slate-400" />
                            {tenant.phone}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {activeContract ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                            <span className="size-1.5 rounded-full bg-violet-500" />
                            เช่าอยู่
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
                            ไม่มีสัญญา
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {tenant.last_portal_open_at ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            title={`เปิดล่าสุด: ${fmtPortalOpen(tenant.last_portal_open_at as string)}`}>
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            เปิดแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
                            ยังไม่เปิด
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/tenants/${tenant.id}`}
                          className="inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950">
                          ดูข้อมูล
                          <ArrowRight className="size-3.5" strokeWidth={1.8} />
                        </Link>
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {tenants.map((tenant, i) => {
                const activeContract = getActive(tenant)
                const prevActive = i > 0 ? getActive(tenants[i - 1]) : true
                const showDivider = !activeContract && !!prevActive && i > 0
                return (
                  <div key={tenant.id}>
                    {showDivider && (
                      <div className="px-4 py-2 bg-slate-50 border-y border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ไม่มีสัญญาเช่า</span>
                      </div>
                    )}
                  <Link href={`/tenants/${tenant.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                    <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                      {tenant.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{tenant.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activeContract?.rooms && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Home className="size-3" /> ห้อง {activeContract.rooms.room_number}
                          </span>
                        )}
                        {tenant.phone && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Phone className="size-3" /> {tenant.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {activeContract ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                          <span className="size-1.5 rounded-full bg-violet-500" />
                          เช่าอยู่
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
                          ไม่มีสัญญา
                        </span>
                      )}
                      {tenant.last_portal_open_at ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                          <span className="size-1.5 rounded-full bg-emerald-500" /> เปิด Portal แล้ว
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-300">ยังไม่เปิด Portal</span>
                      )}
                    </div>
                  </Link>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function fmtPortalOpen(s: string) {
  return new Date(s).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

