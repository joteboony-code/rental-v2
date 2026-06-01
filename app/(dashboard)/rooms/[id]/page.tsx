import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { RoomStatusBadge } from '../_components/room-status-badge'
import { BillStatusBadge } from '../../bills/_components/bill-status-badge'
import { ChevronLeft, Pencil, User, FileText, Wrench } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { ReservationActions } from '../_components/reservation-actions'

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: room }, { data: bills }, { data: repairs }] = await Promise.all([
    supabase
      .from('rooms')
      .select(`*, contracts!left ( id, status, start_date, end_date, monthly_rent, tenants ( id, full_name, phone ) )`)
      .eq('id', id)
      .single(),
    supabase
      .from('bills')
      .select('id, billing_month, total_amount, status, due_date')
      .eq('room_id', id)
      .order('billing_month', { ascending: false })
      .limit(6),
    supabase
      .from('repairs')
      .select('id, title, status, priority, created_at')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (!room) notFound()

  type ContractRow = {
    id: string; status: string; start_date: string; end_date: string | null; monthly_rent: number
    tenants: { id: string; full_name: string; phone: string | null } | null
  }

  const contracts = room.contracts as ContractRow[] | null
  const activeContract = contracts?.find((c) => c.status === 'active')
  const pastContracts = contracts?.filter((c) => c.status !== 'active') ?? []

  const priorityLabel: Record<string, string> = { low: 'ต่ำ', medium: 'กลาง', high: 'สูง', urgent: 'ด่วน!' }
  const priorityColor: Record<string, string> = {
    low: 'bg-slate-100 text-slate-500',
    medium: 'bg-amber-50 text-amber-600',
    high: 'bg-orange-50 text-orange-600',
    urgent: 'bg-rose-50 text-rose-600',
  }
  const repairStatusLabel: Record<string, string> = { pending: 'รอดำเนินการ', in_progress: 'กำลังซ่อม', done: 'เสร็จแล้ว' }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div>
        <Link href="/rooms"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ห้องเช่าทั้งหมด
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              แถวที่ {roomRow(room.room_number)}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ห้อง {room.room_number}</h1>
          </div>
          <div className="flex items-center gap-2">
            <RoomStatusBadge status={room.status} />
            <Link href={`/rooms/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <Pencil className="size-3.5" /> แก้ไข
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* ── Left: Room info + tenant ── */}
        <div className="md:col-span-1 space-y-4">

          {/* Room info */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ข้อมูลห้อง</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">ค่าเช่า</span>
                <span className="font-semibold text-slate-800">฿{Number(room.monthly_rent).toLocaleString()}/เดือน</span>
              </div>
              {room.floor && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ชั้น</span>
                  <span className="font-semibold text-slate-800">{room.floor}</span>
                </div>
              )}
              {room.size_sqm && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ขนาด</span>
                  <span className="font-semibold text-slate-800">{room.size_sqm} ตร.ม.</span>
                </div>
              )}
            </div>
          </div>

          {room.status === 'reserved' && (
            <div className="bg-violet-50 rounded-2xl border border-violet-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest">การจอง</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-violet-500">ผู้จอง</span>
                  <span className="font-semibold text-violet-900 text-right">{room.reserved_name ?? '-'}</span>
                </div>
                {room.reserved_phone && (
                  <div className="flex justify-between gap-3">
                    <span className="text-violet-500">เบอร์โทร</span>
                    <span className="font-semibold text-violet-900">{room.reserved_phone}</span>
                  </div>
                )}
                {room.reserved_deposit !== null && room.reserved_deposit !== undefined && (
                  <div className="flex justify-between gap-3">
                    <span className="text-violet-500">เงินจอง</span>
                    <span className="font-semibold text-violet-900">฿{Number(room.reserved_deposit).toLocaleString()}</span>
                  </div>
                )}
                {room.reservation_expires && (
                  <div className="flex justify-between gap-3">
                    <span className="text-violet-500">หมดอายุ</span>
                    <span className="font-semibold text-violet-900">{new Date(room.reservation_expires).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                )}
                {room.reservation_note && (
                  <p className="rounded-xl bg-white/70 p-3 text-sm text-violet-700">{room.reservation_note}</p>
                )}
              </div>
              <ReservationActions roomId={id} />
            </div>
          )}

          {/* Current tenant */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <User className="size-3.5" /> ผู้เช่าปัจจุบัน
            </p>
            {activeContract?.tenants ? (
              <div className="space-y-3">
                <Link href={`/tenants/${activeContract.tenants.id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                    {activeContract.tenants.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{activeContract.tenants.full_name}</p>
                    {activeContract.tenants.phone && (
                      <p className="text-xs text-slate-400">{activeContract.tenants.phone}</p>
                    )}
                  </div>
                </Link>
                <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-50">
                  <div className="flex justify-between">
                    <span>เริ่มสัญญา</span>
                    <span>{new Date(activeContract.start_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                  {activeContract.end_date && (
                    <div className="flex justify-between">
                      <span>สิ้นสุดสัญญา</span>
                      <span>{new Date(activeContract.end_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">ห้องว่าง</p>
            )}
          </div>

          {/* Past tenants */}
          {pastContracts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">ประวัติผู้เช่า</p>
              <div className="space-y-2">
                {pastContracts.map((c) => (
                  c.tenants && (
                    <Link key={c.id} href={`/tenants/${c.tenants.id}`}
                      className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity">
                      <div className="size-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {c.tenants.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-600 font-medium truncate">{c.tenants.full_name}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(c.start_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })}
                          {c.end_date && ` – ${new Date(c.end_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })}`}
                        </p>
                      </div>
                    </Link>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Bills + Repairs ── */}
        <div className="md:col-span-2 space-y-5">

          {/* Bills */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="size-3.5" /> บิลล่าสุด
              </p>
              <Link href="/bills" className="text-xs text-slate-400 hover:text-slate-700 transition-colors">ดูทั้งหมด →</Link>
            </div>
            {bills && bills.length > 0 ? (
              <div className="space-y-0">
                {bills.map((bill) => (
                  <Link key={bill.id} href={`/bills/${bill.id}`}
                    className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">
                        {new Date(bill.billing_month).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        ครบกำหนด {new Date(bill.due_date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <p className="font-bold text-slate-950 text-sm">
                      ฿{Number(bill.total_amount).toLocaleString()}
                    </p>
                    <BillStatusBadge status={bill.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">ยังไม่มีบิล</p>
            )}
          </div>

          {/* Repairs */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Wrench className="size-3.5" /> ประวัติแจ้งซ่อม
              </p>
              <Link href="/repairs" className="text-xs text-slate-400 hover:text-slate-700 transition-colors">ดูทั้งหมด →</Link>
            </div>
            {repairs && repairs.length > 0 ? (
              <div className="space-y-0">
                {repairs.map((r) => (
                  <Link key={r.id} href={`/repairs/${r.id}`}
                    className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{r.title}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(r.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[r.priority] ?? 'bg-slate-100 text-slate-500'}`}>
                      {priorityLabel[r.priority] ?? r.priority}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">{repairStatusLabel[r.status] ?? r.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">ไม่มีประวัติแจ้งซ่อม</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
