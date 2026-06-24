'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseReminderDays } from '@/lib/reminder-utils'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'
import { getAuthedUser } from '@/lib/require-admin'
import { notifyOwner } from '@/lib/notify-owner'

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

type BillRow = {
  id: string
  billing_month: string
  status: string
  total_amount: number
  rent_amount: number
  electricity_amount: number
  water_amount: number
  wifi_amount: number
  trash_amount: number
  other_amount: number
  other_note: string | null
  due_date: string
  snooze_until: string | null
  tenant_id: string
  rooms:         { room_number: string } | null
  tenants:       { full_name: string; line_user_id: string | null } | null
  meter_readings:{ water_units: number | null; electricity_units: number | null } | null
  payments:      { amount: number }[] | null
}

type ActiveBill = BillRow & { remaining: number }

// Flex card shown to tenant — one card per tenant, all months in body
function buildBillFlexCard(
  roomNumber: string,
  tenantName: string,
  bills: ActiveBill[],
  totalOwed: number,
  portalUrl: string,
  elecRate: number,
  waterRate: number,
): object {
  const isOverdue = bills.some(b => b.status === 'overdue')
  const headerBg  = isOverdue ? '#B91C1C' : '#0C1B4D'

  const bodyContents: object[] = []

  bills.forEach((bill, i) => {
    if (i > 0) bodyContents.push({ type: 'separator', margin: 'lg' })

    const m   = bill.meter_readings
    const isOv = bill.status === 'overdue'

    bodyContents.push({
      type: 'text',
      text: `${isOv ? '🔴' : '🟡'} ${thaiMonth(bill.billing_month)}${isOv ? ' (เกินกำหนด)' : ''}`,
      weight: 'bold', size: 'sm',
      color: isOv ? '#B91C1C' : '#1e3a5f',
      margin: i > 0 ? 'lg' : 'none',
    })

    const rows: [string, string][] = [
      ['🏠 ค่าเช่า', `${fmt(Number(bill.rent_amount))} บาท`],
      [
        m?.electricity_units != null ? `⚡ ค่าไฟ (${m.electricity_units}×${elecRate})` : '⚡ ค่าไฟ',
        `${fmt(Number(bill.electricity_amount))} บาท`,
      ],
      [
        m?.water_units != null ? `💧 ค่าน้ำ (${m.water_units}×${waterRate})` : '💧 ค่าน้ำ',
        `${fmt(Number(bill.water_amount))} บาท`,
      ],
    ]
    if (Number(bill.wifi_amount)  > 0) rows.push(['📶 WiFi', `${fmt(Number(bill.wifi_amount))} บาท`])
    if (Number(bill.trash_amount) > 0) rows.push(['🗑️ ค่าขยะ', `${fmt(Number(bill.trash_amount))} บาท`])
    if (Number(bill.other_amount) > 0) rows.push([`📦 ${bill.other_note || 'อื่นๆ'}`, `${fmt(Number(bill.other_amount))} บาท`])

    for (const [label, value] of rows) {
      bodyContents.push({
        type: 'box', layout: 'horizontal', margin: 'xs',
        contents: [
          { type: 'text', text: label,  size: 'xs', color: '#555555', flex: 4 },
          { type: 'text', text: value,  size: 'xs', align: 'end',     flex: 3 },
        ],
      })
    }

    bodyContents.push({ type: 'separator', margin: 'sm' })
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: '📌 คงเหลือ',              size: 'sm', weight: 'bold', flex: 4 },
        { type: 'text', text: `${fmt(bill.remaining)} บาท`, size: 'sm', weight: 'bold', align: 'end', flex: 3, color: '#DC2626' },
      ],
    })
    bodyContents.push({
      type: 'text', text: `🗓️ ครบกำหนด ${thaiDate(bill.due_date)}`,
      size: 'xs', color: '#888888', margin: 'xs',
    })
  })

  if (bills.length > 1) {
    bodyContents.push({ type: 'separator', margin: 'lg' })
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: '💰 ยอดค้างรวมทุกเดือน', size: 'md', weight: 'bold', flex: 4, color: '#DC2626' },
        { type: 'text', text: `${fmt(totalOwed)} บาท`,   size: 'md', weight: 'bold', align: 'end', flex: 3, color: '#DC2626' },
      ],
    })
  }

  return {
    type: 'flex',
    altText: `แจ้งเตือนค่าเช่า ห้อง ${roomNumber} รวม ${fmt(totalOwed)} บาท`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        backgroundColor: headerBg,
        contents: [
          { type: 'text', text: isOverdue ? '🚨 แจ้งเตือนค่าเช่าค้างชำระ' : '🔔 แจ้งเตือนค่าเช่า', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: `🏠 ห้อง ${roomNumber}  ·  ${tenantName}`, color: 'rgba(255,255,255,0.85)', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: bodyContents,
      },
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
  if (!(await getAuthedUser())) return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  if (!snoozeUntil || isNaN(Date.parse(snoozeUntil))) return { success: false, message: 'วันที่ไม่ถูกต้อง' }
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
  if (!(await getAuthedUser())) return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('bills')
    .update({ snooze_until: null, snooze_note: null })
    .eq('id', billId)

  if (error) return { success: false, message: error.message }
  revalidatePath('/bills')
  return { success: true, message: 'เปิดการแจ้งเตือนแล้ว' }
}

// ── Core reminder sender ─────────────────────────────────────
// _billingMonth ไม่ใช้กรอง — query ทุกบิลค้างชำระทุกเดือน
export async function sendOverdueReminders(
  _billingMonth: string,
  mode: 'text' | 'flex' = 'text'
): Promise<{
  success: boolean
  sent: number
  snoozed: number
  noLine: number
  failed: number
  message: string
  ownerSummary?: string
}> {
  // ตรวจสิทธิ์เอง — action นี้ใช้ service client (bypass RLS) และยิง LINE push (เปลืองโควต้า)
  if (!(await getAuthedUser())) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, failed: 0, message: 'ไม่มีสิทธิ์ใช้งาน' }
  }

  const supabase = createServiceClient()
  const today    = new Date().toISOString().split('T')[0]
  const todayThai = thaiDate(today)

  const { data: rawBills, error: billsError } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month, status, tenant_id,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note,
      snooze_until,
      rooms          ( room_number ),
      tenants        ( full_name, line_user_id ),
      meter_readings ( water_units, electricity_units ),
      payments       ( amount )
    `)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: true })

  if (billsError) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, failed: 0, message: `ข้อผิดพลาด: ${billsError.message}` }
  }

  const bills = (rawBills ?? []) as unknown as BillRow[]

  if (bills.length === 0) {
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

  const bankText  = settings?.bank_accounts_text ?? ''
  const elecRate  = Number(settings?.electricity_unit_price ?? 8)
  const waterRate = Number(settings?.water_unit_price ?? 18)

  // Group by tenant
  const byTenant = new Map<string, BillRow[]>()
  for (const bill of bills) {
    if (!byTenant.has(bill.tenant_id)) byTenant.set(bill.tenant_id, [])
    byTenant.get(bill.tenant_id)!.push(bill)
  }

  let sent = 0, snoozed = 0, noLine = 0, failed = 0
  const sentRooms: string[] = []

  for (const [, tenantBills] of byTenant) {
    const firstBill = tenantBills[0]
    const tenant    = firstBill.tenants
    const lineUserId = tenant?.line_user_id

    if (!lineUserId) { noLine++; continue }

    // Filter: skip snoozed and fully-paid bills
    const activeBills: ActiveBill[] = tenantBills
      .filter(b => {
        if (b.snooze_until && b.snooze_until >= today) return false
        const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
        return Math.max(0, Number(b.total_amount) - paid) >= 1
      })
      .map(b => {
        const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
        return { ...b, remaining: Math.max(0, Number(b.total_amount) - paid) }
      })

    if (activeBills.length === 0) { snoozed++; continue }

    const allRooms = [...new Set(tenantBills.map(b => b.rooms?.room_number).filter(Boolean) as string[])]
    const roomNumber = allRooms.join(', ') || '—'
    const tenantName = tenant?.full_name ?? '—'
    const totalOwed  = activeBills.reduce((s, b) => s + b.remaining, 0)
    const hasOverdue = activeBills.some(b => b.status === 'overdue')
    const latestBill = activeBills[activeBills.length - 1]
    const portalUrl  = buildBillPortalUrl(latestBill.id, lineConfig.liffId, lineConfig.appUrl)

    let messages: object[]

    if (mode === 'flex') {
      messages = [buildBillFlexCard(roomNumber, tenantName, activeBills, totalOwed, portalUrl, elecRate, waterRate)]
    } else {
      // Text mode — full breakdown, all months
      const lines: string[] = [
        hasOverdue ? '🚨 แจ้งเตือนค่าเช่าค้างชำระ' : '🔔 แจ้งเตือนค่าเช่า',
        SEP,
        `🏠 ห้อง ${roomNumber}  ·  ${tenantName}`,
        SEP,
      ]

      for (const bill of activeBills) {
        const m    = bill.meter_readings
        const isOv = bill.status === 'overdue'

        lines.push(`${isOv ? '🔴' : '🟡'} ${thaiMonth(bill.billing_month)}${isOv ? ' (เกินกำหนด)' : ''}`)
        lines.push(`   🏠 ค่าเช่า: ${fmt(Number(bill.rent_amount))} บาท`)

        const elecUnits = m?.electricity_units
        lines.push(`   ⚡ ค่าไฟ: ${elecUnits != null ? `${elecUnits} หน่วย × ${elecRate} = ` : ''}${fmt(Number(bill.electricity_amount))} บาท`)

        const waterUnits = m?.water_units
        lines.push(`   💧 ค่าน้ำ: ${waterUnits != null ? `${waterUnits} หน่วย × ${waterRate} = ` : ''}${fmt(Number(bill.water_amount))} บาท`)

        if (Number(bill.wifi_amount)  > 0) lines.push(`   📶 WiFi: ${fmt(Number(bill.wifi_amount))} บาท`)
        if (Number(bill.trash_amount) > 0) lines.push(`   🗑️ ค่าขยะ: ${fmt(Number(bill.trash_amount))} บาท`)
        if (Number(bill.other_amount) > 0) lines.push(`   📦 ${bill.other_note || 'อื่นๆ'}: ${fmt(Number(bill.other_amount))} บาท`)

        lines.push(`   📌 คงเหลือ: ${fmt(bill.remaining)} บาท`)
        lines.push(`   🗓️ ครบกำหนด: ${thaiDate(bill.due_date)}`)
      }

      lines.push(SEP)
      lines.push(`💰 ยอดค้างรวม: ${fmt(totalOwed)} บาท`)
      lines.push(SEP)
      if (bankText) lines.push(`📲 ${bankText}`)
      lines.push('📎 ส่งสลิปผ่านแชทนี้ได้เลยครับ 🙏')

      messages = [
        { type: 'text', text: lines.join('\n') },
        buildPortalFlex(portalUrl),
      ]
    }

    try {
      await pushMessage(lineUserId, lineConfig.channelAccessToken, messages)
      sent++
      sentRooms.push(`ห้อง ${roomNumber}: ${fmt(totalOwed)} บาท${hasOverdue ? ' 🔴' : ''}`)
    } catch {
      failed++
    }
  }

  // Owner summary
  if (sent > 0) {
    const ownerLines = [
      `📋 สรุปแจ้งเตือนอัตโนมัติ`,
      `วันที่ ${todayThai}`,
      SEP,
      `✅ ส่งสำเร็จ: ${sent} ห้อง`,
      `❌ ส่งไม่สำเร็จ: ${failed} ห้อง`,
      `📅 งดแจ้งเตือน: ${snoozed} ห้อง`,
      `⚠️ ไม่มี LINE: ${noLine} ห้อง`,
    ]
    if (sentRooms.length > 0) { ownerLines.push(SEP); ownerLines.push(...sentRooms) }
    try {
      await notifyOwner(ownerLines.join('\n'), 'reminder_summary')
    } catch { /* silent */ }
  }

  const parts = [`ส่งสำเร็จ ${sent} ห้อง`]
  if (failed  > 0) parts.push(`ไม่สำเร็จ ${failed} ห้อง`)
  if (snoozed > 0) parts.push(`งดแจ้ง ${snoozed} ห้อง`)
  if (noLine  > 0) parts.push(`ไม่มี LINE ${noLine} ห้อง`)

  return { success: sent > 0, sent, snoozed, noLine, failed, message: parts.join(' · ') }
}

// ── Update reminder settings ─────────────────────────────────
export async function updateReminderSettings(
  reminderDays: string,
  enabled: boolean
): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
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
