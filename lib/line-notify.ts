// Server-side utility — NOT a 'use server' file
// Cannot be invoked as a server action from client components.
// Import this from other server actions only.

import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'
import { getEffectiveLineUserId } from '@/lib/line-recipient'

function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
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

// ส่ง LINE แจ้งผู้เช่าหลังรับชำระ ทั้งกรณีครบและบางส่วน
export async function sendPaymentReceiptNotification(
  billId: string,
  totalPaid: number,
  totalAmount: number
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient()

  const { data: bill } = await supabase
    .from('bills')
    .select('billing_month, rooms(room_number), tenants(full_name, line_user_id), contracts(line_recipient_user_id)')
    .eq('id', billId)
    .single()

  if (!bill) return { success: false, message: 'ไม่พบบิล' }

  type RoomJoin   = { room_number: string }
  type TenantJoin = { full_name: string; line_user_id: string | null }
  type ContractJoin = { line_recipient_user_id: string | null }
  const room   = bill.rooms   as unknown as RoomJoin   | null
  const tenant = bill.tenants as unknown as TenantJoin | null
  const contract = bill.contracts as unknown as ContractJoin | null
  const lineUserId = getEffectiveLineUserId(contract, tenant)

  if (!tenant || !lineUserId) return { success: false, message: 'ห้องนี้ไม่มี LINE ผู้รับบิล' }

  const { data: lastPayment } = await supabase
    .from('payments')
    .select('receipt_no')
    .eq('bill_id', billId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const receiptNo = (lastPayment as { receipt_no?: string | null } | null)?.receipt_no ?? null

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE' }

  const roomNumber = room?.room_number ?? '—'
  const month      = thaiMonth(bill.billing_month as string)
  const remaining  = Math.max(0, totalAmount - totalPaid)
  const fullyPaid  = remaining < 1
  const portalUrl  = buildBillPortalUrl(billId, lineConfig.liffId, lineConfig.appUrl)

  const headerText  = fullyPaid ? '✅ ชำระค่าเช่าครบแล้วครับ!' : '💳 รับชำระบางส่วนแล้วครับ'
  const headerColor = fullyPaid ? '#16A34A' : '#1D4ED8'

  const receiptRow = receiptNo ? [
    { type: 'box', layout: 'horizontal', contents: [
      { type: 'text', text: '🧾 ใบเสร็จ', size: 'sm', color: '#64748B', flex: 1 },
      { type: 'text', text: receiptNo, size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
    ]},
  ] : []

  const flexMsg = {
    type: 'flex',
    altText: fullyPaid
      ? `✅ ชำระค่าเช่าครบแล้ว ห้อง ${roomNumber}`
      : `💳 รับชำระบางส่วน ห้อง ${roomNumber} ยังค้าง ${fmt(remaining)} บาท`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'horizontal', backgroundColor: headerColor, paddingAll: '16px',
        contents: [
          { type: 'text', text: fullyPaid ? '✅' : '💳', size: 'xl', flex: 0 },
          { type: 'text', text: headerText, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'md', flex: 1 },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '🏠 ห้อง',   size: 'sm', color: '#64748B', flex: 1 },
            { type: 'text', text: roomNumber,  size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📅 รอบบิล', size: 'sm', color: '#64748B', flex: 1 },
            { type: 'text', text: month,       size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
          ]},
          { type: 'separator', color: '#E2E8F0' },
          ...receiptRow,
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: fullyPaid ? '💰 ชำระแล้ว' : '💰 รับมาแล้ว', size: 'sm', color: '#64748B', flex: 1 },
            { type: 'text', text: `${fmt(totalPaid)} บาท`, size: 'sm', color: headerColor, align: 'end', weight: 'bold' },
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: fullyPaid ? '🟢 คงเหลือ' : '🟡 ยังค้าง', size: 'sm', color: '#64748B', flex: 1 },
            { type: 'text', text: fullyPaid ? '0 บาท' : `${fmt(remaining)} บาท`, size: 'sm',
              color: fullyPaid ? '#0F172A' : '#DC2626', align: 'end', weight: 'bold' },
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{ type: 'button', action: { type: 'uri', label: '🔗 ดูบิล / ชำระเงิน', uri: portalUrl },
          style: 'primary', color: '#0C1B4D', height: 'sm' }],
      },
    },
  }

  try {
    await pushMessage(lineUserId, lineConfig.channelAccessToken, [flexMsg])
    return { success: true, message: 'ส่ง LINE สำเร็จ' }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}
