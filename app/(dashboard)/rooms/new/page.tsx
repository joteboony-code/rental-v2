import Link from 'next/link'
import { createRoom } from '@/app/actions/rooms'
import { RoomForm } from '../_components/room-form'
import { ChevronLeft } from 'lucide-react'

export default function NewRoomPage() {
  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div>
        <Link href="/rooms"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ห้องเช่าทั้งหมด
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">เพิ่มใหม่</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">เพิ่มห้องใหม่</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
        <RoomForm action={createRoom} submitLabel="เพิ่มห้อง" />
      </div>
    </div>
  )
}

