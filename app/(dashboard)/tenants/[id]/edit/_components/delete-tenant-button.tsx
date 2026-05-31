'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteTenant } from '@/app/actions/tenants'

type Props = {
  tenantId: string
  tenantName: string
  hasActiveContract: boolean
}

export function DeleteTenantButton({ tenantId, tenantName, hasActiveContract }: Props) {
  const [isPending, startTransition] = useTransition()

  if (hasActiveContract) {
    return (
      <p className="text-xs text-slate-400 text-center">
        ไม่สามารถลบได้ — ผู้เช่ามีสัญญาเช่าอยู่
      </p>
    )
  }

  function handleDelete() {
    if (!window.confirm(`ยืนยันการลบ "${tenantName}" ออกจากระบบ?\n\nข้อมูลจะถูกลบถาวร`)) return
    startTransition(() => deleteTenant(tenantId))
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:border-rose-400 disabled:opacity-50"
    >
      <Trash2 className="size-4" />
      {isPending ? 'กำลังลบ…' : 'ลบผู้เช่า'}
    </button>
  )
}
