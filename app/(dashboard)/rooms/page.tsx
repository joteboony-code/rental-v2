import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { CountUp } from '@/components/ui/count-up'
import { Plus, Building2, DoorOpen, DoorClosed, Wrench, TrendingUp } from 'lucide-react'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { buildPairUrl, buildRegisterUrl, normalizeOrigin } from '@/lib/pair-url'
import { RoomsBrowser, type RoomRow } from './_components/rooms-browser'


export default async function RoomsPage() {
  const supabase = await createClient()
  const [{ data: rawRooms }, line, headerList] = await Promise.all([
    supabase
      .from('rooms')
      .select(`*, registration_token, contracts!left ( status, monthly_rent, tenants ( id, full_name, phone, line_picture_url ) )`),
    getLineIntegrationPublic(),
    headers(),
  ])
  const host = headerList.get('host')
  const protocol = headerList.get('x-forwarded-proto') ?? 'https'
  const fallbackOrigin = host ? `${protocol}://${host}` : ''
  const appOrigin = normalizeOrigin(line?.app_url) || fallbackOrigin

  // numeric sort (room_number is text → "10" < "2" alphabetically)
  const rooms = rawRooms?.slice().sort((a, b) =>
    (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0)
  ) ?? []

  const stats = {
    total:       rooms.length,
    available:   rooms.filter((r) => r.status === 'available').length,
    occupied:    rooms.filter((r) => r.status === 'occupied').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
    reserved:    rooms.filter((r) => r.status === 'reserved').length,
  }
  const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0

  type ContractJoin = { status: string; tenants: { id: string; full_name: string; phone: string | null; line_picture_url: string | null } | null }

  const roomRows: RoomRow[] = rooms.map((room) => {
    const activeContract = (room.contracts as ContractJoin[] | null)?.find((c) => c.status === 'active')
    return {
      id:              room.id,
      room_number:     room.room_number,
      floor:           room.floor,
      status:          room.status,
      monthly_rent:    Number(room.monthly_rent),
      tenantId:        activeContract?.tenants?.id ?? null,
      tenantName:      activeContract?.tenants?.full_name ?? null,
      tenantPhone:     activeContract?.tenants?.phone ?? null,
      tenantPicture:   activeContract?.tenants?.line_picture_url ?? null,
      pairUrl:         buildPairUrl({ appOrigin, liffId: line?.line_liff_id_pairing, roomNumber: room.room_number }),
      registrationUrl: buildRegisterUrl({ appOrigin, registrationToken: room.registration_token, liffId: line?.line_liff_id_pairing }),
    }
  })

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">

      {/* ── Page Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ห้องเช่า</h1>
        </div>
        <Link href="/rooms/new"
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
          <Plus className="size-4" /> เพิ่มห้องใหม่
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building2}  tone="slate"   label="ห้องทั้งหมด" value={<CountUp value={stats.total} />}      hint={`มีผู้เช่า ${stats.occupied} • ว่าง ${stats.available}`} />
        <StatCard icon={DoorClosed} tone="emerald" label="มีผู้เช่า"    value={<CountUp value={stats.occupied} />}   hint="ห้อง" />
        <StatCard icon={DoorOpen}   tone="blue"    label="ห้องว่าง"     value={<CountUp value={stats.available} />}  hint="ห้อง" />
        <StatCard icon={Wrench}     tone="amber"   label="ซ่อม/จอง"     value={<CountUp value={stats.maintenance + stats.reserved} />} hint={`ซ่อม ${stats.maintenance} • จอง ${stats.reserved}`} />
      </div>

      {/* ── Occupancy strip ── */}
      {stats.total > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-500" />
              <span className="text-sm font-semibold text-slate-700">อัตราการเช่า</span>
            </div>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{occupancyRate}<span className="text-sm font-normal text-slate-400 ml-0.5">%</span></span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${occupancyRate}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400 font-medium">
            <span>{stats.occupied} ห้องมีผู้เช่า</span>
            <span>{stats.available} ห้องว่าง</span>
          </div>
        </div>
      )}

      {/* ── Searchable room list ── */}
      <RoomsBrowser rooms={roomRows} />
    </div>
  )
}
