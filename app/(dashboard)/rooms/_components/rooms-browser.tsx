'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, BarChart2, Building2, Eye, Wifi } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { LineAvatar } from '@/components/line-avatar'
import { roomStatusVisual } from '@/lib/status'
import { RoomStatusBadge } from './room-status-badge'
import { RoomPairQrButton } from './room-pair-qr-button'
import { DeleteRoomButton } from './delete-room-button'

export type RoomRow = {
  id: string
  room_number: string
  floor: number | null
  status: string
  monthly_rent: number
  wifi_fee: number
  tenantId: string | null
  tenantName: string | null
  tenantPhone: string | null
  tenantPicture: string | null
  pairUrl: string
  registrationUrl: string
}

const fmt = (n: number) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 })

// แสดง tab เรียงตามลำดับนี้ (เฉพาะสถานะที่มีห้องอยู่จริง)
const STATUS_ORDER = ['occupied', 'available', 'reserved', 'maintenance']

const STATUS_ACCENT: Record<string, { strip: string; numBg: string; numText: string; numRing: string }> = {
  occupied:    { strip: 'bg-emerald-500', numBg: 'bg-emerald-50',  numText: 'text-emerald-700', numRing: 'ring-1 ring-emerald-200' },
  available:   { strip: 'bg-sky-500',     numBg: 'bg-sky-50',      numText: 'text-sky-700',     numRing: 'ring-1 ring-sky-200' },
  reserved:    { strip: 'bg-violet-500',  numBg: 'bg-violet-50',   numText: 'text-violet-700',  numRing: 'ring-1 ring-violet-200' },
  maintenance: { strip: 'bg-amber-500',   numBg: 'bg-amber-50',    numText: 'text-amber-700',   numRing: 'ring-1 ring-amber-200' },
}

export function RoomsBrowser({ rooms }: { rooms: RoomRow[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('all')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rooms) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [rooms])

  const tabs = useMemo(() => [
    { value: 'all', label: 'ทั้งหมด', count: rooms.length },
    ...STATUS_ORDER.filter((s) => counts[s]).map((s) => ({
      value: s,
      label: roomStatusVisual[s]?.label ?? s,
      count: counts[s],
    })),
  ], [counts, rooms.length])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rooms.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (!q) return true
      return (
        r.room_number.toLowerCase().includes(q) ||
        (r.tenantName ?? '').toLowerCase().includes(q) ||
        (r.tenantPhone ?? '').toLowerCase().includes(q)
      )
    })
  }, [rooms, query, status])

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
      />

      {/* Filter tabs — แสดงเมื่อมีมากกว่า 1 สถานะ */}
      {tabs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(({ value, label, count }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
                status === value
                  ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                status === value ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        rooms.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="ยังไม่มีห้องในระบบ"
            description="เริ่มต้นด้วยการเพิ่มห้องแรก"
            action={
              <Link href="/rooms/new" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
                เพิ่มห้องแรก
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="ไม่พบห้องที่ตรงเงื่อนไข"
            description={query ? `ไม่มีผลลัพธ์สำหรับ "${query}"` : 'ลองเปลี่ยนตัวกรองสถานะ'}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((room) => {
            const accent = STATUS_ACCENT[room.status] ?? { strip: 'bg-slate-400', numBg: 'bg-slate-100', numText: 'text-slate-700', numRing: 'ring-1 ring-slate-200' }
            return (
            <div key={room.id} className="group flex flex-col rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200 overflow-hidden">
              {/* Status strip */}
              <div className={`h-1 w-full ${accent.strip}`} />

              <div className="flex flex-col gap-3 p-4 flex-1">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <Link
                    href={`/rooms/${room.id}`}
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-opacity hover:opacity-80 ${accent.numBg} ${accent.numText} ${accent.numRing}`}
                  >
                    {room.room_number}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/rooms/${room.id}`} className="text-sm font-semibold text-slate-900 hover:underline">
                        ห้อง {room.room_number}
                      </Link>
                      <span className="text-xs text-slate-400">แถวที่ {roomRow(room.room_number)}</span>
                    </div>
                    <div className="mt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RoomStatusBadge status={room.status} />
                        {room.wifi_fee > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                            <Wifi className="size-3" />
                            WiFi ฿{fmt(room.wifi_fee)}/เดือน
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tenant + rent */}
                <div className="flex items-end justify-between border-t border-slate-100 pt-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">ผู้เช่า</p>
                    {room.tenantId && room.tenantName ? (
                      <Link href={`/tenants/${room.tenantId}`} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-indigo-600 hover:underline">
                        <LineAvatar name={room.tenantName} pictureUrl={room.tenantPicture} className="size-5 rounded-md text-[9px]" />
                        <span className="truncate">{room.tenantName}</span>
                      </Link>
                    ) : (
                      <p className="text-sm text-slate-400">— ว่าง —</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400 mb-0.5">ค่าเช่า</p>
                    <p className="text-xl font-bold text-slate-900 leading-tight">฿{fmt(room.monthly_rent)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                  <RoomPairQrButton roomNumber={room.room_number} registrationUrl={room.registrationUrl} pairUrl={room.pairUrl} />
                  {room.tenantId && (
                    <Link
                      href={`/rooms/${room.id}/portal-preview`}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600"
                      title="ดู Portal ในฐานะผู้ดูแล"
                      aria-label={`ดู Portal ห้อง ${room.room_number}`}
                    >
                      <Eye className="size-4" />
                    </Link>
                  )}
                  <Link href={`/rooms/${room.id}/usage`} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-600" title="กราฟการใช้น้ำ-ไฟ">
                    <BarChart2 className="size-4" />
                  </Link>
                  <Link href={`/rooms/${room.id}/edit`} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="แก้ไข">
                    <Pencil className="size-4" />
                  </Link>
                  <DeleteRoomButton id={room.id} roomNumber={room.room_number} />
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
