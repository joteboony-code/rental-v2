'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteTenant } from '@/app/actions/tenants'

type Props = {
  tenantId: string
  tenantName: string
  hasActiveContract: boolean
}

export function DeleteTenantButton({ tenantId, tenantName, hasActiveContract }: Props) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (hasActiveContract) {
    return (
      <p className="text-xs text-slate-400 text-center">
        ไม่สามารถลบได้ — ผู้เช่ามีสัญญาเช่าอยู่
      </p>
    )
  }

  function handleDelete() {
    if (!window.confirm(`ยืนยันการลบ "${tenantName}" ออกจากระบบ?\n\nข้อมูลจะถูกลบถาวร`)) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await deleteTenant(tenantId)
      if (res?.error) setErrorMsg(res.error)
    })
  }

  return (
    <div className="space-y-2">
      {errorMsg && (
        <p className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-600">
          {errorMsg}
        </p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:border-rose-400 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        {isPending ? 'กำลังลบ…' : 'ลบผู้เช่า'}
      </button>
    </div>
  )
}
