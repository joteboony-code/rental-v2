'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteRoom } from '@/app/actions/rooms'

export function DeleteRoomButton({ id, roomNumber }: { id: string; roomNumber: string }) {
  const [pending, startTransition] = useTransition()

  // ลบได้เฉพาะห้องเลข 31 ขึ้นไป — ห้อง 1–30 ไม่แสดงปุ่มลบ
  if ((parseInt(roomNumber) || 0) < 31) return null

  function handleDelete() {
    if (!confirm(`ยืนยันการลบห้อง ${roomNumber}?\nจะลบสัญญา บิล และประวัติการชำระของห้องนี้ทั้งหมด ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const result = await deleteRoom(id)
      if (!result.success) alert(result.message ?? 'ลบไม่สำเร็จ')
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
