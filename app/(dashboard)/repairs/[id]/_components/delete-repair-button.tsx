'use client'

import { useTransition } from 'react'
import { deleteRepair } from '@/app/actions/repairs'

export function DeleteRepairButton({ repairId }: { repairId: string }) {
  const [pending, start] = useTransition()

  function handleDelete() {
    if (!confirm('ลบรายการนี้? ไม่สามารถกู้คืนได้')) return
    start(() => deleteRepair(repairId))
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors hover:underline disabled:opacity-50"
    >
      {pending ? 'กำลังลบ…' : 'ลบการแจ้งซ่อมนี้'}
    </button>
  )
}
