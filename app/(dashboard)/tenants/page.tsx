import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { CountUp } from '@/components/ui/count-up'
import { UserPlus, Users, UserCheck, UserMinus, ClipboardList, UserSearch } from 'lucide-react'
import { SyncLineButton } from './_components/sync-line-button'
import { TenantsBrowser, type TenantRow } from './_components/tenants-browser'

type ContractRow = {
  status: string
  rooms: { id: string; room_number: string; floor: number | null } | null
}

type RawTenant = {
  id: string
  full_name: string
  phone: string | null
  last_portal_open_at: string | null
  contracts: ContractRow[] | null
}

export default async function TenantsPage() {
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

  const getActive = (t: RawTenant) =>
    (t.contracts ?? []).find((c) => c.status === 'active') ?? null

  const sortRoomNum = (r: string) => {
    const n = parseInt(r, 10)
    return isNaN(n) ? r.padStart(10, '0') : String(n).padStart(10, '0')
  }

  const allTenants = (rawTenants as unknown as RawTenant[] | null)?.slice().sort((a, b) => {
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
  }) ?? []

  const stats = {
    total:    allTenants.length,
    active:   allTenants.filter((t) => getActive(t)).length,
    inactive: allTenants.filter((t) => !getActive(t)).length,
  }

  const tenantRows: TenantRow[] = allTenants.map((t) => {
    const active = getActive(t)
    return {
      id:                t.id,
      full_name:         t.full_name,
      phone:             t.phone ?? null,
      roomId:            active?.rooms?.id ?? null,
      roomNumber:        active?.rooms?.room_number ?? null,
      hasActiveContract: !!active,
      portalOpened:      !!t.last_portal_open_at,
    }
  })

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ผู้เช่า</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link href="/tenant-registrations"
            className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' gap-1.5 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50'}>
            <ClipboardList className="size-3.5" /> ลงทะเบียน
          </Link>
          <Link href="/leads"
            className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' gap-1.5 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50'}>
            <UserSearch className="size-3.5" /> คนสนใจห้อง
          </Link>
          <SyncLineButton />
          <Link href="/tenants/new"
            className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
            <UserPlus className="size-4" /> เพิ่มผู้เช่า
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Users}     tone="slate"   label="ทั้งหมด"     value={<CountUp value={stats.total} />}    hint="คน" />
        <StatCard icon={UserCheck} tone="emerald" label="กำลังเช่า"   value={<CountUp value={stats.active} />}   hint="คน" />
        <StatCard icon={UserMinus} tone="slate"   label="ไม่มีสัญญา" value={<CountUp value={stats.inactive} />} hint="คน" />
      </div>

      {/* ── Searchable tenant list ── */}
      <TenantsBrowser tenants={tenantRows} />
    </div>
  )
}
