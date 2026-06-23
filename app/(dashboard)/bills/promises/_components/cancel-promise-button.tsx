'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPromise } from '@/app/actions/promises'
import { Loader2 } from 'lucide-react'

interface Props {
  promiseId: string
  billId?: string
}

export function CancelPromiseButton({ promiseId, billId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    startTransition(async () => {
      await cancelPromise(promiseId, billId)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={isPending}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
      ยกเลิก
    </button>
  )
}
