'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MessageCircle, Link2Off, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unlinkTenantLine } from '@/app/actions/pair'

type Props = {
  tenantId: string
  lineUserId: string | null
  lineDisplayName?: string | null
  linePictureUrl?: string | null
}

export function LinePairCard({ tenantId, lineUserId, lineDisplayName, linePictureUrl }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleUnlink() {
    if (!window.confirm('ยืนยันการยกเลิกจับคู่ LINE?')) return
    setError(null)
    startTransition(async () => {
      const result = await unlinkTenantLine(tenantId)
      if (!result.success) { setError(result.message ?? 'เกิดข้อผิดพลาด'); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <MessageCircle className="size-3.5" /> LINE
      </p>

      {lineUserId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl ring-1 ring-emerald-200">
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700">จับคู่แล้ว</span>
          </div>

          {/* LINE profile */}
          <div className="flex items-center gap-3 px-3 py-3 bg-slate-50 rounded-xl">
            <div className="shrink-0">
              {linePictureUrl ? (
                <Image
                  src={linePictureUrl}
                  alt={lineDisplayName ?? 'LINE profile'}
                  width={40}
                  height={40}
                  className="size-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                  unoptimized
                />
              ) : (
                <div className="size-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <UserRound className="size-5 text-slate-400" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {lineDisplayName ? (
                <p className="text-sm font-semibold text-slate-800 truncate">{lineDisplayName}</p>
              ) : (
                <p className="text-xs text-slate-400">ไม่มีชื่อ LINE</p>
              )}
              <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{lineUserId}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-400 rounded-xl"
            onClick={handleUnlink}
            disabled={isPending}
          >
            <Link2Off className="size-3.5" />
            {isPending ? 'กำลังยกเลิก…' : 'ยกเลิกการจับคู่'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-xl ring-1 ring-slate-200">
          <span className="size-2 rounded-full bg-slate-300 shrink-0" />
          <span className="text-xs font-semibold text-slate-500">ยังไม่ได้จับคู่</span>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
