'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncLineProfiles } from '@/app/actions/pair'

export function SyncLineButton() {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      const result = await syncLineProfiles()
      alert(result.message)
    })
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
    >
      <RefreshCw className={`size-3.5 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'กำลังอัปเดต...' : 'อัปเดตชื่อ/รูป LINE'}
    </button>
  )
}
