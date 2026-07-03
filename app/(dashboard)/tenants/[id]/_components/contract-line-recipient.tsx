'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Link2Off, MessageCircle } from 'lucide-react'
import { unlinkContractLineRecipient } from '@/app/actions/pair'
import { Button } from '@/components/ui/button'

type Props = {
  contractId: string
  tenantId: string
  roomId: string
  roomNumber: string
  lineUserId: string | null
  displayName: string | null
  pictureUrl: string | null
}

export function ContractLineRecipient({
  contractId,
  tenantId,
  roomId,
  roomNumber,
  lineUserId,
  displayName,
  pictureUrl,
}: Props) {
  const [pending, startTransition] = useTransition()

  function unlink() {
    if (!confirm(`ยกเลิก LINE ผู้รับบิลแยกของห้อง ${roomNumber} ใช่หรือไม่?`)) return
    startTransition(async () => {
      const result = await unlinkContractLineRecipient(contractId, tenantId)
      if (result.success) toast.success('ยกเลิกผู้รับบิลแยกแล้ว ห้องนี้จะกลับไปใช้ LINE หลัก')
      else toast.error(result.message ?? 'ดำเนินการไม่สำเร็จ')
    })
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pictureUrl} alt="" className="size-9 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <MessageCircle className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-slate-400">LINE ผู้รับบิลห้อง {roomNumber}</p>
            <p className="truncate text-sm font-semibold text-slate-700">
              {lineUserId ? (displayName || 'จับคู่ LINE แยกแล้ว') : 'ใช้ LINE หลักของผู้เช่า'}
            </p>
          </div>
        </div>
        {lineUserId ? (
          <Button type="button" variant="outline" size="sm" onClick={unlink} disabled={pending}>
            <Link2Off className="size-3.5" />
            ยกเลิก
          </Button>
        ) : (
          <Link href={`/rooms/${roomId}`} className="text-xs font-semibold text-violet-600 hover:underline">
            เปิด QR จับคู่
          </Link>
        )}
      </div>
    </div>
  )
}
