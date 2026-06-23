'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, ChevronRight, ArrowLeft } from 'lucide-react'
import { clearRoomReservation, convertReservationToTenant } from '@/app/actions/rooms'

type Props = {
  roomId: string
  fullDeposit: number
  reservedDeposit: number
}

export function ReservationActions({ roomId, fullDeposit, reservedDeposit }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  // ยอดมัดจำที่รับแล้วรวม — default = fullDeposit ถ้าตั้งไว้ มิฉะนั้นใช้ยอดจอง
  const [totalDepositPaid, setTotalDepositPaid] = useState(
    String(fullDeposit > 0 ? fullDeposit : reservedDeposit)
  )

  const totalPaid = parseFloat(totalDepositPaid) || 0
  const stillOwed = Math.max(0, fullDeposit - totalPaid)
  // ส่วนที่รับเพิ่ม = ยอดรวม - ยอดจองที่ได้รับไปแล้ว
  const additionalDeposit = Math.max(0, totalPaid - reservedDeposit)

  function handleConvert() {
    startTransition(async () => {
      const result = await convertReservationToTenant(roomId, startDate, additionalDeposit)
      if (!result.success) {
        window.alert(result.message ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      if (result.tenantId) {
        router.push(`/tenants/${result.tenantId}`)
      } else {
        router.refresh()
      }
    })
  }

  function handleClear() {
    startTransition(async () => {
      const result = await clearRoomReservation(roomId)
      if (!result.success) {
        window.alert(result.message ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-violet-200 bg-white p-4 space-y-4">
        <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">ยืนยันการเปลี่ยนเป็นผู้เช่า</p>

        {/* วันเริ่มเช่า */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">วันที่เริ่มเช่า</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {/* Deposit */}
        <div className="rounded-lg bg-slate-50 p-3 space-y-2 text-sm">
          {fullDeposit > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>มัดจำทั้งหมด (ตามสัญญา)</span>
              <span className="font-medium text-slate-700">฿{fullDeposit.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>รับแล้ว (จากเงินจอง)</span>
            <span className="font-medium text-emerald-600">฿{reservedDeposit.toLocaleString()}</span>
          </div>
          {/* ยอดรวมที่รับได้จริง */}
          <div className="space-y-1">
            <label className="text-xs text-slate-500">เงินมัดจำที่รับแล้วรวม (บาท)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={totalDepositPaid}
              onChange={(e) => setTotalDepositPaid(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
            />
          </div>
          {fullDeposit > 0 && (
            <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
              <span className="text-slate-700">ยังค้างอีก</span>
              <span className={stillOwed > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                ฿{stillOwed.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowLeft className="size-3.5" /> ย้อนกลับ
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleConvert}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Check className="size-3.5" /> {pending ? 'กำลังดำเนินการ...' : 'ยืนยัน เริ่มสัญญาเช่า'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        <ChevronRight className="size-3.5" /> แปลงเป็นผู้เช่า
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleClear}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <X className="size-3.5" /> ยกเลิกจอง
      </button>
    </div>
  )
}
