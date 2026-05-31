'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2, Droplets, Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateBill, type UpdateBillState } from '@/app/actions/bills'

type Props = {
  billId: string
  rentAmount: number
  waterPrev: number
  waterCurr: number
  electricityPrev: number
  electricityCurr: number
  wifiAmount: number
  trashAmount: number
  otherAmount: number
  otherNote: string | null
  waterRate: number
  electricityRate: number
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function EditBillForm(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<UpdateBillState, FormData>(updateBill, undefined)

  // controlled values สำหรับ preview ยอดรวม
  const [rent, setRent] = useState(String(props.rentAmount))
  const [wPrev, setWPrev] = useState(String(props.waterPrev))
  const [wCurr, setWCurr] = useState(String(props.waterCurr))
  const [ePrev, setEPrev] = useState(String(props.electricityPrev))
  const [eCurr, setECurr] = useState(String(props.electricityCurr))
  const [wifi, setWifi] = useState(String(props.wifiAmount))
  const [trash, setTrash] = useState(String(props.trashAmount))
  const [other, setOther] = useState(String(props.otherAmount))

  const n = (s: string) => Number(s) || 0
  const waterUnits = n(wCurr) - n(wPrev)
  const elecUnits = n(eCurr) - n(ePrev)
  const waterAmount = Math.max(0, waterUnits) * props.waterRate
  const elecAmount = Math.max(0, elecUnits) * props.electricityRate
  const total = n(rent) + waterAmount + elecAmount + n(wifi) + n(trash) + n(other)
  const meterError = waterUnits < 0 || elecUnits < 0

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50" />
        }
      >
        <Pencil className="size-3.5" /> แก้ไขบิล
      </DialogTrigger>

      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไขบิล</DialogTitle>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="bill_id" value={props.billId} />

          {/* ค่าเช่า */}
          <Field label="ค่าเช่า">
            <Input name="rent_amount" type="number" step="0.01" min="0" value={rent} onChange={(e) => setRent(e.target.value)} />
          </Field>

          {/* ค่าน้ำ */}
          <div className="rounded-xl border border-slate-100 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <Droplets className="size-3.5" /> ค่าน้ำ
              <span className="ml-auto font-normal text-slate-400">฿{props.waterRate}/หน่วย</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="เลขก่อนหน้า" small>
                <Input name="water_prev" type="number" step="0.01" min="0" value={wPrev} onChange={(e) => setWPrev(e.target.value)} />
              </Field>
              <Field label="เลขปัจจุบัน" small>
                <Input name="water_curr" type="number" step="0.01" min="0" value={wCurr} onChange={(e) => setWCurr(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              {Math.max(0, waterUnits)} หน่วย = <span className="font-semibold text-blue-700">฿{fmt(waterAmount)}</span>
            </p>
          </div>

          {/* ค่าไฟ */}
          <div className="rounded-xl border border-slate-100 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <Zap className="size-3.5" /> ค่าไฟ
              <span className="ml-auto font-normal text-slate-400">฿{props.electricityRate}/หน่วย</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="เลขก่อนหน้า" small>
                <Input name="electricity_prev" type="number" step="0.01" min="0" value={ePrev} onChange={(e) => setEPrev(e.target.value)} />
              </Field>
              <Field label="เลขปัจจุบัน" small>
                <Input name="electricity_curr" type="number" step="0.01" min="0" value={eCurr} onChange={(e) => setECurr(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              {Math.max(0, elecUnits)} หน่วย = <span className="font-semibold text-amber-700">฿{fmt(elecAmount)}</span>
            </p>
          </div>

          {/* wifi / ขยะ */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="ค่า WiFi">
              <Input name="wifi_amount" type="number" step="0.01" min="0" value={wifi} onChange={(e) => setWifi(e.target.value)} />
            </Field>
            <Field label="ค่าขยะ">
              <Input name="trash_amount" type="number" step="0.01" min="0" value={trash} onChange={(e) => setTrash(e.target.value)} />
            </Field>
          </div>

          {/* อื่นๆ */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="อื่นๆ (จำนวน)">
              <Input name="other_amount" type="number" step="0.01" min="0" value={other} onChange={(e) => setOther(e.target.value)} />
            </Field>
            <Field label="หมายเหตุ (อื่นๆ)">
              <Input name="other_note" type="text" defaultValue={props.otherNote ?? ''} placeholder="เช่น ค่าซ่อม" />
            </Field>
          </div>

          {/* ยอดรวม */}
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-white">
            <span className="text-sm font-semibold">ยอดรวมใหม่</span>
            <span className="text-xl font-bold tracking-tight">฿{fmt(total)}</span>
          </div>

          {meterError && (
            <Alert variant="destructive">
              <AlertDescription>เลขมิเตอร์ปัจจุบันน้อยกว่าเลขก่อนหน้า</AlertDescription>
            </Alert>
          )}
          {state?.message && !state.success && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-slate-400">
            ระบบจะปรับสถานะบิล (ชำระแล้ว/ค้างชำระ) ให้อัตโนมัติตามยอดที่ชำระไว้
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending || meterError} className="flex-1 gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              บันทึก
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, small, children }: { label: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className={small ? 'text-[11px] text-slate-400' : 'text-xs font-medium text-slate-600'}>{label}</Label>
      {children}
    </div>
  )
}
