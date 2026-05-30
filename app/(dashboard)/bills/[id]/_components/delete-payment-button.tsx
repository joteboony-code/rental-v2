'use client'

import { useTransition } from 'react'
import { deletePayment } from '@/app/actions/payments'
import { Trash2, Loader2 } from 'lucide-react'

export function DeletePaymentButton({ paymentId, billId }: { paymentId: string; billId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('ลบรายการชำระนี้?')) return
    startTransition(async () => { await deletePayment(paymentId, billId) })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
      title="ลบ"
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  )
}
