'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type SettingsFormState, type Settings } from '@/lib/definitions'
import { type LineIntegrationPublic } from '@/lib/line-integration'
import { Loader2, Droplets, Zap, AlertCircle, Calendar, QrCode, MessageCircle, Globe, ShieldCheck, Bell } from 'lucide-react'

interface Props {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  settings?: Settings
  lineIntegration?: LineIntegrationPublic
}

export function SettingsForm({ action, settings, lineIntegration }: Props) {
  const [state, formAction, isPending] = useActionState(action, undefined)
  const lineConnected = Boolean(lineIntegration?.token_last4)

  return (
    <form action={formAction} className="space-y-6">
      {/* อัตราค่าน้ำ/ไฟ */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">อัตราค่าสาธารณูปโภค</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="water_unit_price" className="flex items-center gap-1.5">
              <Droplets className="size-3.5 text-blue-500" />
              ค่าน้ำ (บาท/หน่วย)
            </Label>
            <Input
              id="water_unit_price"
              name="water_unit_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings?.water_unit_price ?? 18}
            />
            {state?.errors?.water_unit_price && (
              <p className="text-xs text-red-500">{state.errors.water_unit_price[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="electricity_unit_price" className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" />
              ค่าไฟ (บาท/หน่วย)
            </Label>
            <Input
              id="electricity_unit_price"
              name="electricity_unit_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings?.electricity_unit_price ?? 8}
            />
            {state?.errors?.electricity_unit_price && (
              <p className="text-xs text-red-500">{state.errors.electricity_unit_price[0]}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="trash_fee" className="flex items-center gap-1.5">
              🗑️ ค่าขยะ (บาท/เดือน/ห้อง)
            </Label>
            <Input
              id="trash_fee"
              name="trash_fee"
              type="number"
              step="1"
              min="0"
              defaultValue={settings?.trash_fee ?? 50}
              className="max-w-xs"
            />
            <p className="text-xs text-gray-400">คิดทุกห้องทุกเดือน (default ฿50)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="late_fee_per_day" className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 text-red-400" />
              ค่าปรับชำระล่าช้า (บาท/วัน)
            </Label>
          <Input
            id="late_fee_per_day"
            name="late_fee_per_day"
            type="number"
            step="0.01"
            min="0"
            defaultValue={settings?.late_fee_per_day ?? 50}
            className="max-w-xs"
          />
          </div>
        </div>
      </div>

      {/* วันออกบิล */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">รอบการออกบิล</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="billing_day" className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-gray-500" />
              วันออกบิล (1–28)
            </Label>
            <Input
              id="billing_day"
              name="billing_day"
              type="number"
              min="1"
              max="28"
              defaultValue={settings?.billing_day ?? 1}
              className="max-w-xs"
            />
            <p className="text-xs text-gray-400">วันที่ออกบิลทุกเดือน</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="due_day" className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-red-400" />
              วันครบกำหนดชำระ (1–28)
            </Label>
            <Input
              id="due_day"
              name="due_day"
              type="number"
              min="1"
              max="28"
              defaultValue={settings?.due_day ?? 10}
              className="max-w-xs"
            />
            <p className="text-xs text-gray-400">วันสุดท้ายที่ต้องชำระ</p>
          </div>
        </div>
      </div>

      {/* ── PromptPay ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 flex items-center gap-1.5">
          <QrCode className="size-4 text-blue-500" /> PromptPay
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="promptpay_id">เบอร์ / บัตรประชาชน PromptPay</Label>
            <Input
              id="promptpay_id"
              name="promptpay_id"
              type="text"
              defaultValue={settings?.promptpay_id ?? ''}
              placeholder="เช่น 0812345678"
              className="font-mono"
            />
            <p className="text-xs text-gray-400">ใช้สำหรับสร้าง QR code ในบิล</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promptpay_name">ชื่อที่แสดงใต้ QR</Label>
            <Input
              id="promptpay_name"
              name="promptpay_name"
              defaultValue={settings?.promptpay_name ?? 'ห้องเช่า'}
              placeholder="ชื่อร้าน / ชื่อเจ้าของ"
            />
          </div>
        </div>
      </div>

      {/* ── LINE Messaging ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 flex items-center gap-1.5">
          <MessageCircle className="size-4 text-green-500" /> LINE Messaging API
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
            lineConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {lineConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
          </span>
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="line_channel_access_token">Channel Access Token</Label>
          <Input
            id="line_channel_access_token"
            name="line_channel_access_token"
            type="password"
            placeholder={
              lineIntegration?.token_last4
                ? `ตั้งค่าแล้ว ••••${lineIntegration.token_last4} (กรอกใหม่เมื่อต้องการเปลี่ยน)`
                : 'วาง Channel Access Token จาก LINE Developers'
            }
            className="font-mono text-xs"
          />
          <p className="text-xs text-gray-400">ไม่แสดง token เดิมกลับมาที่ browser เพื่อความปลอดภัย</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="line_channel_secret">Channel Secret</Label>
          <Input
            id="line_channel_secret"
            name="line_channel_secret"
            type="password"
            placeholder={
              lineIntegration?.channel_secret_last4
                ? `ตั้งค่าแล้ว ••••${lineIntegration.channel_secret_last4} (กรอกใหม่เมื่อต้องการเปลี่ยน)`
                : 'วาง Channel Secret สำหรับตรวจ x-line-signature'
            }
            className="font-mono text-xs"
          />
          <p className="text-xs text-gray-400">ใช้สำหรับ verify webhook จาก LINE ในอนาคต</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="line_oa_basic_id">LINE OA Basic ID</Label>
            <Input
              id="line_oa_basic_id"
              name="line_oa_basic_id"
              defaultValue={lineIntegration?.line_oa_basic_id ?? ''}
              placeholder="@yourlineoa"
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">เช่น @040hunni</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="line_liff_id">LIFF ID</Label>
            <Input
              id="line_liff_id"
              name="line_liff_id"
              defaultValue={lineIntegration?.line_liff_id ?? ''}
              placeholder="1234567890-xxxxxxxx"
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">LINE Developers → LIFF → LIFF ID</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app_url" className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-slate-400" /> URL ของเว็บ
            </Label>
            <Input
              id="app_url"
              name="app_url"
              defaultValue={lineIntegration?.app_url ?? ''}
              placeholder="https://your-app.vercel.app"
            />
            <p className="text-xs text-gray-400">URL ที่ deploy ไว้ (ใช้สร้างลิงก์บิล)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner_line_user_id">Owner LINE User ID</Label>
            <Input
              id="owner_line_user_id"
              name="owner_line_user_id"
              defaultValue={lineIntegration?.owner_line_user_id ?? ''}
              placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">LINE User ID ของเจ้าของหอสำหรับรับแจ้งจับคู่และสลิป</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-500 space-y-1.5">
          <p className="font-semibold text-slate-700">วิธีตั้งค่า LIFF</p>
          <p>1. สร้าง LIFF ใน LINE Developers Console → เลือก Messaging API channel</p>
          <p>2. LIFF endpoint URL = <code className="bg-slate-100 px-1 rounded">{`{URL ของเว็บ}`}/portal</code></p>
          <p>3. เปิด Scope: <code className="bg-slate-100 px-1 rounded">profile</code></p>
          <p>4. คัดลอก LIFF ID มาใส่ในช่องด้านบน</p>
        </div>
      </div>

      {/* ── Reminder schedule ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 flex items-center gap-1.5">
          <Bell className="size-4 text-rose-500" /> ระบบแจ้งเตือนค้างชำระ
        </h2>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="reminder_enabled"
            name="reminder_enabled"
            defaultChecked={settings?.reminder_enabled !== false}
            className="size-4 accent-rose-600 rounded"
          />
          <label htmlFor="reminder_enabled" className="text-sm text-gray-700 cursor-pointer">
            เปิดใช้ระบบแจ้งเตือนค้างชำระ
          </label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reminder_days" className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-rose-400" />
            วันที่ส่งแจ้งเตือนในแต่ละเดือน
          </Label>
          <Input
            id="reminder_days"
            name="reminder_days"
            type="text"
            defaultValue={settings?.reminder_days ?? '5,10'}
            placeholder="เช่น 5,10,15"
            className="max-w-xs font-mono"
          />
          <p className="text-xs text-gray-400">ใส่วันที่คั่นด้วยจุลภาค เช่น 5,10 หมายถึงวันที่ 5 และ 10 ของทุกเดือน</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="anomaly_threshold_pct" className="flex items-center gap-1.5">
            <AlertCircle className="size-3.5 text-rose-400" />
            เกณฑ์ผิดปกติ (% เพิ่มจากเดือนก่อน)
          </Label>
          <Input
            id="anomaly_threshold_pct"
            name="anomaly_threshold_pct"
            type="number"
            min="10"
            max="500"
            step="5"
            defaultValue={settings?.anomaly_threshold_pct ?? 50}
            className="max-w-xs"
          />
          <p className="text-xs text-gray-400">เช่น 50 = แจ้งเตือนเมื่อใช้เพิ่มมากกว่า 50% จากเดือนก่อน</p>
        </div>

        <div className="bg-rose-50 rounded-xl border border-rose-100 p-3 text-xs text-rose-700 space-y-1">
          <p className="font-semibold">วิธีใช้งาน</p>
          <p>• ตั้งวันที่ต้องการแจ้งเตือน → พอถึงวันนั้น ปุ่ม &quot;แจ้งเตือนค้างชำระ&quot; ในหน้าบิลจะกระพริบ</p>
          <p>• กดปุ่มส่งแจ้งเตือน → ระบบส่ง LINE ให้ทุกห้องที่ค้างชำระ (ยกเว้นห้องที่งดแจ้งเตือน)</p>
          <p>• งดแจ้งเตือนรายห้อง → กดปุ่ม &quot;งดแจ้งเตือน&quot; ในแถวบิล → เลือกวันที่จะจ่าย</p>
        </div>
      </div>

      {/* ── SlipOK ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-violet-500" /> SlipOK ตรวจสอบสลิปอัตโนมัติ
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="slipok_branch_id">Branch ID</Label>
            <Input
              id="slipok_branch_id"
              name="slipok_branch_id"
              defaultValue={settings?.slipok_branch_id ?? ''}
              placeholder="เช่น 12345"
              className="font-mono text-xs"
            />
            {state?.errors?.slipok_branch_id && (
              <p className="text-xs text-red-500">{state.errors.slipok_branch_id[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slipok_api_key">API Key</Label>
            <Input
              id="slipok_api_key"
              name="slipok_api_key"
              type="password"
              placeholder="กรอกเมื่อตั้งค่า/เปลี่ยน API Key"
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">ระบบไม่แสดง API Key เดิมกลับมาที่ browser</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          ใช้ค่า Branch ID และ API Key จาก{' '}
          <a href="https://slipok.com" target="_blank" rel="noreferrer" className="underline text-violet-500">
            slipok.com
          </a>{' '}
          เพื่อเรียก API ตรวจสลิปผ่าน header x-authorization
        </p>
      </div>

      {state?.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            กำลังบันทึก...
          </>
        ) : (
          'บันทึกการตั้งค่า'
        )}
      </Button>
    </form>
  )
}
