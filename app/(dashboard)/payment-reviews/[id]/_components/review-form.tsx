'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveSlip, approveSlipOldestFirst, rejectSlip,
  saveSlipAsAdvance, reassignSlipTenant,
} from '@/app/actions/payment-reviews'
import type { OutstandingBill } from '@/app/actions/payment-reviews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle, XCircle, AlertCircle, AlertTriangle, User, Wallet } from 'lucide-react'

type TenantOption = { id: string; full_name: string; room_id: string | null; room_number: string | null }

interface Props {
  slipId: string
  tenantId: string | null
  tenantName: string | null
  roomId: string | null
  roomNumber: string | null
  lineUserId: string | null
  defaultAmount?: number
  slipPaidAt: string | null
  outstandingBills: OutstandingBill[]
  allTenants: TenantOption[]
  accountMismatch: boolean
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

export function ReviewForm({
  slipId, tenantId, tenantName, roomId, roomNumber, lineUserId,
  defaultAmount, slipPaidAt, outstandingBills, allTenants, accountMismatch,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const hasBills = outstandingBills.length > 0

  const [oldestFirst, setOldestFirst] = useState(false)
  const [selectedBillId, setSelectedBillId] = useState(outstandingBills[0]?.id ?? '')
  const [amount, setAmount] = useState(defaultAmount != null ? defaultAmount.toFixed(2) : '')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [paidAt, setPaidAt] = useState(() => {
    const d = slipPaidAt ? new Date(slipPaidAt) : new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const [note, setNote] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [mismatchAck, setMismatchAck] = useState(false)
  const [showChangeTenant, setShowChangeTenant] = useState(false)
  const [showAdvance, setShowAdvance] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleApprove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      if (oldestFirst && tenantId) {
        const res = await approveSlipOldestFirst(slipId, tenantId, Number(amount), paidAt, paymentMethod, note || null, lineUserId)
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

  function handleAdvance() {
    if (!tenantId) { setResult({ success: false, message: 'ไม่พบผู้เช่า' }); return }
    setResult(null)
    startTransition(async () => {
      const res = await saveSlipAsAdvance(slipId, tenantId, roomId, Number(amount), note || null)
      setResult(res)
      if (res.success) router.push('/payment-reviews')
    })
  }

  function handleChangeTenant(newTenantId: string, newRoomId: string | null) {
    startTransition(async () => {
      const res = await reassignSlipTenant(slipId, newTenantId, newRoomId)
      setResult(res)
      if (res.success) { setShowChangeTenant(false); router.refresh() }
    })
  }

  const approveDisabled = isPending || !hasBills || (accountMismatch && !mismatchAck)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
      <h2 className="text-base font-bold text-slate-900">ตรวจสอบและบันทึก</h2>

      {/* Account mismatch warning */}
      {accountMismatch && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">⚠️ บัญชีผู้รับไม่ตรงกับบัญชีของร้าน</p>
              <p className="text-xs text-red-600 mt-0.5">SlipOK ตรวจพบว่าเงินอาจไม่ได้โอนเข้าบัญชีของหอ กรุณาตรวจสอบให้แน่ใจก่อนอนุมัติ</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pl-6">
            <input type="checkbox" checked={mismatchAck} onChange={(e) => setMismatchAck(e.target.checked)} className="accent-red-600" />
            <span className="text-xs font-medium text-red-700">ฉันตรวจสอบแล้วว่าเงินเข้าบัญชีถูกต้อง</span>
          </label>
        </div>
      )}

      {/* Detected tenant (read-only) */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <User className="size-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">ผู้เช่าที่ระบบจับได้</p>
            <p className="text-sm font-semibold text-slate-800">
              {tenantName ?? '— ไม่พบผู้เช่า —'}
              {roomNumber && <span className="text-xs font-normal text-slate-400 ml-2">ห้อง {roomNumber}</span>}
            </p>
          </div>
          <button type="button" onClick={() => setShowChangeTenant((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-700 underline shrink-0">
            เปลี่ยน
          </button>
        </div>

        {/* Change tenant (misdetection) */}
        {showChangeTenant && (
          <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
            <Label className="text-xs">เลือกผู้เช่าที่ถูกต้อง (เฉพาะกรณีจับผิด)</Label>
            <select
              defaultValue=""
              onChange={(e) => {
                const t = allTenants.find((x) => `${x.id}|${x.room_id ?? ''}` === e.target.value)
                if (t) handleChangeTenant(t.id, t.room_id)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">— เลือกผู้เช่า —</option>
              {allTenants.map((t) => (
                <option key={`${t.id}|${t.room_id ?? ''}`} value={`${t.id}|${t.room_id ?? ''}`}>
                  {t.full_name}{t.room_number ? ` (ห้อง ${t.room_number})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Has outstanding bills → approve form ── */}
      {hasBills ? (
        <form ref={formRef} onSubmit={handleApprove} className="space-y-4">

          {tenantId && outstandingBills.length > 1 && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-amber-50 border border-amber-100">
              <input type="checkbox" checked={oldestFirst} onChange={(e) => setOldestFirst(e.target.checked)} className="mt-0.5 accent-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">ตัดหนี้เก่าสุดก่อน</p>
                <p className="text-xs text-amber-600 mt-0.5">ระบบจะกระจายยอดเงินตัดบิลเก่าสุดก่อน อาจแบ่งไปหลายบิล</p>
              </div>
            </label>
          )}

          {!oldestFirst && (
            <div className="space-y-1.5">
              <Label htmlFor="bill_id">เลือกบิลที่จะตัดยอด <span className="text-red-500">*</span></Label>
              <select
                id="bill_id" name="bill_id" value={selectedBillId}
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
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="amount">จำนวนเงิน (บาท) <span className="text-red-500">*</span></Label>
            <Input id="amount" name="amount" type="number" min="0.01" step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </div>

          <div className="space-y-1.5">
            <Label>วิธีชำระเงิน</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(methodLabels).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="payment_method" value={value}
                    checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} className="accent-violet-600" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paid_at">วันเวลาที่รับชำระ</Label>
            <Input id="paid_at" name="paid_at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">หมายเหตุ</Label>
            <Textarea id="note" name="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติม..." />
          </div>

          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${result.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.success ? <CheckCircle className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              {result.message}
            </div>
          )}

          <Button type="submit" disabled={approveDisabled} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {isPending ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</> : '✅ อนุมัติและบันทึกการชำระเงิน'}
          </Button>
        </form>
      ) : (
        /* ── No outstanding bills ── */
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
            <p className="text-sm font-semibold text-slate-600">ไม่พบบิลค้างชำระของผู้เช่ารายนี้</p>
            <p className="text-xs text-slate-400 mt-1">เลือกดำเนินการด้านล่าง</p>
          </div>

          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${result.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.success ? <CheckCircle className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              {result.message}
            </div>
          )}

          {/* Advance payment */}
          {!showAdvance ? (
            <Button type="button" variant="outline" onClick={() => setShowAdvance(true)} disabled={!tenantId} className="w-full">
              <Wallet className="size-4 mr-2" /> บันทึกเป็นเงินรับล่วงหน้า
            </Button>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">เงินรับล่วงหน้า</p>
              <div className="space-y-1.5">
                <Label htmlFor="adv_amount">จำนวนเงิน (บาท) <span className="text-red-500">*</span></Label>
                <Input id="adv_amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv_note">หมายเหตุ</Label>
                <Textarea id="adv_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จ่ายล่วงหน้าเดือนหน้า..." />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handleAdvance} disabled={isPending || (accountMismatch && !mismatchAck)} className="flex-1">
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : 'บันทึกเงินล่วงหน้า'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAdvance(false)}>ยกเลิก</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject section */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        {!showReject ? (
          <button type="button" onClick={() => setShowReject(true)}
            className="w-full text-sm text-red-500 hover:text-red-700 py-2 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
            ❌ ปฏิเสธสลิปนี้
          </button>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="reject_note">เหตุผลการปฏิเสธ</Label>
            <Textarea id="reject_note" rows={2} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="เช่น สลิปปลอม, ยอดไม่ถูกต้อง..." />
            <div className="flex gap-2">
              <Button type="button" onClick={handleReject} disabled={isPending} variant="destructive" className="flex-1">
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <><XCircle className="size-4 mr-1" />ยืนยันปฏิเสธ</>}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowReject(false)}>ยกเลิก</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
