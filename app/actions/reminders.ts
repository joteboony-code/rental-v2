'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseReminderDays } from '@/lib/reminder-utils'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl, buildTenantPortalUrl } from '@/lib/portal-url'
// ── helpers ─────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

async function pushMessage(to: string, token: string, messages: object[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${await res.text()}`)
}

// ── Snooze a bill ────────────────────────────────────────────
export async function snoozeBill(
  billId: string,
  snoozeUntil: string,   // "YYYY-MM-DD"
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

// ── Clear snooze ─────────────────────────────────────────────
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

// ── Send overdue reminders (pending + overdue, not snoozed) ─
export async function sendOverdueReminders(
  billingMonth: string,   // "YYYY-MM-DD"
  mode: 'text' | 'flex'
): Promise<{
  success:  boolean
  sent:     number
  snoozed:  number
  noLine:   number
  message:  string
}> {
  const supabase = await createClient()
  const today    = new Date().toISOString().split('T')[0]  // "YYYY-MM-DD"

  // Get all pending/overdue bills for this month
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id, total_amount, due_date, billing_month, snooze_until, snooze_note,
      rooms   ( room_number ),
      tenants ( full_name, line_user_id )
    `)
    .eq('billing_month', billingMonth)
    .in('status', ['pending', 'overdue'])

  if (!bills || bills.length === 0) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, message: 'ไม่มีบิลที่รอชำระ' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, sent: 0, snoozed: 0, noLine: 0, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }
  }

  let sent = 0, snoozed = 0, noLine = 0

  for (const bill of bills) {
    type TJ = { full_name: string; line_user_id: string | null }
    type RJ = { room_number: string }
    const tenant     = bill.tenants as unknown as TJ | null
    const room       = bill.rooms   as unknown as RJ | null
    const lineUserId = tenant?.line_user_id

    if (!lineUserId) { noLine++; continue }

    // Check snooze
    const snoozeUntil = bill.snooze_until as string | null
    if (snoozeUntil && snoozeUntil >= today) { snoozed++; continue }

    const month      = thaiMonth(bill.billing_month as string)
    const roomNumber = room?.room_number ?? '—'
    const total      = Number(bill.total_amount)
    const portalUrl  = buildBillPortalUrl(bill.id, lineConfig.liffId, lineConfig.appUrl)
    const tenantPortalUrl = buildTenantPortalUrl(lineConfig.liffId, lineConfig.appUrl)
    const overdue    = (bill.due_date as string) < today

    try {
      if (mode === 'text') {
        const emoji = overdue ? '⚠️' : '📢'
        const lines = [
          `${emoji} แจ้งเตือนค่าเช่า${overdue ? 'เกินกำหนด' : ''} — ห้อง ${roomNumber}`,
          `เดือน: ${month}`,
          overdue
            ? `ยอดค้างชำระ: ฿${fmt(total)}`
            : `ยอดที่ต้องชำระ: ฿${fmt(total)}`,
          `ครบกำหนด: ${new Date(bill.due_date as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          ``,
          `🔗 ดูบิล / ชำระเงิน: ${portalUrl}`,
          `🏠 ดูข้อมูลห้อง: ${tenantPortalUrl}`,
        ]
        await pushMessage(lineUserId, lineConfig.channelAccessToken, [{ type: 'text', text: lines.join('\n') }])
      } else {
        const isOverdue = overdue
        const bubble = {
          type: 'flex',
          altText: `แจ้งเตือนค่าเช่าห้อง ${roomNumber} ${isOverdue ? 'เกินกำหนด' : ''} ฿${fmt(total)}`,
          contents: {
            type: 'bubble',
            size: 'mega',
            header: {
              type: 'box', layout: 'vertical',
              backgroundColor: isOverdue ? '#B91C1C' : '#0C1B4D',
              paddingAll: '20px',
              contents: [
                {
                  type: 'text',
                  text: isOverdue ? '⚠️ ค่าเช่าเกินกำหนด!' : '📢 แจ้งเตือนค่าเช่า',
                  color: isOverdue ? '#FEE2E2' : '#94A3B8', size: 'xs', weight: 'bold',
                },
                { type: 'text', text: `ห้อง ${roomNumber}`, color: '#FFFFFF', size: 'xxl', weight: 'bold' },
                { type: 'text', text: month, color: isOverdue ? '#FCA5A5' : '#64748B', size: 'sm', margin: 'xs' },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
              contents: [
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: isOverdue ? 'ยอดค้างชำระ' : 'ยอดที่ต้องชำระ', size: 'sm', color: '#64748B', flex: 1 },
                    { type: 'text', text: `฿${fmt(total)}`, size: 'xl', weight: 'bold', color: isOverdue ? '#DC2626' : '#0F172A', align: 'end' },
                  ],
                },
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ครบกำหนด', size: 'sm', color: '#94A3B8', flex: 1 },
                    {
                      type: 'text',
                      text: new Date(bill.due_date as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
                      size: 'sm', color: '#EF4444', align: 'end',
                    },
                  ],
                },
              ],
            },
            footer: {
              type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
              backgroundColor: '#F8FAFC',
              contents: [
                {
                  type: 'button',
                  action: { type: 'uri', label: '💳 ดูบิล / ชำระเงิน', uri: portalUrl },
                  style: 'primary',
                  color: isOverdue ? '#B91C1C' : '#0C1B4D',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: { type: 'uri', label: 'ดูข้อมูลห้อง', uri: tenantPortalUrl },
                  style: 'secondary',
                  height: 'sm',
                },
              ],
            },
          },
        }
        await pushMessage(lineUserId, lineConfig.channelAccessToken, [bubble])
      }
      sent++
    } catch {
      noLine++
    }
  }

  const parts = [`ส่งสำเร็จ ${sent} ห้อง`]
  if (snoozed > 0) parts.push(`งดแจ้งเตือน ${snoozed} ห้อง`)
  if (noLine > 0)  parts.push(`ไม่มี LINE ${noLine} ห้อง`)

  return { success: true, sent, snoozed, noLine, message: parts.join(' · ') }
}

// ── Update reminder settings ─────────────────────────────────
export async function updateReminderSettings(
  reminderDays: string,
  enabled: boolean
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  // Validate days
  const days = parseReminderDays(reminderDays)
  if (days.length === 0) {
    return { success: false, message: 'กรุณาระบุวันที่แจ้งเตือนอย่างน้อย 1 วัน' }
  }

  const { error } = await supabase
    .from('settings')
    .update({
      reminder_days:    days.join(','),
      reminder_enabled: enabled,
    })
    .eq('id', 1)

  if (error) return { success: false, message: error.message }

  revalidatePath('/bills')
  revalidatePath('/settings')
  return { success: true, message: 'บันทึกการตั้งค่าแจ้งเตือนแล้ว' }
}

