'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPromise, cancelPromise, type PaymentPromise } from '@/app/actions/promises'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CalendarClock, Loader2, X, CheckCircle, AlertCircle } from 'lucide-react'
import { bangkokDateKey } from '@/lib/date-utils'

interface Props {
  billId: string
  tenantId: string | null
  roomId: string | null
  remainingAmount: number
  activePromise: PaymentPromise | null
}

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

export function PromiseButton({ billId, tenantId, roomId, remainingAmount, activePromise }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const today = bangkokDateKey()
  const [promiseDate, setPromiseDate] = useState(today)
  const [amount, setAmount] = useState(remainingAmount > 0 ? String(Math.round(remainingAmount)) : '')
  const [note, setNote] = useState('')

  const isMissed = activePromise && activePromise.promise_date < today

  function handleSave() {
    setResult(null)
    startTransition(async () => {
      const res = await createPromise({
        tenantId, roomId, billId,
        promiseDate,
        amount: amount ? Number(amount) : null,
        note: note || null,
      })
      setResult(res)
      if (res.success) { setOpen(false); router.refresh() }
    })
  }

  function handleCancel() {
    startTransition(async () => {
      await cancelPromise(activePromise!.id, billId)
      router.refresh()
    })
  }

  // มีนัดจ่าย active อยู่แล้ว — แสดงสถานะ
  if (activePromise && !open) {
    return (
      <div className={`rounded-xl border p-4 ${isMissed ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-2">
          <CalendarClock className={`size-4 shrink-0 mt-0.5 ${isMissed ? 'text-rose-600' : 'text-amber-600'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isMissed ? 'text-rose-700' : 'text-amber-700'}`}>
              {isMissed ? '⚠️ ผิดนัดจ่าย' : '🤝 นัดจ่าย'}
            </p>
            <p className={`text-xs mt-0.5 ${isMissed ? 'text-rose-600' : 'text-amber-600'}`}>
              {dateFmt(activePromise.promise_date)}
              {activePromise.amount ? ` · ฿${fmt(Number(activePromise.amount))}` : ''}
            </p>
            {activePromise.note && <p className="text-xs text-slate-500 mt-1">{activePromise.note}</p>}
          </div>
          <button onClick={handleCancel} disabled={isPending}
            className="text-slate-400 hover:text-rose-500 shrink-0" title="ยกเลิกนัด">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          </button>
        </div>
        <button onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:text-slate-700 mt-2 underline">
          แก้ไขนัด
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full">
        <CalendarClock className="size-4 mr-2" /> บันทึกนัดจ่าย
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">บันทึกนัดจ่าย</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promise_date">วันที่จะจ่าย</Label>
        <Input id="promise_date" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promise_amount">ยอดที่คาดว่าจะจ่าย (บาท)</Label>
        <Input id="promise_amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ไม่ระบุก็ได้" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promise_note">หมายเหตุ</Label>
        <Textarea id="promise_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รอเงินเดือนออก..." />
      </div>

      {result && !result.success && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="size-3.5 shrink-0" />{result.message}
        </div>
      )}

      <Button type="button" onClick={handleSave} disabled={isPending} className="w-full">
        {isPending ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</> : <><CheckCircle className="size-4 mr-2" />บันทึกนัด</>}
      </Button>
    </div>
  )
}
