import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'
import { parseReminderDays } from '@/lib/reminder-utils'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
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
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LINE API ${res.status}: ${body}`)
  }
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

  const { data: settings } = await supabase
    .from('settings')
    .select('reminder_enabled, reminder_days, bank_accounts_text, water_unit_price, electricity_unit_price')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.reminder_enabled) {
    return NextResponse.json({ ok: true, skipped: 'reminders disabled' })
  }

  const todayDay = new Date().getDate()
  const reminderDays = parseReminderDays(settings.reminder_days ?? '5,10,15,20,25')
  if (!reminderDays.includes(todayDay)) {
    return NextResponse.json({ ok: true, skipped: `not a reminder day (today=${todayDay}, days=${reminderDays.join(',')})` })
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return NextResponse.json({ ok: false, error: 'LINE not configured' })

  const today = new Date().toISOString().split('T')[0]
  const todayThai = thaiDate(today)
  const bankText = settings.bank_accounts_text ?? ''

  // Get ALL pending/overdue bills across all months
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note,
      snooze_until, tenant_id, status,
      rooms   ( room_number ),
      tenants ( full_name, line_user_id ),
      meter_readings ( water_units, electricity_units ),
      payments ( amount )
    `)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: true })

  if (!bills || bills.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'no pending bills' })
  }

  // ข้ามบิลที่มีนัดจ่าย (promise) active และยังไม่ถึงกำหนด — ให้เกียรติคำสัญญา
  const { data: activePromises } = await supabase
    .from('payment_promises')
    .select('bill_id, promise_date')
    .eq('status', 'active')
    .gte('promise_date', today)
  const promisedBillIds = new Set(
    (activePromises ?? []).map((p) => p.bill_id as string | null).filter((id): id is string => Boolean(id))
  )
  const skipPromiseCount = bills.filter((b) => promisedBillIds.has(b.id as string)).length
  const remindableBills = bills.filter((b) => !promisedBillIds.has(b.id as string))
  if (remindableBills.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'all bills have active promises', skipped: skipPromiseCount })
  }

  // Group bills by tenant
  type TJ = { full_name: string; line_user_id: string | null }
  type RJ = { room_number: string }
  type MJ = { water_units: number | null; electricity_units: number | null }
  type PJ = { amount: number }

  const byTenant = new Map<string, typeof bills>()
  for (const bill of remindableBills) {
    const tid = bill.tenant_id as string
    if (!byTenant.has(tid)) byTenant.set(tid, [])
    byTenant.get(tid)!.push(bill)
  }

  let sent = 0, failed = 0, snoozed = 0, noLine = 0, totalReminded = 0
  const sentRooms: string[] = []

  for (const [, tenantBills] of byTenant) {
    const firstBill = tenantBills[0]
    const tenant = firstBill.tenants as unknown as TJ | null
    const room = firstBill.rooms as unknown as RJ | null
    const lineUserId = tenant?.line_user_id

    if (!lineUserId) { noLine++; continue }

    // Snooze + fully-paid guard: skip bills that are snoozed or have no remaining balance
    const activeBills = tenantBills.filter((b) => {
      const s = b.snooze_until as string | null
      if (s && s >= today) return false
      const paid = ((b.payments as unknown as PJ[] | null) ?? []).reduce((ps, p) => ps + Number(p.amount), 0)
      return Math.max(0, Number(b.total_amount) - paid) >= 1
    })
    if (activeBills.length === 0) { snoozed++; continue }

    const allRoomNumbers = [...new Set(
      tenantBills.map((b) => (b.rooms as unknown as RJ | null)?.room_number).filter((n): n is string => Boolean(n))
    )]
    const roomNumber = allRoomNumbers.join(', ') || '—'
    const tenantName = tenant?.full_name ?? '—'
    const totalOwed = activeBills.reduce((s, b) => {
      const paid = ((b.payments as unknown as PJ[] | null) ?? []).reduce((ps, p) => ps + Number(p.amount), 0)
      return s + Math.max(0, Number(b.total_amount) - paid)
    }, 0)
    const hasOverdue = activeBills.some((b) => b.status === 'overdue')

    // Use the latest bill's portal URL
    const latestBill = activeBills[activeBills.length - 1]
    const portalUrl = buildBillPortalUrl(latestBill.id, lineConfig.liffId, lineConfig.appUrl)

    const lines: string[] = [
      hasOverdue ? '🚨 แจ้งเตือนค่าเช่าค้างชำระ' : '🔔 แจ้งเตือนค่าเช่า',
      SEP,
      `🏠 ห้อง ${roomNumber}  ·  ${tenantName}`,
      SEP,
    ]

    for (const bill of activeBills) {
      const meter = bill.meter_readings as unknown as MJ | null
      const isOverdue = bill.status === 'overdue'
      const monthLabel = thaiMonth(bill.billing_month as string)
      const paidAmt = ((bill.payments as unknown as PJ[] | null) ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.max(0, Number(bill.total_amount) - paidAmt)

      lines.push(`${isOverdue ? '🔴' : '🟡'} ${monthLabel}${isOverdue ? ' (เกินกำหนด)' : ''}`)

      const rentAmt = Number(bill.rent_amount)
      const elecAmt = Number(bill.electricity_amount)
      const waterAmt = Number(bill.water_amount)
      const wifiAmt = Number(bill.wifi_amount)
      const trashAmt = Number(bill.trash_amount)
      const otherAmt = Number(bill.other_amount)

      lines.push(`   🏠 ค่าเช่า: ${fmt(rentAmt)} บาท`)

      {
        const units = meter?.electricity_units
        const rate = settings.electricity_unit_price ?? 8
        const unitsText = units != null ? `${units} หน่วย × ${fmt(rate)} = ` : ''
        lines.push(`   ⚡ ค่าไฟ: ${unitsText}${fmt(elecAmt)} บาท`)
      }
      {
        const units = meter?.water_units
        const rate = settings.water_unit_price ?? 18
        const unitsText = units != null ? `${units} หน่วย × ${fmt(rate)} = ` : ''
        lines.push(`   💧 ค่าน้ำ: ${unitsText}${fmt(waterAmt)} บาท`)
      }
      if (wifiAmt > 0) lines.push(`   📶 ค่า WiFi: ${fmt(wifiAmt)} บาท`)
      lines.push(`   🗑️ ค่าขยะ: ${fmt(trashAmt)} บาท`)
      if (otherAmt > 0) {
        lines.push(`   📦 ${(bill.other_note as string | null) || 'อื่นๆ'}: ${fmt(otherAmt)} บาท`)
      }
      if (paidAmt > 0) lines.push(`   ✅ ชำระแล้ว: ${fmt(paidAmt)} บาท`)
      lines.push(`   📌 ${paidAmt > 0 ? 'คงเหลือ' : 'รวม'}: ${fmt(remaining)} บาท`)
      lines.push(`   🗓️ ครบกำหนด: ${thaiDate(bill.due_date as string)}`)
    }

    lines.push(SEP)
    lines.push(`💰 ยอดที่ต้องชำระทั้งหมด: ${fmt(totalOwed)} บาท`)
    lines.push(SEP)

    if (bankText) lines.push(`📲 ${bankText}`)
    lines.push('📎 ส่งสลิปผ่านแชทนี้ได้เลยครับ 🙏')

    try {
      await pushMessage(lineUserId, lineConfig.channelAccessToken, [
        { type: 'text', text: lines.join('\n') },
        buildPortalFlex(portalUrl),
      ])
      sent++
      totalReminded += totalOwed
      sentRooms.push(`ห้อง ${roomNumber}: ${fmt(totalOwed)} บาท${hasOverdue ? ' 🔴' : ''}`)
    } catch {
      failed++
    }
  }

  // Summary to owner — ส่งเฉพาะเมื่อมีการแจ้งเตือนจริง (sent > 0)
  if (lineConfig.ownerLineUserId && sent > 0) {
    const totalAmt = totalReminded
    const overdueCount = [...byTenant.values()].filter((bs) => bs.some((b) => b.status === 'overdue')).length
    const ownerLines = [
      `📋 สรุปแจ้งเตือนอัตโนมัติ`,
      `🗓️ วันที่ ${todayThai}`,
      SEP,
      `✅ ส่งสำเร็จ: ${sent} ห้อง`,
      `🔴 มียอดค้าง: ${overdueCount} ห้อง`,
      `❌ ส่งไม่สำเร็จ: ${failed} ห้อง`,
      `😴 งดแจ้งเตือน: ${snoozed} ห้อง`,
      `⚠️ ไม่มี LINE: ${noLine} ห้อง`,
      `💰 ยอดค้างรวม: ${fmt(totalAmt)} บาท`,
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
