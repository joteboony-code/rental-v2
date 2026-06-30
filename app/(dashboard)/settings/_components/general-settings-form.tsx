'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type SettingsFormState, type Settings } from '@/lib/definitions'
import { Loader2, Droplets, Zap, Calendar, ShieldCheck, Bell, ScanLine } from 'lucide-react'

interface Props {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  settings?: Settings
  hasSlipokKey?: boolean
}

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        {icon}
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, error, children }: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function GeneralSettingsForm({ action, settings, hasSlipokKey }: Props) {
  const [state, formAction, isPending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-5">

      {/* ── ค่าสาธารณูปโภค ── */}
      <Section title="อัตราค่าสาธารณูปโภค" icon={<Zap className="size-4 text-amber-500" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ค่าน้ำ (บาท/หน่วย)" error={state?.errors?.water_unit_price?.[0]}>
            <div className="relative">
              <Droplets className="absolute left-3 top-2.5 size-4 text-blue-400" />
              <Input id="water_unit_price" name="water_unit_price" type="number" step="0.01" min="0"
                defaultValue={settings?.water_unit_price ?? 18} className="pl-9" />
            </div>
          </Field>
          <Field label="ค่าไฟ (บาท/หน่วย)" error={state?.errors?.electricity_unit_price?.[0]}>
            <div className="relative">
              <Zap className="absolute left-3 top-2.5 size-4 text-amber-400" />
              <Input id="electricity_unit_price" name="electricity_unit_price" type="number" step="0.01" min="0"
                defaultValue={settings?.electricity_unit_price ?? 8} className="pl-9" />
            </div>
          </Field>
          <Field label="ค่าขยะ (บาท/ห้อง/เดือน)" hint="คิดทุกห้องทุกเดือน">
            <Input id="trash_fee" name="trash_fee" type="number" step="1" min="0"
              defaultValue={settings?.trash_fee ?? 50} />
          </Field>
          <Field label="ค่าปรับชำระล่าช้า (บาท/วัน)">
            <Input id="late_fee_per_day" name="late_fee_per_day" type="number" step="0.01" min="0"
              defaultValue={settings?.late_fee_per_day ?? 50} />
          </Field>
        </div>
      </Section>

      {/* ── OCR มิเตอร์ ── */}
      <Section title="OCR อ่านเลขมิเตอร์" icon={<ScanLine className="size-4 text-cyan-600" />}>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <input
            type="checkbox"
            id="meter_ocr_enabled"
            name="meter_ocr_enabled"
            defaultChecked={settings?.meter_ocr_enabled !== false}
            className="size-4 accent-cyan-600 rounded"
          />
          <label htmlFor="meter_ocr_enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
            เปิดใช้ OCR อ่านเลขมิเตอร์จากรูปอัตโนมัติ
          </label>
        </div>
        <p className="text-xs text-slate-400">
          เมื่อปิด ยังถ่ายและแนบรูปมิเตอร์ได้ตามปกติ แต่ระบบจะไม่ส่งรูปไปอ่านค่าด้วย Google Vision
        </p>
      </Section>

      {/* ── รอบบิล ── */}
      <Section title="รอบการออกบิล" icon={<Calendar className="size-4 text-slate-500" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="วันออกบิล (1–28)" hint="วันที่ออกบิลทุกเดือน">
            <Input id="billing_day" name="billing_day" type="number" min="1" max="28"
              defaultValue={settings?.billing_day ?? 1} />
          </Field>
          <Field label="วันครบกำหนดชำระ (1–28)" hint="วันสุดท้ายที่ต้องชำระ">
            <Input id="due_day" name="due_day" type="number" min="1" max="28"
              defaultValue={settings?.due_day ?? 10} />
          </Field>
        </div>
      </Section>

      {/* ── แจ้งเตือน ── */}
      <Section title="ระบบแจ้งเตือนค้างชำระ" icon={<Bell className="size-4 text-rose-500" />}>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <input type="checkbox" id="reminder_enabled" name="reminder_enabled"
            defaultChecked={settings?.reminder_enabled !== false}
            className="size-4 accent-rose-600 rounded" />
          <label htmlFor="reminder_enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
            เปิดใช้ระบบแจ้งเตือนอัตโนมัติ
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="วันที่ส่งแจ้งเตือน" hint="ใส่วันที่คั่นด้วยจุลภาค เช่น 5,10,15,20,25">
            <Input id="reminder_days" name="reminder_days" type="text"
              defaultValue={settings?.reminder_days ?? '5,10,15,20,25'}
              placeholder="5,10,15,20,25" className="font-mono" />
          </Field>
          <Field label="เกณฑ์ผิดปกติ (% เพิ่มจากเดือนก่อน)" hint="เช่น 50 = แจ้งเตือนเมื่อใช้เพิ่มมากกว่า 50%">
            <Input id="anomaly_threshold_pct" name="anomaly_threshold_pct" type="number"
              min="10" max="500" step="5"
              defaultValue={settings?.anomaly_threshold_pct ?? 50} />
          </Field>
        </div>
      </Section>

      {/* ── SlipOK ── */}
      <Section title="SlipOK ตรวจสอบสลิปอัตโนมัติ" icon={<ShieldCheck className="size-4 text-violet-500" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Branch ID" error={state?.errors?.slipok_branch_id?.[0]}>
            <Input id="slipok_branch_id" name="slipok_branch_id"
              defaultValue={settings?.slipok_branch_id ?? ''}
              placeholder="เช่น 12345" className="font-mono text-xs" />
          </Field>
          <Field
            label="API Key"
            hint={hasSlipokKey
              ? '✅ ตั้งค่าไว้แล้ว — กรอกใหม่เฉพาะเมื่อต้องการเปลี่ยน'
              : 'ระบบไม่แสดง API Key เดิมกลับมาที่ browser'}
          >
            <Input id="slipok_api_key" name="slipok_api_key" type="password"
              placeholder={hasSlipokKey ? '•••••••• (ตั้งค่าแล้ว)' : 'กรอกเมื่อตั้งค่า/เปลี่ยน API Key'}
              className="font-mono text-xs" />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          ใช้ค่า Branch ID และ API Key จาก{' '}
          <a href="https://slipok.com" target="_blank" rel="noreferrer" className="underline text-violet-500">
            slipok.com
          </a>
        </p>
      </Section>

      {state?.message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          state.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full h-11">
        {isPending ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</> : 'บันทึกการตั้งค่า'}
      </Button>
    </form>
  )
}
