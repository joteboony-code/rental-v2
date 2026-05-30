import { createClient } from '@/lib/supabase/server'
import { Megaphone } from 'lucide-react'
import { BroadcastForm } from './_components/broadcast-form'

export default async function BroadcastPage() {
  const supabase = await createClient()

  // Get all active contracts with room + tenant info
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id, room_id,
      rooms   ( id, room_number ),
      tenants ( full_name, line_user_id )
    `)
    .eq('status', 'active')
    .order('created_at')

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
    </div>
  )
}
