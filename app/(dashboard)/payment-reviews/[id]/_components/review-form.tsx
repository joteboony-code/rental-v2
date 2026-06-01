'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { approveSlip, approveSlipOldestFirst, rejectSlip } from '@/app/actions/payment-reviews'
import type { OutstandingBill } from '@/app/actions/payment-reviews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface Props {
  slipId: string
  tenantId: string | null
  defaultAmount?: number
  defaultPaidAt: string
  outstandingBills: OutstandingBill[]
}

const thaiMonth = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

const methodLabels: Record<string, string> = {
  transfer: '🏦 โอนเงิน',
  cash:     '💵 เงินสด',
  qr:       '📱 QR / PromptPay',
  other:    '• อื่นๆ',
}

export function ReviewForm({ slipId, tenantId, defaultAmount, defaultPaidAt, outstandingBills }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const [oldestFirst, setOldestFirst] = useState(false)
  const [selectedBillId, setSelectedBillId] = useState(outstandingBills[0]?.id ?? '')
  const [amount, setAmount] = useState(defaultAmount != null ? defaultAmount.toFixed(2) : '')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [paidAt, setPaidAt] = useState(defaultPaidAt)
  const [note, setNote] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleApprove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      if (oldestFirst && tenantId) {
        const res = await approveSlipOldestFirst(
          slipId, tenantId, Number(amount),
          paidAt, paymentMethod, note || null
        )
        setResult(res)
        if (res.success) router.push('/payment-reviews')
      } else {
        const fd = new FormData(formRef.current!)
        fd.set('paid_at', paidAt)
        const res = await approveSlip(slipId, fd)
        setResult(res)
        if (res.success) router.push('/payment-reviews')
      }
    })
  }

  function handleReject() {
    if (!rejectNote.trim() && !confirm('ยืนยันการปฏิเสธสลิปนี้?')) return
    startTransition(async () => {
      const res = await rejectSlip(slipId, rejectNote)
      setResult(res)
      if (res.success) router.push('/payment-reviews')
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
      <h2 className="text-base font-bold text-slate-900">ตรวจสอบและบันทึก</h2>

      <form ref={formRef} onSubmit={handleApprove} className="space-y-4">

        {/* Oldest-first toggle */}
        {tenantId && outstandingBills.length > 1 && (
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-amber-50 border border-amber-100">
            <input
              type="checkbox"
              checked={oldestFirst}
              onChange={(e) => setOldestFirst(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <p className="text-sm font-semibold text-amber-800">ตัดหนี้เก่าสุดก่อน</p>
              <p className="text-xs text-amber-600 mt-0.5">ระบบจะกระจายยอดเงินตัดบิลเก่าสุดก่อน อาจแบ่งไปหลายบิล</p>
            </div>
          </label>
        )}

        {/* Bill selector (hidden if oldestFirst) */}
        {!oldestFirst && (
          <div className="space-y-1.5">
            <Label htmlFor="bill_id">เลือกบิลที่จะตัดยอด <span className="text-red-500">*</span></Label>
            {outstandingBills.length === 0 ? (
              <p className="text-sm text-slate-400 italic">ไม่พบบิลค้างชำระ</p>
            ) : (
              <select
                id="bill_id"
                name="bill_id"
                value={selectedBillId}
                onChange={(e) => setSelectedBillId(e.target.value)}
                required={!oldestFirst}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">— เลือกบิล —</option>
                {outstandingBills.map((b) => (
                  <option key={b.id} value={b.id}>
                    ห้อง {b.room_number} — {thaiMonth(b.billing_month)} (ค้าง ฿{fmt(b.remaining)})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Amount */}
        <div className="space-y-1.5">
          <Label htmlFor="amount">จำนวนเงิน (บาท) <span className="text-red-500">*</span></Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        {/* Payment method */}
        <div className="space-y-1.5">
          <Label>วิธีชำระเงิน</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(methodLabels).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payment_method"
                  value={value}
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                  className="accent-violet-600"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Date/time */}
        <div className="space-y-1.5">
          <Label htmlFor="paid_at">วันเวลาที่รับชำระ</Label>
          <Input
            id="paid_at"
            name="paid_at"
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label htmlFor="note">หมายเหตุ</Label>
          <Textarea
            id="note"
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม..."
          />
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
            result.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {result.success ? <CheckCircle className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
            {result.message}
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {isPending ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</> : '✅ อนุมัติและบันทึกการชำระเงิน'}
        </Button>
      </form>

      {/* Reject section */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        {!showReject ? (
          <button
            type="button"
            onClick={() => setShowReject(true)}
            className="w-full text-sm text-red-500 hover:text-red-700 py-2 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            ❌ ปฏิเสธสลิปนี้
          </button>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="reject_note">เหตุผลการปฏิเสธ</Label>
            <Textarea
              id="reject_note"
              rows={2}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="เช่น สลิปปลอม, ยอดไม่ถูกต้อง..."
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                variant="destructive"
                className="flex-1"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <><XCircle className="size-4 mr-1" />ยืนยันปฏิเสธ</>}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowReject(false)}>
                ยกเลิก
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
