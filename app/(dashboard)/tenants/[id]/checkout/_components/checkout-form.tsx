'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCheckout } from '@/app/actions/checkout'
import { sendCheckoutLineNotification, type CheckoutLineData } from '@/app/actions/line'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Trash2, LogOut,
  MessageCircle, Loader2, Check, AlertCircle,
  CheckCircle, Lock, Unlock,
} from 'lucide-react'

interface UnpaidBill {
  id:            string
  total_amount:  number
  billing_month: string
  status:        string
}

interface ExtraCharge {
  id:     string
  label:  string
  amount: string
}

interface Props {
  tenantId:     string
  tenantName:   string
  lineUserId:   string | null
  contractId:   string
  roomId:       string
  roomNumber:   string
  depositPaid:  number
  unpaidBills:  UnpaidBill[]
  totalUnpaid:  number
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)

export function CheckoutForm({
  tenantId, tenantName, lineUserId,
  contractId, roomId, roomNumber,
  depositPaid, unpaidBills, totalUnpaid,
}: Props) {
  const router = useRouter()
  const [saving, startSave] = useTransition()

  // ── Form state ────────────────────────────────────────────
  const [deposit,     setDeposit]       = useState(String(depositPaid))
  const [moveOutDate, setMoveOutDate]   = useState(today())
  const [cleaningFee, setCleaningFee]   = useState('')
  const [extras, setExtras]             = useState<ExtraCharge[]>([])
  const [note, setNote]                 = useState('')

  // ── LINE state ────────────────────────────────────────────
  const [lineNotified,  setLineNotified]  = useState(false)
  const [bypassed,      setBypassed]      = useState(false)
  const [linePending,   setLinePending]   = useState<'text' | 'flex' | null>(null)
  const [lineResult,    setLineResult]    = useState<{ success: boolean; message: string } | null>(null)

  // ── Save result ───────────────────────────────────────────
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  // ── Calculations ──────────────────────────────────────────
  const depositAmt    = parseFloat(deposit) || 0
  const cleaning      = parseFloat(cleaningFee) || 0
  const extraTotal    = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const totalDeduc    = totalUnpaid + cleaning + extraTotal
  const netAmount     = depositAmt - totalDeduc
  const isRefund      = netAmount >= 0

  // Can save only after LINE notified (or manually bypassed)
  const canSave = lineNotified || bypassed

  // ── Extra charge helpers ──────────────────────────────────
  function addExtra() {
    setExtras((p) => [...p, { id: Date.now().toString(), label: '', amount: '' }])
  }
  function removeExtra(id: string) {
    setExtras((p) => p.filter((e) => e.id !== id))
  }
  function updateExtra(id: string, field: 'label' | 'amount', value: string) {
    setExtras((p) => p.map((e) => (e.id === id ? { ...e, [field]: value } : e)))
  }

  // ── Build checkout data ───────────────────────────────────
  function buildData(): CheckoutLineData {
    return {
      tenantId,
      tenantName,
      roomNumber,
      depositPaid: depositAmt,
      outstandingBills: totalUnpaid,
      cleaningFee:      cleaning,
      extraCharges:     extras
        .map((e) => ({ label: e.label, amount: parseFloat(e.amount) || 0 }))
        .filter((e) => e.amount > 0),
      netAmount,
      moveOutDate,
    }
  }

  // ── Send LINE ─────────────────────────────────────────────
  async function sendLine(mode: 'text' | 'flex') {
    setLinePending(mode)
    setLineResult(null)
    const res = await sendCheckoutLineNotification(buildData(), mode)
    setLineResult(res)
    setLinePending(null)
    if (res.success) setLineNotified(true)
  }

  // ── Save checkout ─────────────────────────────────────────
  function handleSave() {
    if (!canSave) return
    setSaveResult(null)
    startSave(async () => {
      const res = await saveCheckout({ contractId, roomId, tenantId, moveOutDate, note })
      setSaveResult(res)
      if (res.success) {
        setTimeout(() => router.push('/tenants'), 2000)
      }
    })
  }

  const billMonth = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">

      {/* ── ยอดสรุป (real-time) ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ยอดสรุปการย้ายออก</p>
        </div>
        <div className="px-5 py-4 space-y-2.5 text-sm">

          {/* Deposit */}
          <div className="flex justify-between">
            <span className="text-slate-600">เงินมัดจำ</span>
            <span className="font-semibold text-emerald-600">+฿{fmt(depositAmt)}</span>
          </div>

          {/* Outstanding bills */}
          {totalUnpaid > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">
                ค่าเช่าค้างชำระ
                <span className="text-xs text-slate-400 ml-1">({unpaidBills.length} รายการ)</span>
              </span>
              <span className="font-semibold text-rose-600">−฿{fmt(totalUnpaid)}</span>
            </div>
          )}

          {/* Cleaning */}
          {cleaning > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">ค่าทำความสะอาด</span>
              <span className="font-semibold text-rose-600">−฿{fmt(cleaning)}</span>
            </div>
          )}

          {/* Extras */}
          {extras.filter((e) => parseFloat(e.amount) > 0).map((e) => (
            <div key={e.id} className="flex justify-between">
              <span className="text-slate-600">{e.label || 'รายการอื่นๆ'}</span>
              <span className="font-semibold text-rose-600">−฿{fmt(parseFloat(e.amount))}</span>
            </div>
          ))}

          {/* Divider + Net */}
          <div className="border-t border-slate-100 pt-3 mt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-950">
                {isRefund ? 'คืนเงินให้ผู้เช่า' : 'ผู้เช่าต้องชำระเพิ่ม'}
              </span>
              <span className={`text-2xl font-bold tracking-tight ${isRefund ? 'text-emerald-600' : 'text-rose-600'}`}>
                ฿{fmt(Math.abs(netAmount))}
              </span>
            </div>
            <div className={`mt-2 text-xs px-3 py-2 rounded-xl font-medium ${
              isRefund
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {isRefund
                ? `✅ เจ้าของห้องคืนเงินให้ผู้เช่า ฿${fmt(netAmount)}`
                : `⚠️ ผู้เช่าต้องชำระเพิ่มอีก ฿${fmt(Math.abs(netAmount))}`}
            </div>
          </div>
        </div>
      </div>

      {/* ── รายการหักเงิน ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">รายการหักจากมัดจำ</p>

        {/* Deposit (editable) */}
        <div className="space-y-1.5">
          <Label htmlFor="deposit_amt">เงินมัดจำ (บาท)</Label>
          <Input
            id="deposit_amt"
            type="number"
            min="0"
            step="1"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            className="border-emerald-200 bg-emerald-50/30 font-semibold"
          />
          <p className="text-xs text-slate-400">
            ดึงจากสัญญา — แก้ไขได้ถ้าตัวเลขไม่ถูกต้อง
          </p>
        </div>

        {/* Unpaid bills list */}
        {unpaidBills.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">บิลค้างชำระ</p>
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl overflow-hidden">
              {unpaidBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2.5 text-sm bg-rose-50/30">
                  <span className="text-slate-600">{billMonth(b.billing_month)}</span>
                  <span className="font-semibold text-rose-700">฿{fmt(b.total_amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cleaning fee */}
        <div className="space-y-1.5">
          <Label htmlFor="cleaning">ค่าทำความสะอาด (บาท)</Label>
          <Input
            id="cleaning"
            type="number"
            min="0"
            step="1"
            value={cleaningFee}
            onChange={(e) => setCleaningFee(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* Extra charges */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">รายการอื่นๆ</p>
          {extras.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <Input
                placeholder="รายละเอียด เช่น ค่าซ่อมประตู"
                value={e.label}
                onChange={(ev) => updateExtra(e.id, 'label', ev.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="บาท"
                value={e.amount}
                onChange={(ev) => updateExtra(e.id, 'amount', ev.target.value)}
                className="w-28"
              />
              <button
                type="button"
                onClick={() => removeExtra(e.id)}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addExtra}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 transition-colors w-full justify-center"
          >
            <Plus className="size-3.5" /> เพิ่มรายการหัก
          </button>
        </div>
      </div>

      {/* ── วันย้ายออก + หมายเหตุ ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ข้อมูลการย้ายออก</p>
        <div className="space-y-1.5">
          <Label htmlFor="move_out_date">วันที่ย้ายออก</Label>
          <Input
            id="move_out_date"
            type="date"
            value={moveOutDate}
            onChange={(e) => setMoveOutDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">หมายเหตุ</Label>
          <Textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น คืนกุญแจแล้ว, ห้องสะอาด..."
          />
        </div>
      </div>

      {/* ── แจ้งผู้เช่าผ่าน LINE ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <MessageCircle className="size-3.5 text-green-500" /> แจ้งผู้เช่าผ่าน LINE
          </p>
          {lineNotified && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <Check className="size-3.5" /> แจ้งแล้ว
            </span>
          )}
        </div>

        {!lineUserId ? (
          /* No LINE user ID — offer bypass */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
              <MessageCircle className="size-3.5" />
              ผู้เช่าไม่มี LINE User ID
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassed}
                onChange={(e) => setBypassed(e.target.checked)}
                className="size-4 accent-slate-800 rounded"
              />
              <span className="text-sm text-slate-600">
                ยืนยันว่าแจ้งผู้เช่าทางอื่นแล้ว (โทรศัพท์, SMS, อื่นๆ)
              </span>
            </label>
          </div>
        ) : (
          /* Has LINE — show notify buttons */
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              ต้องส่งแจ้งผู้เช่าก่อนจึงจะสามารถบันทึกย้ายออกได้
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => sendLine('text')}
                disabled={!!linePending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50"
              >
                {linePending === 'text'
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <MessageCircle className="size-3.5 text-green-500" />}
                ข้อความ
              </button>

              <button
                type="button"
                onClick={() => sendLine('flex')}
                disabled={!!linePending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50 shadow-sm shadow-green-500/20"
              >
                {linePending === 'flex'
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <MessageCircle className="size-3.5" />}
                Flex Message
              </button>
            </div>

            {lineResult && (
              <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg ${
                lineResult.success
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-rose-50 text-rose-600 border border-rose-100'
              }`}>
                {lineResult.success
                  ? <Check className="size-3.5 shrink-0" />
                  : <AlertCircle className="size-3.5 shrink-0" />}
                {lineResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── บันทึกย้ายออก ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">

        {/* Lock indicator */}
        {!canSave && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <Lock className="size-3.5 shrink-0" />
            {lineUserId
              ? 'ต้องส่งแจ้งผู้เช่าผ่าน LINE ก่อนจึงจะบันทึกได้'
              : 'กรุณายืนยันว่าแจ้งผู้เช่าทางอื่นแล้ว'}
          </div>
        )}
        {canSave && !saveResult && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
            <Unlock className="size-3.5 shrink-0" />
            พร้อมบันทึกการย้ายออก
          </div>
        )}

        {/* Save result */}
        {saveResult && (
          <div className={`flex items-center gap-2 text-sm px-3 py-3 rounded-xl ${
            saveResult.success
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-700 border border-rose-100'
          }`}>
            {saveResult.success
              ? <CheckCircle className="size-4 shrink-0" />
              : <AlertCircle className="size-4 shrink-0" />}
            <div>
              <p className="font-semibold">{saveResult.message}</p>
              {saveResult.success && (
                <p className="text-xs mt-0.5 opacity-70">กำลังกลับไปหน้ารายชื่อผู้เช่า...</p>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving || saveResult?.success}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            canSave && !saveResult?.success
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/25'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <><Loader2 className="size-4 animate-spin" /> กำลังบันทึก...</>
          ) : (
            <><LogOut className="size-4" /> บันทึกการย้ายออก</>
          )}
        </button>
      </div>

    </div>
  )
}

