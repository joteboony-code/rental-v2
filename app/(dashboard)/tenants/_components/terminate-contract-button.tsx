'use client'

import { useTransition } from 'react'
import { terminateContract } from '@/app/actions/tenants'
import { Button } from '@/components/ui/button'
import { Loader2, XCircle } from 'lucide-react'

interface Props {
  contractId: string
  tenantId: string
}

export function TerminateContractButton({ contractId, tenantId }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('ยืนยันการยกเลิกสัญญาเช่า? ห้องจะกลับเป็น "ว่าง" โดยอัตโนมัติ')) return
    startTransition(() => terminateContract(contractId, tenantId))
  }

  return (
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
  )
}
