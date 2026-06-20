'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { recordPayment } from '@/app/actions/payments'
import { verifySlip } from '@/app/actions/slipok'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2, Upload, X,
  CheckCircle, AlertCircle, ShieldCheck, AlertTriangle,
} from 'lucide-react'

interface Props {
  billId:          string
  remainingAmount: number
}

const methodLabels: Record<string, string> = {
  cash:     '💵 เงินสด',
  transfer: '🏦 โอนเงิน',
  qr:       '📱 QR / PromptPay',
  other:    '• อื่นๆ',
}

type VerifyStatus = 'idle' | 'verifying' | 'verified' | 'failed'

export function PaymentForm({ billId, remainingAmount }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult]          = useState<{ success: boolean; message: string } | null>(null)

  // Controlled field state (so SlipOK can auto-fill them)
  const [amount,        setAmount]        = useState(remainingAmount > 0 ? remainingAmount.toFixed(2) : '')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paidAt,        setPaidAt]        = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  // Slip preview + verification state
  const [slipFile,     setSlipFile]     = useState<File | null>(null)
  const [preview,      setPreview]      = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle')
  const [verifyMsg,    setVerifyMsg]    = useState('')

  const formRef    = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Slip upload → auto verify ──────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { setSlipFile(null); setPreview(null); setVerifyStatus('idle'); return }

    setSlipFile(file)
    setPreview(URL.createObjectURL(file))
    setVerifyStatus('verifying')
    setVerifyMsg('')

    const fd = new FormData()
    fd.append('slip', file)
    if (remainingAmount > 0) {
      fd.append('amount', remainingAmount.toFixed(2))
    }
    const res = await verifySlip(fd)

    if (res.success) {
      setVerifyStatus('verified')
      setVerifyMsg(res.senderName ? `ผู้โอน: ${res.senderName}` : 'ตรวจสลิปสำเร็จ')
      if (res.amount)  setAmount(res.amount.toFixed(2))
      if (res.paidAt)  setPaidAt(res.paidAt)
      setPaymentMethod('transfer')
    } else {
      setVerifyStatus('failed')
      setVerifyMsg(res.error ?? 'ตรวจสอบสลิปไม่สำเร็จ กรุณากรอกข้อมูลเอง')
    }
  }

  function clearSlip() {
    setSlipFile(null)
    setPreview(null)
    setVerifyStatus('idle')
    setVerifyMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Submit ─────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const entered = parseFloat(amount) || 0
    if (remainingAmount > 0 && entered > remainingAmount) {
      const over = (entered - remainingAmount).toLocaleString('th-TH', { maximumFractionDigits: 2 })
      const ok = window.confirm(
        `ยอดที่กรอก (฿${entered.toLocaleString('th-TH')}) มากกว่ายอดค้าง (฿${remainingAmount.toLocaleString('th-TH')}) อยู่ ฿${over}\n\nยืนยันบันทึกยอดนี้หรือไม่?`
      )
      if (!ok) return
    }
    const formData = new FormData(e.currentTarget)
    if (slipFile) {
      formData.set('slip', slipFile)
    }
    setResult(null)
    startTransition(async () => {
      const res = await recordPayment(billId, formData)
      setResult(res)
      if (res.success) {
        formRef.current?.reset()
        setSlipFile(null)
        setPreview(null)
        setVerifyStatus('idle')
        setVerifyMsg('')
        setAmount(remainingAmount > 0 ? remainingAmount.toFixed(2) : '')
        setPaymentMethod('cash')
        const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); setPaidAt(now.toISOString().slice(0, 16))
        router.refresh()
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">

      {/* ── Slip upload (ต้นขึ้นก่อน → auto-fill ด้านล่าง) ── */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-violet-500" />
          อัพโหลดสลิป (ตรวจอัตโนมัติ)
        </Label>

        {preview ? (
          <div className="space-y-2">
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="slip preview"
                className="w-full max-h-56 object-contain rounded-xl border border-slate-100"
              />
              <button
                type="button"
                onClick={clearSlip}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow border hover:bg-red-50"
              >
                <X className="size-4 text-red-500" />
              </button>
            </div>

            {/* Verify status banner */}
            {verifyStatus === 'verifying' && (
              <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-100 text-violet-700">
                <Loader2 className="size-3.5 animate-spin shrink-0" />
                กำลังตรวจสอบสลิป...
              </div>
            )}
            {verifyStatus === 'verified' && (
              <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                <CheckCircle className="size-3.5 shrink-0" />
                <span><strong>ตรวจสลิปสำเร็จ</strong> · {verifyMsg} · กรอกข้อมูลแล้วอัตโนมัติ</span>
              </div>
            )}
            {verifyStatus === 'failed' && (
              <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-700">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{verifyMsg}</span>
              </div>
            )}
          </div>
        ) : (
          <label
            htmlFor="slip"
            className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer text-slate-400 hover:border-violet-300 hover:text-violet-400 transition-colors"
          >
            <Upload className="size-5" />
            <span className="text-xs text-center">
              คลิกเพื่ออัปโหลดสลิป<br />
              <span className="text-slate-300">ระบบจะตรวจสอบและกรอกข้อมูลให้อัตโนมัติ</span>
            </span>
            <input
              ref={fileInputRef}
              id="slip"
              name="slip"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>

      {/* ── Amount ── */}
      <div className="space-y-1.5">
        <Label htmlFor="amount">
          จำนวนเงิน (บาท) <span className="text-red-500">*</span>
        </Label>
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
          className={verifyStatus === 'verified' ? 'border-emerald-300 bg-emerald-50/40' : ''}
        />
        {remainingAmount > 0 && (parseFloat(amount) || 0) > remainingAmount && (
          <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>ยอดเกินกว่าค้าง ฿{((parseFloat(amount) || 0) - remainingAmount).toLocaleString('th-TH', { maximumFractionDigits: 2 })} — ระบบจะขอยืนยันก่อนบันทึก</span>
          </div>
        )}
      </div>

      {/* ── Payment method ── */}
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

      {/* ── Date/Time ── */}
      <div className="space-y-1.5">
        <Label htmlFor="paid_at">วันเวลาที่รับชำระ</Label>
        <Input
          id="paid_at"
          name="paid_at"
          type="datetime-local"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className={verifyStatus === 'verified' ? 'border-emerald-300 bg-emerald-50/40' : ''}
        />
      </div>

      {/* ── Note ── */}
      <div className="space-y-1.5">
        <Label htmlFor="note">หมายเหตุ</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          placeholder="เช่น โอนก่อนกำหนด, ชำระบางส่วน..."
        />
      </div>

      {/* ── Result ── */}
      {result && (
        <div
          className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
            result.success
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {result.success
            ? <CheckCircle className="size-4 shrink-0" />
            : <AlertCircle className="size-4 shrink-0" />}
          {result.message}
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending || verifyStatus === 'verifying'}
        className="w-full"
      >
        {isPending ? (
          <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</>
        ) : (
          'บันทึกการชำระเงิน'
        )}
      </Button>
    </form>
  )
}
