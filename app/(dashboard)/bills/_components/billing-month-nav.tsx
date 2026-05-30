'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { shiftBillingMonth } from '@/app/actions/settings'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export function BillingMonthNav({ currentMonth }: { currentMonth: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function shift(dir: 'prev' | 'next') {
    startTransition(async () => {
      const res = await shiftBillingMonth(dir)
      if (res.success) {
        router.push(`/admin/bills?month=${res.month}`)
      }
    })
  }

  const label = new Date(currentMonth + '-01').toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long',
  })

  return (
    <div className="flex items-center gap-1 bg-white rounded-2xl border border-slate-100 shadow-sm px-2 py-1.5">
      <button
        type="button"
        onClick={() => shift('prev')}
        disabled={pending}
        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition disabled:opacity-50"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-sm font-semibold text-slate-700 px-2 min-w-[130px] text-center">
        {pending ? <Loader2 className="size-4 animate-spin mx-auto" /> : label}
      </span>
      <button
        type="button"
        onClick={() => shift('next')}
        disabled={pending}
        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition disabled:opacity-50"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
