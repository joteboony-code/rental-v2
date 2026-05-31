import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, Home, User, Calendar } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { RepairStatusBadge, RepairPriorityBadge } from '../_components/repair-status-badge'
import { StatusUpdater } from '../_components/status-updater'
import { DeleteRepairButton } from './_components/delete-repair-button'

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: repair } = await supabase
    .from('repair_requests')
    .select(`
      *,
      rooms ( room_number, floor ),
      tenants ( full_name )
    `)
    .eq('id', id)
    .single()

  if (!repair) notFound()

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string }
  const room   = repair.rooms   as unknown as RoomJoin   | null
  const tenant = repair.tenants as unknown as TenantJoin | null

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div>
        <Link href="/repairs"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> แจ้งซ่อมทั้งหมด
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                {room?.room_number ?? '—'}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-950 tracking-tight">{repair.title}</h1>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  {room && <span className="flex items-center gap-1"><Home className="size-3" /> แถวที่ {roomRow(room.room_number)}</span>}
                  {tenant && <span className="flex items-center gap-1"><User className="size-3" /> {tenant.full_name}</span>}
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(repair.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RepairPriorityBadge priority={repair.priority} />
            <RepairStatusBadge   status={repair.status}   />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left: Photo + Description */}
        <div className="md:col-span-2 space-y-4">

          {/* Photo */}
          {repair.photo_url && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={repair.photo_url}
                alt="repair photo"
                className="w-full max-h-72 object-contain"
              />
            </div>
          )}

          {/* Description */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">รายละเอียดปัญหา</p>
            {repair.description ? (
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{repair.description}</p>
            ) : (
              <p className="text-sm text-slate-300">ไม่มีรายละเอียดเพิ่มเติม</p>
            )}
          </div>

          {/* Admin note */}
          {repair.admin_note && (
            <div className="bg-slate-950 rounded-2xl p-5 text-white">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">บันทึกผู้ดูแล</p>
              <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">{repair.admin_note}</p>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">

          {repair.status === 'done' && (
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5 text-center">
              <div className="size-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="font-bold text-emerald-700">ซ่อมเสร็จแล้ว</p>
              <p className="text-xs text-emerald-600 mt-1">
                {new Date(repair.updated_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>
          )}

          {repair.status !== 'done' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">อัปเดตสถานะ</p>
              <StatusUpdater
                repairId={id}
                currentStatus={repair.status}
                currentNote={repair.admin_note}
              />
            </div>
          )}

          {/* Danger zone */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">ลบรายการ</p>
            <DeleteRepairButton repairId={id} />
          </div>
        </div>
      </div>
    </div>
  )
}

