import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ArrowRight, UserPlus, Users, Home, Phone } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

export default async function TenantsPage() {
  const supabase = await createClient()

  const { data: rawTenants } = await supabase
    .from('tenants')
    .select(`
      *,
      contracts!left (
        id, status, monthly_rent, start_date,
        rooms ( room_number, floor )
      )
    `)

  // Sort by active contract room_number numerically; tenants without active contract go last
  const tenants = rawTenants?.slice().sort((a, b) => {
    const getRoom = (t: typeof a) =>
      (t.contracts as { status: string; rooms: { room_number: string } | null }[] | null)
        ?.find((c) => c.status === 'active')?.rooms?.room_number
    const ra = getRoom(a)
    const rb = getRoom(b)
    if (ra && rb) return (parseInt(ra) || 0) - (parseInt(rb) || 0)
    if (ra) return -1   // a has room, b doesn't → a first
    if (rb) return 1    // b has room, a doesn't → b first
    return a.full_name.localeCompare(b.full_name, 'th')
  })

  const stats = {
    total:  tenants?.length ?? 0,
    active: tenants?.filter((t) => (t.contracts as { status: string }[] | null)?.some((c) => c.status === 'active')).length ?? 0,
    inactive: tenants?.filter((t) => !(t.contracts as { status: string }[] | null)?.some((c) => c.status === 'active')).length ?? 0,
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ผู้เช่า</h1>
        </div>
        <Link href="/tenants/new"
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
          <UserPlus className="size-4" /> เพิ่มผู้เช่า
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ทั้งหมด</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            {stats.total}<span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-slate-700 opacity-40" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest">กำลังเช่า</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            {stats.active}<span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-violet-500 opacity-40" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ไม่มีสัญญา</p>
          <p className="text-4xl font-bold text-slate-950 tracking-tight leading-none">
            {stats.inactive}<span className="text-sm font-normal text-slate-400 ml-1">คน</span>
          </p>
          <div className="h-0.5 rounded-full bg-slate-400 opacity-40" />
        </div>
      </div>

      {/* ── List ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!tenants || tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="size-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
              <Users className="size-7 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 mb-1">ยังไม่มีผู้เช่า</p>
            <p className="text-sm text-slate-400 mb-5">เริ่มต้นด้วยการเพิ่มผู้เช่าคนแรก</p>
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
                  <th className="px-5 py-4 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => {
                  const activeContract = (tenant.contracts as { status: string; rooms: { room_number: string; floor: number | null } | null }[] | null)
                    ?.find((c) => c.status === 'active')
                  return (
                    <tr key={tenant.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
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
                          <span className="flex items-center gap-1.5">
                            <Home className="size-3.5 text-slate-400" />
                            ห้อง {activeContract.rooms.room_number}
                            {` แถวที่ ${roomRow(activeContract.rooms.room_number)}`}
                          </span>
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
                      <td className="px-5 py-4 text-right">
                        <Link href={`/admin/tenants/${tenant.id}`}
                          className="inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950">
                          ดูข้อมูล
                          <ArrowRight className="size-3.5" strokeWidth={1.8} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {tenants.map((tenant) => {
                const activeContract = (tenant.contracts as { status: string; rooms: { room_number: string; floor: number | null } | null }[] | null)
                  ?.find((c) => c.status === 'active')
                return (
                  <Link key={tenant.id} href={`/admin/tenants/${tenant.id}`}
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
                    <div className="shrink-0">
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

