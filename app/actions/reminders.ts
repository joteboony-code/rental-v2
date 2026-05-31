'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseReminderDays } from '@/lib/reminder-utils'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function thaiDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

const SEP = '━━━━━━━━━━━━━━'

async function pushMessage(to: string, token: string, messages: object[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${await res.text()}`)
}

function buildPortalFlex(portalUrl: string) {
  return {
    type: 'flex',
    altText: 'ดูบิล / ชำระเงิน',
    contents: {
      type: 'bubble',
      size: 'micro',
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: '🔗 ดูบิล / ชำระเงิน', uri: portalUrl },
          style: 'primary', color: '#0C1B4D', height: 'sm',
        }],
      },
    },
  }
}

// ── Snooze a bill ────────────────────────────────────────────
export async function snoozeBill(
  billId: string,
  snoozeUntil: string,
  snoozeNote: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bills')
    .update({ snooze_until: snoozeUntil, snooze_note: snoozeNote || null })
    .eq('id', billId)

  if (error) return { success: false, message: error.message }
  revalidatePath('/bills')
  return { success: true, message: 'งดแจ้งเตือนแล้ว' }
}

export async function clearSnooze(
  billId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bills')
    .update({ snooze_until: null, snooze_note: null })
    .eq('id', billId)

  if (error) return { success: false, message: error.message }
  revalidatePath('/bills')
  return { success: true, message: 'เปิดการแจ้งเตือนแล้ว' }
}

// ── Core reminder sender (used by both manual & cron) ────────
export async function sendOverdueReminders(
  billingMonth: string,
  _mode: 'text' | 'flex' = 'text'
): Promise<{
  success: boolean
  sent: number
  snoozed: number
  noLine: number
  failed: number
  message: string
  ownerSummary?: string
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const todayThai = thaiDate(today)

  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note,
      snooze_until, snooze_note,
      rooms   ( room_number ),
      tenants ( full_name, line_user_id ),
      meter_readings ( water_units, electricity_units, water_unit_price, electricity_unit_price )
    `)
    .eq('billing_month', billingMonth)
    .in('status', ['pending', 'overdue'])

  if (!bills || bills.length === 0) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, failed: 0, message: 'ไม่มีบิลที่รอชำระ' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, failed: 0, message: 'ยังไม่ได้ตั้งค่า LINE' }
  }

  const { data: settings } = await supabase
    .from('settings')
    .select('bank_accounts_text, water_unit_price, electricity_unit_price')
    .eq('id', 1)
    .maybeSingle()

  const bankText = settings?.bank_accounts_text ?? ''
  const monthLabel = thaiMonth(billingMonth)

  let sent = 0, snoozed = 0, noLine = 0, failed = 0
  const sentRooms: string[] = []

  for (const bill of bills) {
    type TJ = { full_name: string; line_user_id: string | null }
    type RJ = { room_number: string }
    type MJ = { water_units: number | null; electricity_units: number | null; water_unit_price: number | null; electricity_unit_price: number | null }

    const tenant = bill.tenants as unknown as TJ | null
    const room = bill.rooms as unknown as RJ | null
    const meter = bill.meter_readings as unknown as MJ | null
    const lineUserId = tenant?.line_user_id

    if (!lineUserId) { noLine++; continue }

    const snoozeUntil = bill.snooze_until as string | null
    if (snoozeUntil && snoozeUntil >= today) { snoozed++; continue }

    const roomNumber = room?.room_number ?? '—'
    const tenantName = tenant?.full_name ?? '—'

    // Calculate old balance (sum of older unpaid bills for same tenant)
    const { data: olderBills } = await supabase
      .from('bills')
      .select('id, total_amount')
      .eq('tenant_id', (bill as { tenant_id?: string }).tenant_id ?? '')
      .in('status', ['pending', 'overdue'])
      .lt('billing_month', billingMonth)

    const oldBalance = (olderBills ?? []).reduce((sum, b) => sum + Number(b.total_amount), 0)
    const remaining = Number(bill.total_amount)
    const portalUrl = buildBillPortalUrl(bill.id, lineConfig.liffId, lineConfig.appUrl)

    // Build message lines
    const elecAmt = Number(bill.electricity_amount)
    const waterAmt = Number(bill.water_amount)
    const rentAmt = Number(bill.rent_amount)
    const wifiAmt = Number(bill.wifi_amount)
    const trashAmt = Number(bill.trash_amount)
    const otherAmt = Number(bill.other_amount)

    const lines: string[] = [
      `🔔 แจ้งเตือนค่าเช่า`,
      SEP,
      `🏠 ห้อง ${roomNumber}  ·  ${tenantName}`,
      `📅 รอบบิล ${monthLabel}`,
      SEP,
    ]

    if (oldBalance > 0) lines.push(`📌 ยอดค้างเก่า: ${fmt(oldBalance)} บาท`)

    lines.push(`🏠 ค่าเช่า: ${fmt(rentAmt)} บาท`)

    {
      const units = meter?.electricity_units ?? null
      const rate = meter?.electricity_unit_price ?? settings?.electricity_unit_price ?? 8
      const unitsText = units != null ? `${units} หน่วย × ${fmt(rate)} = ` : ''
      lines.push(`⚡ ค่าไฟ: ${unitsText}${fmt(elecAmt)} บาท`)
    }
    {
      const units = meter?.water_units ?? null
      const rate = meter?.water_unit_price ?? settings?.water_unit_price ?? 18
      const unitsText = units != null ? `${units} หน่วย × ${fmt(rate)} = ` : ''
      lines.push(`💧 ค่าน้ำ: ${unitsText}${fmt(waterAmt)} บาท`)
    }
    if (wifiAmt > 0) lines.push(`📶 ค่า WiFi: ${fmt(wifiAmt)} บาท`)
    lines.push(`🗑️ ค่าขยะ: ${fmt(trashAmt)} บาท`)
    if (otherAmt > 0) {
      const note = (bill.other_note as string | null) ?? ''
      lines.push(`📦 ${note || 'อื่นๆ'}: ${fmt(otherAmt)} บาท`)
    }

    lines.push(SEP)
    lines.push(`💰 ยอดที่ต้องชำระ: ${fmt(remaining)} บาท`)
    lines.push(`🗓️ ครบกำหนด: ${thaiDate(bill.due_date as string)}`)
    lines.push(SEP)

    if (bankText) lines.push(`📲 ${bankText}`)
    lines.push('📎 ส่งสลิปผ่านแชทนี้ได้เลยครับ 🙏')

    try {
      await pushMessage(lineUserId, lineConfig.channelAccessToken, [
        { type: 'text', text: lines.join('\n') },
        buildPortalFlex(portalUrl),
      ])
      sent++
      sentRooms.push(`ห้อง ${roomNumber}: ${fmt(remaining)}฿`)
    } catch {
      failed++
    }
  }

  // Owner summary
  const totalRemaining = bills
    .filter((b) => {
      const t = b.tenants as unknown as { line_user_id: string | null } | null
      return t?.line_user_id
    })
    .reduce((sum, b) => sum + Number(b.total_amount), 0)

  const ownerLines = [
    `📋 สรุปแจ้งเตือนอัตโนมัติ`,
    `วันที่ ${todayThai} รอบบิล ${monthLabel}`,
    `✅ ส่งสำเร็จ: ${sent} ห้อง`,
    `❌ ส่งไม่สำเร็จ: ${failed} ห้อง`,
    `📅 งดแจ้งเตือน: ${snoozed} ห้อง`,
    `⚠️ ไม่มี User ID: ${noLine} ห้อง`,
    `💰 ยอดค้างที่แจ้งรวม: ${fmt(totalRemaining)}฿`,
  ]

  if (sentRooms.length > 0) {
    ownerLines.push(SEP)
    ownerLines.push(...sentRooms)
  }

  const ownerSummary = ownerLines.join('\n')

  if (lineConfig.ownerLineUserId && sent > 0) {
    try {
      await pushMessage(lineConfig.ownerLineUserId, lineConfig.channelAccessToken, [
        { type: 'text', text: ownerSummary },
      ])
    } catch { /* silent */ }
  }

  const parts = [`ส่งสำเร็จ ${sent} ห้อง`]
  if (failed > 0) parts.push(`ไม่สำเร็จ ${failed} ห้อง`)
  if (snoozed > 0) parts.push(`งดแจ้ง ${snoozed} ห้อง`)
  if (noLine > 0) parts.push(`ไม่มี LINE ${noLine} ห้อง`)

  return { success: true, sent, snoozed, noLine, failed, message: parts.join(' · '), ownerSummary }
}

// ── Update reminder settings ─────────────────────────────────
export async function updateReminderSettings(
  reminderDays: string,
  enabled: boolean
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const days = parseReminderDays(reminderDays)
  if (days.length === 0) return { success: false, message: 'กรุณาระบุวันที่แจ้งเตือนอย่างน้อย 1 วัน' }

  const { error } = await supabase
    .from('settings')
    .update({ reminder_days: days.join(','), reminder_enabled: enabled })
    .eq('id', 1)

  if (error) return { success: false, message: error.message }

  revalidatePath('/bills')
  revalidatePath('/settings')
  return { success: true, message: 'บันทึกการตั้งค่าแจ้งเตือนแล้ว' }
}
