import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { updateRoom } from '@/app/actions/rooms'
import { RoomForm } from '../../_components/room-form'
import { ChevronLeft } from 'lucide-react'
import { type RoomFormState } from '@/lib/definitions'

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single()

  if (!room) notFound()

  const boundAction = async (
    state: RoomFormState,
    formData: FormData
  ): Promise<RoomFormState> => {
    'use server'
    return updateRoom(id, state, formData)
  }

  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div>
        <Link href="/rooms"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ห้องเช่าทั้งหมด
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">แก้ไข</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ห้อง {room.room_number}</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
        <RoomForm action={boundAction} room={room} submitLabel="บันทึกการแก้ไข" />
      </div>
    </div>
  )
}

