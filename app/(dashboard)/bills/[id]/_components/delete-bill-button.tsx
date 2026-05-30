'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteBill } from '@/app/actions/bills'

export function DeleteBillButton({ billId, roomNumber, month }: { billId: string; roomNumber: string; month: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`ลบบิลห้อง ${roomNumber} ประจำเดือน ${month}?\nจะลบบิลและประวัติการชำระทั้งหมด ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const result = await deleteBill(billId)
      if (!result.success) {
        alert(result.message ?? 'ลบบิลไม่สำเร็จ')
        return
      }
      router.push('/bills')
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={pending}
      className="gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-400"
    >
      <Trash2 className="size-3.5" />
      {pending ? 'กำลังลบ…' : 'ลบบิล'}
    </Button>
  )
}
