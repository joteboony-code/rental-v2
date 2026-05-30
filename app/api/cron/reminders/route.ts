import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'
import { parseReminderDays } from '@/lib/reminder-utils'

// Verify cron secret to prevent unauthorized calls
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev mode
  return req.headers.get('x-cron-secret') === secret || req.nextUrl.searchParams.get('secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function thaiDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function pushMessage(to: string, token: string, messages: object[]) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
}

function buildPortalFlex(portalUrl: string) {
  return {
    type: 'flex',
    altText: 'ดูบิล / ชำระเงิน',
    contents: {
      type: 'bubble', size: 'micro',
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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()

  // Check settings
  const { data: settings } = await supabase
    .from('settings')
    .select('reminder_enabled, reminder_days, bank_accounts_text, water_unit_price, electricity_unit_price')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.reminder_enabled) {
    return NextResponse.json({ ok: true, skipped: 'reminders disabled' })
  }

  // Check if today is a reminder day
  const todayDay = new Date().getDate()
  const reminderDays = parseReminderDays(settings.reminder_days ?? '5,10,15,20,25')
  if (!reminderDays.includes(todayDay)) {
    return NextResponse.json({ ok: true, skipped: `not a reminder day (today=${todayDay}, days=${reminderDays.join(',')})` })
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return NextResponse.json({ ok: false, error: 'LINE not configured' })

  const today = new Date().toISOString().split('T')[0]
  const todayThai = thaiDate(today)

  // Get current billing month (first day of current month)
  const now = new Date()
  const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthLabel = thaiMonth(billingMonth)
  const bankText = settings.bank_accounts_text ?? ''

  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month,
      rent_amount, water_amount, electricity_amount, other_amount, other_note,
      snooze_until, tenant_id,
      rooms   ( room_number ),
      tenants ( full_name, line_user_id ),
      meter_readings ( water_units, electricity_units, water_unit_price, electricity_unit_price )
    `)
    .eq('billing_month', billingMonth)
    .in('status', ['pending', 'overdue'])

  if (!bills || bills.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'no pending bills' })
  }

  let sent = 0, failed = 0, snoozed = 0, noLine = 0
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
    const remaining = Number(bill.total_amount)
    const portalUrl = buildBillPortalUrl(bill.id, lineConfig.liffId, lineConfig.appUrl)

    // Old balance
    const { data: olderBills } = await supabase
      .from('bills')
      .select('total_amount')
      .eq('tenant_id', bill.tenant_id as string)
      .in('status', ['pending', 'overdue'])
      .lt('billing_month', billingMonth)

    const oldBalance = (olderBills ?? []).reduce((s, b) => s + Number(b.total_amount), 0)

    const lines: string[] = [
      `🔔 แจ้งเตือนค่าเช่า — ห้อง ${roomNumber}`,
      `👤 ${tenant?.full_name ?? '—'}`,
      `📅 รอบบิล ${monthLabel}`,
      `🗓️ วันที่แจ้ง ${todayThai}`,
      SEP,
    ]

    if (oldBalance > 0) lines.push(`📌 ยอดค้างเก่า: ${fmt(oldBalance)}฿`)

    const elecAmt = Number(bill.electricity_amount)
    const waterAmt = Number(bill.water_amount)
    const rentAmt = Number(bill.rent_amount)
    const otherAmt = Number(bill.other_amount)

    if (elecAmt > 0) {
      const units = meter?.electricity_units
      const rate = meter?.electricity_unit_price ?? settings.electricity_unit_price ?? 8
      lines.push(`⚡ ค่าไฟ: ${units != null ? `${units} หน่วย × ${fmt(rate)}฿ = ` : ''}${fmt(elecAmt)}฿`)
    }
    if (waterAmt > 0) {
      const units = meter?.water_units
      const rate = meter?.water_unit_price ?? settings.water_unit_price ?? 18
      lines.push(`💧 ค่าน้ำ: ${units != null ? `${units} หน่วย × ${fmt(rate)}฿ = ` : ''}${fmt(waterAmt)}฿`)
    }

    lines.push(`🏠 ค่าเช่า: ${fmt(rentAmt)}฿`)

    if (otherAmt > 0) {
      lines.push(`🗑️ ${(bill.other_note as string | null) || 'อื่นๆ'}: ${fmt(otherAmt)}฿`)
    }

    lines.push(SEP)
    lines.push(`💰 ยอดคงเหลือที่ต้องชำระ: ${fmt(remaining)}฿`)
    lines.push(SEP)
    if (bankText) lines.push(`📲 โอนเข้า ${bankText}`)

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

  // Summary to owner
  if (lineConfig.ownerLineUserId) {
    const totalAmt = bills.reduce((s, b) => s + Number(b.total_amount), 0)
    const ownerLines = [
      `📋 สรุปแจ้งเตือนอัตโนมัติ`,
      `วันที่ ${todayThai} รอบบิล ${monthLabel}`,
      `✅ ส่งสำเร็จ: ${sent} ห้อง`,
      `❌ ส่งไม่สำเร็จ: ${failed} ห้อง`,
      `📅 งดแจ้งเตือน: ${snoozed} ห้อง`,
      `⚠️ ไม่มี User ID: ${noLine} ห้อง`,
      `💰 ยอดค้างที่แจ้งรวม: ${fmt(totalAmt)}฿`,
    ]
    if (sentRooms.length > 0) { ownerLines.push(SEP); ownerLines.push(...sentRooms) }
    try {
      await pushMessage(lineConfig.ownerLineUserId, lineConfig.channelAccessToken, [
        { type: 'text', text: ownerLines.join('\n') },
      ])
    } catch { /* silent */ }
  }

  return NextResponse.json({ ok: true, sent, failed, snoozed, noLine })
}
