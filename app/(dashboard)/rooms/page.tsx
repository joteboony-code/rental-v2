import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { RoomStatusBadge } from './_components/room-status-badge'
import { DeleteRoomButton } from './_components/delete-room-button'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil, Building2, TrendingUp, BarChart2 } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { buildPairUrl, buildRegisterUrl, normalizeOrigin } from '@/lib/pair-url'
import { RoomPairQrButton } from './_components/room-pair-qr-button'
import { CountUp } from '@/components/ui/count-up'

export default async function RoomsPage() {
  const supabase = await createClient()
  const [{ data: rawRooms }, line, headerList] = await Promise.all([
    supabase
      .from('rooms')
      .select(`*, registration_token, contracts!left ( status, monthly_rent, tenants ( id, full_name ) )`),
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
  )

  const stats = {
    total:       rooms?.length ?? 0,
    available:   rooms?.filter((r) => r.status === 'available').length   ?? 0,
    occupied:    rooms?.filter((r) => r.status === 'occupied').length    ?? 0,
    maintenance: rooms?.filter((r) => r.status === 'maintenance').length ?? 0,
    reserved:    rooms?.filter((r) => r.status === 'reserved').length    ?? 0,
  }
  const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">

      {/* ── Page Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">จัดการ</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ห้องเช่า</h1>
        </div>
        <Link href="/rooms/new"
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20'}>
          <Plus className="size-4" /> เพิ่มห้องใหม่
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <StatCard value={stats.reserved} label="จองแล้ว" sub="ห้อง" color="amber" />
        <StatCard value={stats.total}       label="ห้องทั้งหมด"  sub="ห้อง"  color="slate"   />
        <StatCard value={stats.occupied}    label="มีผู้เช่า"     sub="ห้อง"  color="indigo"  />
        <StatCard value={stats.available}   label="ห้องว่าง"     sub="ห้อง"  color="emerald" />
        <StatCard value={stats.maintenance} label="ซ่อมบำรุง"   sub="ห้อง"  color="amber"   />
      </div>

      {/* ── Occupancy strip ── */}
      {stats.total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">อัตราการเช่า</span>
            </div>
            <span className="text-2xl font-bold text-slate-950 tracking-tight">{occupancyRate}<span className="text-sm font-normal text-slate-400 ml-0.5">%</span></span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-950 rounded-full transition-all duration-700"
              style={{ width: `${occupancyRate}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400 font-medium">
            <span>{stats.occupied} ห้องมีผู้เช่า</span>
            <span>{stats.available} ห้องว่าง</span>
          </div>
        </div>
      )}

      {/* ── Table / Cards ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {rooms && rooms.length > 0 ? (
          <>
            {/* Desktop Table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ห้อง</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ผู้เช่า</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">ค่าเช่า</th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">สถานะ</th>
                  <th className="px-5 py-4 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const activeContract = (room.contracts as { status: string; tenants: { id: string; full_name: string } | null }[] | null)
                    ?.find((c) => c.status === 'active')
                  const roomPairUrl = buildPairUrl({ appOrigin, liffId: line?.line_liff_id_pairing, roomNumber: room.room_number })
                  const registrationUrl = buildRegisterUrl({ appOrigin, registrationToken: room.registration_token, liffId: line?.line_liff_id_pairing })
                  return (
                    <tr key={room.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <Link href={`/rooms/${room.id}`} className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-700 transition-colors">
                            {room.room_number}
                          </div>
                          <span className="text-xs text-slate-400">แถวที่ {roomRow(room.room_number)}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-700 font-medium">
                        {activeContract?.tenants ? (
                          <Link href={`/tenants/${activeContract.tenants.id}`}
                            className="hover:text-indigo-600 hover:underline transition-colors">
                            {activeContract.tenants.full_name}
                          </Link>
                        ) : (
                          <span className="text-slate-300 text-xs font-normal">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-800">
                        ฿{Number(room.monthly_rent).toLocaleString()}
                        <span className="text-xs font-normal text-slate-400">/เดือน</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <RoomStatusBadge status={room.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <RoomPairQrButton roomNumber={room.room_number} registrationUrl={registrationUrl} pairUrl={roomPairUrl} />
                          <Link href={`/rooms/${room.id}/usage`}
                            className="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="กราฟการใช้น้ำ-ไฟ">
                            <BarChart2 className="size-3.5" />
                          </Link>
                          <Link href={`/rooms/${room.id}/edit`}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <Pencil className="size-3.5" />
                          </Link>
                          <DeleteRoomButton id={room.id} roomNumber={room.room_number} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {rooms.map((room) => {
                const activeContract = (room.contracts as { status: string; tenants: { id: string; full_name: string } | null }[] | null)
                  ?.find((c) => c.status === 'active')
                const roomPairUrl = buildPairUrl({ appOrigin, liffId: line?.line_liff_id_pairing, roomNumber: room.room_number })
                const registrationUrl = buildRegisterUrl({ appOrigin, registrationToken: room.registration_token, liffId: line?.line_liff_id_pairing })
                return (
                  <div key={room.id} className="flex items-center gap-4 p-4">
                    <Link href={`/rooms/${room.id}`} className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                      {room.room_number}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/rooms/${room.id}`} className="font-semibold text-slate-800 text-sm hover:underline">ห้อง {room.room_number}</Link>
                        {room.floor && <span className="text-xs text-slate-400">ชั้น {room.floor}</span>}
                        <RoomStatusBadge status={room.status} />
                      </div>
                      {activeContract?.tenants ? (
                        <Link href={`/tenants/${activeContract.tenants.id}`}
                          className="text-xs text-slate-500 truncate hover:text-indigo-600 hover:underline transition-colors">
                          {activeContract.tenants.full_name}
                        </Link>
                      ) : (
                        <p className="text-xs text-slate-500 truncate">ว่าง</p>
                      )}
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">฿{Number(room.monthly_rent).toLocaleString()}/เดือน</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <RoomPairQrButton roomNumber={room.room_number} registrationUrl={registrationUrl} pairUrl={roomPairUrl} />
                      <Link href={`/rooms/${room.id}/edit`}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Pencil className="size-4" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="size-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
              <Building2 className="size-7 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 mb-1">ยังไม่มีห้องในระบบ</p>
            <p className="text-sm text-slate-400 mb-5">เริ่มต้นด้วยการเพิ่มห้องแรก</p>
            <Link href="/rooms/new"
              className={buttonVariants({ variant: 'default', size: 'sm' }) + ' rounded-xl bg-slate-950 hover:bg-slate-800'}>
              <Plus className="size-4 mr-1.5" /> เพิ่มห้องแรก
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ value, label, sub, color }: {
  value: number; label: string; sub: string
  color: 'slate' | 'indigo' | 'emerald' | 'amber'
}) {
  const accent = {
    slate:   { bar: 'bg-slate-700',   text: 'text-slate-500'   },
    indigo:  { bar: 'bg-indigo-500',  text: 'text-indigo-500'  },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-500' },
    amber:   { bar: 'bg-amber-400',   text: 'text-amber-500'   },
  }[color]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 md:p-5 space-y-2 md:space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl md:text-4xl font-bold text-slate-950 tracking-tight leading-none">
        <CountUp value={value} />
        <span className="text-sm font-normal text-slate-400 ml-1">{sub}</span>
      </p>
      <div className={`h-0.5 rounded-full ${accent.bar} opacity-40`} />
    </div>
  )
}


