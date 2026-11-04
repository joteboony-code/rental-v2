'use client'

import { useActionState, useState } from 'react'
import { Loader2, QrCode, Banknote, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePaymentSettings } from '@/app/actions/settings'
import type { Settings } from '@/lib/definitions'

interface Props {
  settings?: Pick<Settings, 'promptpay_id' | 'promptpay_name' | 'bank_accounts_text'
    | 'bank_name' | 'bank_account_no' | 'bank_account_name'
    | 'bank_name_1' | 'bank_account_no_1' | 'bank_account_name_1'
    | 'bank_name_2' | 'bank_account_no_2' | 'bank_account_name_2'
    | 'bank_name_3' | 'bank_account_no_3' | 'bank_account_name_3'>
  mfaEnabled?: boolean
}

const ROW_KEYS = {
  '1': { name: 'bank_name_1', no: 'bank_account_no_1', accountName: 'bank_account_name_1' },
  '2': { name: 'bank_name_2', no: 'bank_account_no_2', accountName: 'bank_account_name_2' },
  '3': { name: 'bank_name_3', no: 'bank_account_no_3', accountName: 'bank_account_name_3' },
} as const

export function PaymentSettingsForm({ settings, mfaEnabled }: Props) {
  const [state, formAction, isPending] = useActionState(updatePaymentSettings, undefined)
  const [selectedRow, setSelectedRow] = useState('1')

  const rowKey = ROW_KEYS[selectedRow as keyof typeof ROW_KEYS] ?? ROW_KEYS['1']
  const s = settings ?? {}
  const bankName =    (s as Record<string, string | null | undefined>)[rowKey.name]    ?? ''
  const bankNo =      (s as Record<string, string | null | undefined>)[rowKey.no]      ?? ''
  const bankAccName = (s as Record<string, string | null | undefined>)[rowKey.accountName] ?? ''

  return (
    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-amber-100 bg-amber-50">
        <QrCode className="size-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-800">PromptPay และบัญชีธนาคาร</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 font-medium">
          <Lock className="size-3" />{mfaEnabled ? 'ยืนยันรหัสผ่าน + OTP' : 'ต้องยืนยันรหัสผ่าน'}
        </span>
      </div>
      <div className="px-5 py-5">
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                เบอร์ / บัตรประชาชน PromptPay
              </Label>
              <Input
                name="promptpay_id"
                type="text"
                defaultValue={settings?.promptpay_id ?? ''}
                placeholder="เช่น 0812345678"
                className="font-mono"
              />
              <p className="text-xs text-slate-400">ใช้สร้าง QR code ในบิล</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">ชื่อที่แสดงใต้ QR</Label>
              <Input
                name="promptpay_name"
                defaultValue={settings?.promptpay_name ?? 'ห้องเช่า'}
                placeholder="ชื่อร้าน / ชื่อเจ้าของ"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">เลขบัญชีต่อแถว สำหรับชำระใน Portal (แสดงเฉพาะบัญชีที่ตรงแถวห้องของผู้เช่า)</p>
              <p className="mt-1 text-xs text-slate-400">แถวที่ 1 = ห้อง 1–10 · แถวที่ 2 = ห้อง 11–20 · แถวที่ 3 = ห้อง 21–30</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">เลือกแถว</Label>
              <select
                name="selected_row"
                value={selectedRow}
                onChange={(e) => setSelectedRow(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              >
                <option value="1">แถวที่ 1 (ห้อง 1–10)</option>
                <option value="2">แถวที่ 2 (ห้อง 11–20)</option>
                <option value="3">แถวที่ 3 (ห้อง 21–30)</option>
              </select>
              <p className="text-xs text-slate-400">เลือกแถวที่ต้องการ แล้วกรอกบัญชีของแถวนั้น กดบันทึก</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">ชื่อธนาคาร</Label>
                  <Input
                    name="bank_name"
                    key={`bn-${selectedRow}`}
                    defaultValue={bankName}
                    placeholder="เช่น กสิกรไทย / กรุงศรี / TTB"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">เลขบัญชี</Label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-2.5 size-4 text-slate-400" />
                    <Input
                      name="bank_account_no"
                      key={`ba-${selectedRow}`}
                      defaultValue={bankNo}
                      placeholder="เช่น 9197253892"
                      className="pl-9 font-mono"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">ชื่อบัญชี</Label>
                <Input
                  name="bank_account_name"
                  key={`ban-${selectedRow}`}
                  defaultValue={bankAccName}
                  placeholder="เช่น นายไพศาล ใจดี"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">กรอกชื่อธนาคาร / เลขบัญชี / ชื่อบัญชี ของแถวที่เลือก แล้วกดบันทึก — ค่าจะถูกบันทึกลงช่องประจำแถวนั้น</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">เลขบัญชีธนาคาร</Label>
            <div className="relative">
              <Banknote className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <Input
                name="bank_accounts_text"
                defaultValue={settings?.bank_accounts_text ?? ''}
                placeholder="เช่น ttb 919-7-253892 / กรุงศรี 800-4-557541"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-slate-400">แสดงในข้อความแจ้งเตือนค้างชำระ</p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-1.5">
            <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <Lock className="size-3.5 text-slate-400" />
              ยืนยันรหัสผ่านก่อนบันทึก
            </Label>
            <Input
              type="password"
              name="current_password"
              placeholder="กรอกรหัสผ่านของคุณ"
              autoComplete="current-password"
              required
            />
          </div>

          {mfaEnabled && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-indigo-500" />
                รหัส OTP จากแอป Authenticator
              </Label>
              <Input
                type="text"
                name="otp_code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                className="text-center font-mono text-lg tracking-widest"
                required
              />
              <p className="text-xs text-slate-400">เปิดแอป Authenticator แล้วกรอกรหัส 6 หลักล่าสุด</p>
            </div>
          )}

          {state?.message && (
            <p className={`text-xs font-medium ${state.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full h-10">
            {isPending
              ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</>
              : 'บันทึกข้อมูลการชำระเงิน'}
          </Button>
        </form>
      </div>
    </div>
  )
}
