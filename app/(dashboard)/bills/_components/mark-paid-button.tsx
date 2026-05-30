'use client'

import { useTransition } from 'react'
import { markBillPaid } from '@/app/actions/bills'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2 } from 'lucide-react'

export function MarkPaidButton({ billId }: { billId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('ยืนยันการรับชำระเงิน?')) return
    startTransition(async () => { await markBillPaid(billId) })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="text-green-700 border-green-200 hover:bg-green-50"
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <>
          <CheckCircle className="size-4 mr-1" />
          รับชำระ
        </>
      )}
    </Button>
  )
}
