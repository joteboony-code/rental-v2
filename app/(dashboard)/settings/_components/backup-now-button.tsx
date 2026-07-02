'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DatabaseBackup, Loader2 } from 'lucide-react'

export function BackupNowButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleBackup() {
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/backup', { method: 'POST' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'สำรองข้อมูลไม่สำเร็จ')
      setMessage('สำรองข้อมูลสำเร็จ')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBackup}
        disabled={disabled || pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? <Loader2 className="size-4 animate-spin" />
          : <DatabaseBackup className="size-4" />}
        {pending ? 'กำลังสำรองข้อมูล…' : 'สำรองตอนนี้'}
      </button>
      {message && (
        <p role="status" className="text-xs text-slate-500">{message}</p>
      )}
    </div>
  )
}
