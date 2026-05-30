'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteRoom } from '@/app/actions/rooms'

export function DeleteRoomButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('ยืนยันการลบห้องนี้?')) return
    startTransition(async () => {
      await deleteRoom(id)
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
      title="ลบห้อง"
    >
      <Trash2 className="size-4" />
    </button>
  )
}
