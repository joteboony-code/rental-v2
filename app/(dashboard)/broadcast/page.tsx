import { createClient } from '@/lib/supabase/server'
import { Megaphone, Clock, Image as ImageIcon, Check, X } from 'lucide-react'
import { BroadcastForm } from './_components/broadcast-form'
import { EmptyState } from '@/components/ui/empty-state'

type BroadcastHistoryRow = {
  id: string
  message: string
  image_url: string | null
  target_room_numbers: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  created_at: string
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function BroadcastPage() {
  const supabase = await createClient()

  // Get all active contracts with room + tenant info
  const [{ data: contracts }, { data: history }] = await Promise.all([
    supabase
      .from('contracts')
      .select(`
        id, room_id,
        rooms   ( id, room_number ),
        tenants ( full_name, line_user_id )
      `)
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('broadcast_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  type RJ = { id: string; room_number: string }
  type TJ = { full_name: string; line_user_id: string | null }

  const rooms = (contracts ?? [])
    .map((c) => ({
      room_id:    c.room_id as string,
      room_number: (c.rooms as unknown as RJ | null)?.room_number ?? '—',
      tenant_name: (c.tenants as unknown as TJ | null)?.full_name ?? '—',
      has_line:    !!((c.tenants as unknown as TJ | null)?.line_user_id),
    }))
    .sort((a, b) => (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0))

  const lineCount = rooms.filter((r) => r.has_line).length

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
          <Megaphone className="size-5 text-violet-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">LINE OA</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ส่งประกาศ</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ผู้เช่ามี LINE {lineCount}/{rooms.length} ห้อง
          </p>
        </div>
      </div>

      <BroadcastForm rooms={rooms} />

      {/* ── ประวัติการประกาศ ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">ประวัติการประกาศ</h2>
        </div>

        {(history as BroadcastHistoryRow[] | null)?.length ? (
          <div className="space-y-3">
            {(history as BroadcastHistoryRow[]).map((h) => (
              <div key={h.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed flex-1">{h.message}</p>
                  {h.image_url && (
                    <a href={h.image_url} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.image_url} alt="รูปประกาศ" className="size-14 rounded-lg object-cover border border-slate-100" />
                    </a>
                  )}
                </div>

                <div className="flex items-center flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                    <Megaphone className="size-3" /> {h.target_room_numbers ?? 'ทุกห้อง'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                    <Check className="size-3" /> ส่ง {h.sent_count}
                  </span>
                  {h.failed_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-medium">
                      <X className="size-3" /> ไม่ได้ {h.failed_count}
                    </span>
                  )}
                  {h.image_url && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                      <ImageIcon className="size-3" /> มีรูป
                    </span>
                  )}
                  <span className="text-slate-400 ml-auto">{fmtDateTime(h.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Clock} title="ยังไม่มีประวัติการประกาศ" />
        )}
      </div>
    </div>
  )
}
