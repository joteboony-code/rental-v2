'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { clearRoomReservation, convertReservationToTenant } from '@/app/actions/rooms'

export function ReservationActions({ roomId }: { roomId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function runAction(action: (roomId: string) => Promise<{ success: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action(roomId)
      if (!result.success) {
        window.alert(result.message ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => runAction(convertReservationToTenant)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        <Check className="size-3.5" /> แปลงเป็นผู้เช่า
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => runAction(clearRoomReservation)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <X className="size-3.5" /> ยกเลิกจอง
      </button>
    </div>
  )
}
