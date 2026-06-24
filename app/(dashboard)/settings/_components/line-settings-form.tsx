'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type SettingsFormState, type Settings } from '@/lib/definitions'
import { type LineIntegrationPublic } from '@/lib/line-integration'
import { Loader2, MessageCircle, Globe, UserCheck, Download, FileText, Bell, Send } from 'lucide-react'

interface NotifyToggles {
  notify_slip_enabled?: boolean | null
  notify_repair_enabled?: boolean | null
  notify_registration_enabled?: boolean | null
  notify_contract_enabled?: boolean | null
  notify_lead_enabled?: boolean | null
  notify_daily_summary_enabled?: boolean | null
  notify_reminder_summary_enabled?: boolean | null
  notify_expiring_contract_enabled?: boolean | null
}

interface Props {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  settings?: Settings
  lineIntegration?: LineIntegrationPublic
  telegramBotTokenLast4?: string | null
  telegramChatId?: string | null
  ownerNotifyChannel?: string | null
  notifyToggles?: NotifyToggles | null
}

function Section({ title, icon, badge, children }: {
  title: string
  icon: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        {icon}
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {badge && <span className="ml-auto">{badge}</span>}
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

export function LineSettingsForm({ action, settings, lineIntegration, telegramBotTokenLast4, telegramChatId, ownerNotifyChannel, notifyToggles }: Props) {
  const [state, formAction, isPending] = useActionState(action, undefined)
  const [notifyChannel, setNotifyChannel] = useState(ownerNotifyChannel ?? 'telegram')
  const lineConnected = Boolean(lineIntegration?.token_last4)

  return (
    <form action={formAction} className="space-y-5">

      {/* ── LINE Messaging API ── */}
      <Section
        title="LINE Messaging API"
        icon={<MessageCircle className="size-4 text-green-500" />}
        badge={
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            lineConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {lineConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="Channel Access Token" hint="ไม่แสดง token เดิมกลับมาที่ browser เพื่อความปลอดภัย">
            <Input id="line_channel_access_token" name="line_channel_access_token" type="password"
              placeholder={lineIntegration?.token_last4
                ? `ตั้งค่าแล้ว ••••${lineIntegration.token_last4} (กรอกใหม่เมื่อต้องการเปลี่ยน)`
                : 'วาง Channel Access Token จาก LINE Developers'}
              className="font-mono text-xs" />
          </Field>
          <Field label="Channel Secret" hint="ใช้สำหรับ verify webhook จาก LINE">
            <Input id="line_channel_secret" name="line_channel_secret" type="password"
              placeholder={lineIntegration?.channel_secret_last4
                ? `ตั้งค่าแล้ว ••••${lineIntegration.channel_secret_last4} (กรอกใหม่เมื่อต้องการเปลี่ยน)`
                : 'วาง Channel Secret'}
              className="font-mono text-xs" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="LINE OA Basic ID" hint="เช่น @040hunni">
            <Input id="line_oa_basic_id" name="line_oa_basic_id"
              defaultValue={lineIntegration?.line_oa_basic_id ?? ''}
              placeholder="@yourlineoa" className="font-mono text-xs" />
          </Field>
          <Field label="LIFF ID (พอร์ทัลบิล)" hint="LIFF ที่ตั้ง Endpoint = /portal">
            <Input id="line_liff_id" name="line_liff_id"
              defaultValue={lineIntegration?.line_liff_id ?? ''}
              placeholder="1234567890-xxxxxxxx" className="font-mono text-xs" />
          </Field>
          <Field label="LIFF ID (จับคู่ห้อง)" hint="LIFF ที่ตั้ง Endpoint = /portal/pair">
            <Input id="line_liff_id_pairing" name="line_liff_id_pairing"
              defaultValue={lineIntegration?.line_liff_id_pairing ?? ''}
              placeholder="1234567890-xxxxxxxx" className="font-mono text-xs" />
          </Field>
          <Field label="URL ของเว็บ" hint="ใช้สร้างลิงก์บิล">
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <Input id="app_url" name="app_url"
                defaultValue={lineIntegration?.app_url ?? ''}
                placeholder="https://rental-v2.joteboony.workers.dev"
                className="pl-9" />
            </div>
          </Field>
          <Field label="Owner LINE User ID" hint="รับแจ้งเตือนสลิปและการจับคู่">
            <Input id="owner_line_user_id" name="owner_line_user_id"
              defaultValue={lineIntegration?.owner_line_user_id ?? ''}
              placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono text-xs" />
          </Field>
        </div>
      </Section>

      {/* ── ข้อมูลผู้ให้เช่า ── */}
      <Section title="ข้อมูลผู้ให้เช่า (สำหรับสัญญาเช่า)" icon={<UserCheck className="size-4 text-indigo-500" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ชื่อ-นามสกุลผู้ให้เช่า" hint="แสดงในสัญญาเช่า">
            <Input id="owner_name" name="owner_name"
              defaultValue={settings?.owner_name ?? ''}
              placeholder="เช่น นายบุญรัตน์ อาส" />
          </Field>
          <Field label="เลขบัตรประชาชนผู้ให้เช่า">
            <Input id="owner_id_card" name="owner_id_card"
              defaultValue={settings?.owner_id_card ?? ''}
              placeholder="1-xxxx-xxxxx-xx-x" className="font-mono" />
          </Field>
        </div>
        <Field label="ที่อยู่ผู้ให้เช่า / ที่ตั้งหอพัก" hint="แสดงในสัญญาเช่า">
          <Input id="owner_address" name="owner_address"
            defaultValue={settings?.owner_address ?? ''}
            placeholder="เช่น 58/10 ม.9 ถ.บางนโยม อ.พานทอง จ.ชลบุรี" />
        </Field>
      </Section>

      {/* ── Telegram แจ้งเตือนเจ้าของหอ ── */}
      <Section title="Telegram แจ้งเตือนเจ้าของหอ" icon={<Send className="size-4 text-blue-500" />}>
        <div className="grid grid-cols-1 gap-4">
          <Field
            label="Bot Token"
            hint={telegramBotTokenLast4 ? `ตั้งค่าแล้ว (••••${telegramBotTokenLast4}) — กรอกใหม่เพื่อเปลี่ยน` : 'Bot Token จาก @BotFather • Chat ID จาก @userinfobot หรือ getUpdates'}
          >
            <Input
              id="telegram_bot_token"
              name="telegram_bot_token"
              type="password"
              placeholder="1234567890:ABCdef..."
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Chat ID">
            <Input
              id="telegram_chat_id"
              name="telegram_chat_id"
              defaultValue={telegramChatId ?? ''}
              placeholder="-100xxxxxxxxxx หรือ @username"
              className="font-mono text-xs"
            />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          Bot Token จาก @BotFather • Chat ID จาก @userinfobot หรือ getUpdates
        </p>
      </Section>

      {/* ── แจ้งเตือน ── */}
      <Section title="การแจ้งเตือนเจ้าของหอ" icon={<Bell className="size-4 text-rose-500" />}>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ช่องทางแจ้งเตือนเจ้าของหอ</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'telegram', label: 'Telegram', desc: 'เฉพาะ Telegram' },
              { value: 'line',     label: 'LINE',     desc: 'เฉพาะ LINE OA' },
              { value: 'both',     label: 'ทั้งสองช่องทาง', desc: 'LINE + Telegram' },
            ].map(({ value, label, desc }) => (
              <label key={value} className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                notifyChannel === value
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/20 dark:border-rose-400'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-400'
              }`}>
                <input
                  type="radio"
                  name="owner_notify_channel"
                  value={value}
                  checked={notifyChannel === value}
                  onChange={() => setNotifyChannel(value)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 text-center">{desc}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <input
            type="checkbox"
            id="login_notify_enabled"
            name="login_notify_enabled"
            defaultChecked={lineIntegration?.login_notify_enabled !== false}
            className="size-4 accent-rose-600 rounded"
          />
          <label htmlFor="login_notify_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer flex-1">
            แจ้งเตือนเมื่อมีการ login เข้าระบบ
          </label>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <input
            type="checkbox"
            id="bill_reminder_notify_enabled"
            name="bill_reminder_notify_enabled"
            defaultChecked={lineIntegration?.bill_reminder_notify_enabled !== false}
            className="size-4 accent-rose-600 rounded"
          />
          <label htmlFor="bill_reminder_notify_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer flex-1">
            แจ้งเตือนสรุปบิลค้างชำระให้เจ้าของหอ ตอน 9 โมงเช้า
          </label>
        </div>
        <div className="pt-1">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">แจ้งเตือนแต่ละประเภท</p>
          <div className="space-y-2">
            {[
              { name: 'notify_slip_enabled',              label: 'สลิปและการชำระเงิน',           key: 'notify_slip_enabled' },
              { name: 'notify_repair_enabled',            label: 'แจ้งซ่อมใหม่จากผู้เช่า',        key: 'notify_repair_enabled' },
              { name: 'notify_registration_enabled',      label: 'ลงทะเบียนผู้เช่าใหม่',           key: 'notify_registration_enabled' },
              { name: 'notify_contract_enabled',          label: 'ผู้เช่าลงนามสัญญา',             key: 'notify_contract_enabled' },
              { name: 'notify_lead_enabled',              label: 'มีคนสนใจเช่าห้อง (Lead)',        key: 'notify_lead_enabled' },
              { name: 'notify_daily_summary_enabled',     label: 'สรุปประจำวัน (daily summary)',   key: 'notify_daily_summary_enabled' },
              { name: 'notify_reminder_summary_enabled',  label: 'สรุปการส่งแจ้งเตือนบิล',        key: 'notify_reminder_summary_enabled' },
              { name: 'notify_expiring_contract_enabled', label: 'สัญญาใกล้หมดอายุ (30 วัน)',     key: 'notify_expiring_contract_enabled' },
            ].map(({ name, label, key }) => (
              <div key={name} className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <input
                  type="checkbox"
                  id={name}
                  name={name}
                  defaultChecked={notifyToggles?.[key as keyof NotifyToggles] !== false}
                  className="size-4 accent-rose-600 rounded"
                />
                <label htmlFor={name} className="text-sm text-slate-700 dark:text-slate-200 cursor-pointer flex-1">{label}</label>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400">
          แจ้งเตือน LINE ต้องตั้งค่า Owner LINE User ID · แจ้งเตือน Telegram ต้องตั้งค่า Bot Token และ Chat ID
        </p>
      </Section>

      {/* ── เอกสาร ── */}
      <Section title="เอกสารแบบฟอร์ม" icon={<FileText className="size-4 text-slate-500" />}>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-rose-100">
              <FileText className="size-4 text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">สัญญาเช่าห้องพัก</p>
              <p className="text-xs text-slate-400">Rental_Agreement_V3.pdf</p>
            </div>
          </div>
          <a
            href="/docs/rental-agreement.pdf"
            download="สัญญาเช่าห้องพัก.pdf"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition-colors"
          >
            <Download className="size-3.5" />
            ดาวน์โหลด
          </a>
        </div>
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
