import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'
import { parseReminderDays } from '@/lib/reminder-utils'
import { notifyOwner } from '@/lib/notify-owner'
import { getEffectiveLineUserId } from '@/lib/line-recipient'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('x-cron-secret') === secret
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

function bangkokDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
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

function buildPortalFlex(portalUrl: string, details: string, isOverdue: boolean) {
  return {
    type: 'flex',
    altText: isOverdue ? 'แจ้งเตือนค่าเช่าค้างชำระ' : 'แจ้งเตือนค่าเช่า',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: isOverdue ? '#DC2626' : '#0F766E',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: isOverdue ? 'แจ้งเตือนค่าเช่าค้างชำระ' : 'แจ้งเตือนค่าเช่า',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: 'กรุณาตรวจสอบรายละเอียดและชำระเงินตามกำหนด',
            color: '#FFFFFFCC',
            size: 'xs',
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [{
          type: 'text',
          text: details,
          color: '#334155',
          size: 'sm',
          wrap: true,
          lineSpacing: '5px',
        }],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: 'ดูบิลและชำระเงิน', uri: portalUrl },
          style: 'primary', color: isOverdue ? '#DC2626' : '#0F766E', height: 'sm',
        }],
      },
    },
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()

  const [{ data: settings, error: settingsError }, { data: lineSettings, error: lineError }] = await Promise.all([
    supabase
      .from('settings')
      .select('reminder_enabled, reminder_days, bank_accounts_text, water_unit_price, electricity_unit_price')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('line_integrations')
      .select('bill_reminder_notify_enabled')
      .maybeSingle(),
  ])

  if (settingsError || lineError) return NextResponse.json({ ok: false, error: 'Reminder settings unavailable' }, { status: 500 })
  if (!settings?.reminder_enabled) {
    return NextResponse.json({ ok: true, skipped: 'reminders disabled' })
  }

  const todayDay = Number(bangkokDateKey().slice(-2))
  const reminderDays = parseReminderDays(settings.reminder_days ?? '5,10,15,20,25')
  if (!reminderDays.includes(todayDay)) {
    return NextResponse.json({ ok: true, skipped: `not a reminder day (today=${todayDay}, days=${reminderDays.join(',')})` })
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return NextResponse.json({ ok: false, error: 'LINE not configured' })

  const reminderKey = bangkokDateKey()
  const { data: sentLog, error: sentLogError } = await supabase
    .from('audit_logs')
    .select('id, new_value')
    .eq('action', 'cron_reminders_sent')
    .eq('entity_type', 'cron')
    .eq('entity_id', reminderKey)
    .limit(1)
    .maybeSingle()

  if (sentLogError) return NextResponse.json({ ok: false, error: 'Reminder status unavailable' }, { status: 500 })
  if (sentLog?.new_value?.completed === false || Number(sentLog?.new_value?.failed ?? 0) > 0 || sentLog?.new_value?.owner_failed) {
    return NextResponse.json({ ok: false, error: 'Previous reminder run incomplete; manual review required' }, { status: 502 })
  }
  if (sentLog) {
    return NextResponse.json({ ok: true, skipped: 'reminders already sent today', date: reminderKey })
  }

  const { error: lockError } = await supabase.from('audit_logs').insert({
    action: 'cron_reminders_sent',
    entity_type: 'cron',
    entity_id: reminderKey,
    description: `Automated reminders started for ${reminderKey}`,
    new_value: { completed: false },
  })

  if (lockError) {
    const code = (lockError as { code?: string }).code
    if (code === '23505') {
      return NextResponse.json({ ok: true, skipped: 'reminders already sent today', date: reminderKey })
    }
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 })
  }

  const today = bangkokDateKey()
  const todayThai = thaiDate(today)
  const bankText = settings.bank_accounts_text ?? ''

  // Get ALL pending/overdue bills across all months
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note,
      snooze_until, tenant_id, status,
      rooms   ( room_number ),
      tenants ( full_name, line_user_id ),
      contracts ( line_recipient_user_id ),
      meter_readings ( water_units, electricity_units ),
      payments ( amount )
    `)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: true })
    .limit(2000)

  if (billsError) return NextResponse.json({ ok: false, error: 'Reminder bills unavailable' }, { status: 500 })
  if (!bills || bills.length === 0) {
    await supabase.from('audit_logs').update({ new_value: { completed: true, sent: 0 } }).eq('action', 'cron_reminders_sent').eq('entity_id', reminderKey)
    return NextResponse.json({ ok: true, sent: 0, message: 'no pending bills' })
  }

  // ข้ามบิลที่มีนัดจ่าย (promise) active และยังไม่ถึงกำหนด — ให้เกียรติคำสัญญา
  const { data: activePromises, error: promisesError } = await supabase
    .from('payment_promises')
    .select('bill_id, promise_date')
    .eq('status', 'active')
    .gte('promise_date', today)
    .limit(500)
  if (promisesError) return NextResponse.json({ ok: false, error: 'Payment promises unavailable' }, { status: 500 })
  const promisedBillIds = new Set(
    (activePromises ?? []).map((p) => p.bill_id as string | null).filter((id): id is string => Boolean(id))
  )
  const skipPromiseCount = bills.filter((b) => promisedBillIds.has(b.id as string)).length
  const remindableBills = bills.filter((b) => !promisedBillIds.has(b.id as string))
  if (remindableBills.length === 0) {
    await supabase.from('audit_logs').update({ new_value: { completed: true, sent: 0 } }).eq('action', 'cron_reminders_sent').eq('entity_id', reminderKey)
    return NextResponse.json({ ok: true, sent: 0, message: 'all bills have active promises', skipped: skipPromiseCount })
  }

  let ownerFailed = false
  // Group bills by tenant
  type TJ = { full_name: string; line_user_id: string | null }
  type CJ = { line_recipient_user_id: string | null }
  type RJ = { room_number: string }
  type MJ = { water_units: number | null; electricity_units: number | null }
  type PJ = { amount: number }

  const byTenant = new Map<string, typeof bills>()
  for (const bill of remindableBills) {
    const tenant = bill.tenants as unknown as TJ | null
    const contract = bill.contracts as unknown as CJ | null
    const key = getEffectiveLineUserId(contract, tenant) ?? `tenant:${bill.tenant_id as string}`
    if (!byTenant.has(key)) byTenant.set(key, [])
    byTenant.get(key)!.push(bill)
  }

  let sent = 0, failed = 0, snoozed = 0, noLine = 0, totalReminded = 0
  const sentRooms: string[] = []

  for (const [, tenantBills] of byTenant) {
    const firstBill = tenantBills[0]
    const tenant = firstBill.tenants as unknown as TJ | null
    const contract = firstBill.contracts as unknown as CJ | null
    const lineUserId = getEffectiveLineUserId(contract, tenant)

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
        buildPortalFlex(portalUrl, lines.slice(2).join('\n'), hasOverdue),
      ])
      sent++
      totalReminded += totalOwed
      sentRooms.push(`ห้อง ${roomNumber}: ${fmt(totalOwed)} บาท${hasOverdue ? ' 🔴' : ''}`)
    } catch {
      failed++
    }
  }

  // Summary to owner — ส่งเฉพาะเมื่อมีการแจ้งเตือนจริง (sent > 0) และ toggle เปิด
  if (sent > 0 && lineSettings?.bill_reminder_notify_enabled !== false) {
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
    const appUrl = (lineConfig?.appUrl ?? '').replace(/\/$/, '')
    try {
      await notifyOwner(
        ownerLines.join('\n'),
        'reminder_summary',
        appUrl ? { label: 'ดูบิล', url: `${appUrl}/bills` } : undefined,
        { strict: true }
      )
    } catch { ownerFailed = true }
  }

  const { error: finalLogError } = await supabase
    .from('audit_logs')
    .update({
      description: `Automated reminders sent for ${reminderKey}`,
      new_value: { completed: true, sent, failed, snoozed, noLine, owner_failed: ownerFailed },
    })
    .eq('action', 'cron_reminders_sent')
    .eq('entity_type', 'cron')
    .eq('entity_id', reminderKey)

  return NextResponse.json({ ok: !ownerFailed && !finalLogError, date: reminderKey, sent, failed, snoozed, noLine },
    { status: ownerFailed || finalLogError ? 502 : 200 })
}
