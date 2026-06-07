'use client'

import { useState, useTransition } from 'react'
import { terminateContract } from '@/app/actions/tenants'
import { Button } from '@/components/ui/button'
import { Loader2, XCircle } from 'lucide-react'

interface Props {
  contractId: string
  tenantId: string
}

export function TerminateContractButton({ contractId, tenantId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleClick() {
    if (!confirm('ยืนยันการยกเลิกสัญญาเช่า? ห้องจะกลับเป็น "ว่าง" โดยอัตโนมัติ')) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await terminateContract(contractId, tenantId)
      if (res.error) setErrorMsg(res.error)
    })
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="text-red-600 border-red-200 hover:bg-red-50"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <XCircle className="size-4 mr-1" />
            ยกเลิกสัญญา
          </>
        )}
      </Button>
      {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
    </div>
  )
}
