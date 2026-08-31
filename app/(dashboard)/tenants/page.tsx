import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { CountUp } from '@/components/ui/count-up'
import { UserPlus, Users, UserCheck, UserMinus, ClipboardList, UserSearch } from 'lucide-react'
import { SyncLineButton } from './_components/sync-line-button'
import { TenantsBrowser, type TenantRow } from './_components/tenants-browser'
import { portalReadStatus, type PortalReadDelivery } from '@/lib/portal-read-status'

type ContractRow = {
  status: string
  rooms: { id: string; room_number: string; floor: number | null } | null
}

type RawTenant = {
  id: string
  full_name: string
  phone: string | null
  line_picture_url: string | null
  last_portal_open_at: string | null
  contracts: ContractRow[] | null
}

export default async function TenantsPage() {
  const supabase = await createClient()

  // Billing month, not completion time: resending an older month must not
  // replace the current round. An unfinished batch leaves the old round intact.
  const [{ data: round, error: roundError }, { data: rawTenants }] = await Promise.all([
    supabase.from('portal_bill_rounds')
      .select('billing_month').not('completed_at', 'is', null)
      .order('billing_month', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('tenants').select(`
      *,
      contracts!left (
        id, status, monthly_rent, start_date,
        rooms ( id, room_number, floor )
      )
    `),
  ])
  const { data: deliveries, error: deliveryError } = round
    ? await supabase.from('portal_bill_deliveries')
      .select('tenant_id, room_id, sent_at, first_sent_started_at, last_open_at')
      .eq('billing_month', round.billing_month)
    : { data: [], error: null }

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
    const portal = portalReadStatus(t.last_portal_open_at, round?.billing_month ?? null,
      ((deliveries ?? []) as PortalReadDelivery[]).filter((d) =>
        d.tenant_id === t.id && d.room_id === active?.rooms?.id),
      !roundError && !deliveryError)
    return {
      id:                t.id,
      full_name:         t.full_name,
      phone:             t.phone ?? null,
      linePictureUrl:    t.line_picture_url ?? null,
      roomId:            active?.rooms?.id ?? null,
      roomNumber:        active?.rooms?.room_number ?? null,
      hasActiveContract: !!active,
      portalOpened:      portal.opened,
      portalLabel:       portal.label,
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
      {round && <p className="text-xs text-slate-500">สถานะเปิด Portal สำหรับรอบบิล {new Date(round.billing_month + 'T00:00:00+07:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })} · เริ่มรอบเมื่อส่งจากปุ่มแจ้งทุกห้องผ่าน LINE ในหน้าบิล / ชำระเงินครบแล้ว</p>}
      <TenantsBrowser tenants={tenantRows} />
    </div>
  )
}
