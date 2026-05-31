'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { roomRow } from '@/lib/room-utils'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl, buildTenantPortalUrl } from '@/lib/portal-url'

// ── helpers ──────────────────────────────────────────────────────────
function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

// ── send via LINE Messaging API ───────────────────────────────────────
async function pushMessage(to: string, token: string, messages: object[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LINE API error ${res.status}: ${body}`)
  }
}

// ── build Flex message bubble ─────────────────────────────────────────
function buildFlexBubble(data: {
  roomNumber:   string
  floor:        number | null
  tenantName:   string
  month:        string
  dueDate:      string
  rentAmt:      number
  waterAmt:     number
  elecAmt:      number
  wifiAmt:      number
  trashAmt:     number
  totalAmt:     number
  portalUrl:    string
  tenantPortalUrl: string
}) {
  const rows: object[] = [
    {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'text', text: '👤 ' + data.tenantName, color: '#64748B', size: 'sm', flex: 1 },
      ],
    },
    { type: 'separator', margin: 'md', color: '#E2E8F0' },
    billRow('ค่าเช่า', data.rentAmt),
  ]
  rows.push(billRow('💧 ค่าน้ำ', data.waterAmt, '#2563EB'))
  rows.push(billRow('⚡ ค่าไฟ',  data.elecAmt,  '#D97706'))
  if (data.wifiAmt > 0) rows.push(billRow('📶 ค่า WiFi', data.wifiAmt, '#4F46E5'))
  rows.push(billRow('🗑️ ค่าขยะ', data.trashAmt, '#64748B'))
  rows.push({ type: 'separator', margin: 'md', color: '#E2E8F0' })
  rows.push({
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: 'รวมทั้งหมด', weight: 'bold', size: 'md', color: '#0F172A', flex: 1 },
      { type: 'text', text: '฿' + fmt(data.totalAmt), weight: 'bold', size: 'xl', color: '#0F172A', align: 'end' },
    ],
  })
  rows.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'ครบกำหนด', size: 'xs', color: '#94A3B8', flex: 1 },
      {
        type: 'text',
        text: new Date(data.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
        size: 'xs', color: '#EF4444', align: 'end',
      },
    ],
  })

  return {
    type: 'flex',
    altText: `แจ้งค่าเช่าห้อง ${data.roomNumber} เดือน ${data.month} รวม ฿${fmt(data.totalAmt)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0C1B4D',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: 'แจ้งค่าเช่า', color: '#94A3B8', size: 'xs', weight: 'bold' },
          {
            type: 'text',
            text: 'ห้อง ' + data.roomNumber + ` แถวที่ ${roomRow(data.roomNumber)}`,
            color: '#FFFFFF', size: 'xxl', weight: 'bold',
          },
          { type: 'text', text: data.month, color: '#64748B', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '20px',
        contents: rows,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        backgroundColor: '#F8FAFC',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '🔗 ดูบิล / ชำระเงิน', uri: data.portalUrl },
            style: 'primary',
            color: '#0C1B4D',
            height: 'sm',
          },
          {
            type: 'button',
            action: { type: 'uri', label: 'ดูข้อมูลห้อง', uri: data.tenantPortalUrl },
            style: 'secondary',
            height: 'sm',
          },
        ],
      },
    },
  }
}

function billRow(label: string, amount: number, color = '#334155'): object {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#64748B', flex: 1 },
      { type: 'text', text: '฿' + fmt(amount), size: 'sm', color, align: 'end', weight: 'bold' },
    ],
  }
}

// ── Main action ──────────────────────────────────────────────────────
export async function sendLineBillNotification(
  billId: string,
  mode: 'text' | 'flex'
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  // Fetch bill + joins
  const { data: bill } = await supabase
    .from('bills')
    .select(`
      *,
      rooms   ( room_number, floor ),
      tenants ( full_name, line_user_id )
    `)
    .eq('id', billId)
    .single()

  if (!bill) return { success: false, message: 'ไม่พบบิล' }

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; line_user_id: string | null }

  const room   = bill.rooms   as unknown as RoomJoin   | null
  const tenant = bill.tenants as unknown as TenantJoin | null

  if (!tenant?.line_user_id) {
    return { success: false, message: 'ผู้เช่าไม่มี LINE User ID — กรุณาเพิ่มในข้อมูลผู้เช่า' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token ในหน้าตั้งค่า' }
  }

  const month      = thaiMonth(bill.billing_month)
  const portalUrl  = buildBillPortalUrl(billId, lineConfig.liffId, lineConfig.appUrl)
  const tenantPortalUrl = buildTenantPortalUrl(lineConfig.liffId, lineConfig.appUrl)
  const roomNumber = room?.room_number ?? '—'
  const floor      = room?.floor ?? null

  try {
    if (mode === 'text') {
      const lines = [
        `📋 แจ้งค่าเช่า — ห้อง ${roomNumber} แถวที่ ${roomRow(roomNumber)}`,
        `เดือน: ${month}`,
        ``,
        `ค่าเช่า:  ฿${fmt(Number(bill.rent_amount))}`,
      ]
      lines.push(`ค่าน้ำ:   ฿${fmt(Number(bill.water_amount))}`)
      lines.push(`ค่าไฟ:   ฿${fmt(Number(bill.electricity_amount))}`)
      if (Number(bill.wifi_amount) > 0) lines.push(`ค่า WiFi: ฿${fmt(Number(bill.wifi_amount))}`)
      lines.push(`ค่าขยะ:  ฿${fmt(Number(bill.trash_amount))}`)
      lines.push(``, `รวม: ฿${fmt(Number(bill.total_amount))}`)
      lines.push(
        `ครบกำหนด: ${new Date(bill.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
      )
      lines.push(``, `🔗 ดูบิล: ${portalUrl}`)
      lines.push(`🏠 ดูข้อมูลห้อง: ${tenantPortalUrl}`)

      await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [
        { type: 'text', text: lines.join('\n') },
      ])
    } else {
      const flexMsg = buildFlexBubble({
        roomNumber,
        floor,
        tenantName:  tenant.full_name,
        month,
        dueDate:     bill.due_date,
        rentAmt:     Number(bill.rent_amount),
        waterAmt:    Number(bill.water_amount),
        elecAmt:     Number(bill.electricity_amount),
        wifiAmt:     Number(bill.wifi_amount),
        trashAmt:    Number(bill.trash_amount),
        totalAmt:    Number(bill.total_amount),
        portalUrl,
        tenantPortalUrl,
      })
      await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [flexMsg])
    }

    return { success: true, message: `ส่ง LINE ${mode === 'flex' ? 'Flex Message' : 'ข้อความ'} สำเร็จ` }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}

// ── Payment confirmed notification ──────────────────────────────────────────

export async function sendPaymentConfirmedNotification(
  billId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient()

  const { data: bill } = await supabase
    .from('bills')
    .select(`*, rooms ( room_number, floor ), tenants ( full_name, line_user_id )`)
    .eq('id', billId)
    .single()

  if (!bill) return { success: false, message: 'ไม่พบบิล' }

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; line_user_id: string | null }
  const room   = bill.rooms   as unknown as RoomJoin   | null
  const tenant = bill.tenants as unknown as TenantJoin | null

  if (!tenant?.line_user_id) return { success: false, message: 'ผู้เช่าไม่มี LINE User ID' }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }

  const roomNumber = room?.room_number ?? '—'
  const month      = thaiMonth(bill.billing_month as string)
  const totalAmt   = Number(bill.total_amount)
  const total      = fmt(totalAmt)
  const portalUrl  = buildBillPortalUrl(billId, lineConfig.liffId, lineConfig.appUrl)

  const flexMsg = {
    type: 'flex',
    altText: `✅ ชำระค่าเช่าครบแล้วครับ! ห้อง ${roomNumber} ฿${total}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'horizontal',
        backgroundColor: '#16A34A',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '✅', size: 'xl', flex: 0, margin: 'none' },
          { type: 'text', text: 'ชำระค่าเช่าครบแล้วครับ!', color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'md', flex: 1 },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '🏠 ห้อง', size: 'sm', color: '#64748B', flex: 1 },
              { type: 'text', text: roomNumber, size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '📅 รอบบิล', size: 'sm', color: '#64748B', flex: 1 },
              { type: 'text', text: month, size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
            ],
          },
          { type: 'separator', color: '#E2E8F0' },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '💰 ชำระแล้ว', size: 'sm', color: '#64748B', flex: 1 },
              { type: 'text', text: `${total} บาท`, size: 'sm', color: '#16A34A', align: 'end', weight: 'bold' },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '🟢 คงเหลือ', size: 'sm', color: '#64748B', flex: 1 },
              { type: 'text', text: '0 บาท', size: 'sm', color: '#0F172A', align: 'end', weight: 'bold' },
            ],
          },
        ],
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

  try {
    await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [flexMsg])
    return { success: true, message: 'ส่ง LINE ยืนยันชำระแล้วสำเร็จ' }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}



export interface CheckoutLineData {
  tenantId:         string
  tenantName:       string
  roomNumber:       string
  depositPaid:      number
  outstandingBills: number
  cleaningFee:      number
  extraCharges:     { label: string; amount: number }[]
  netAmount:        number   // positive = refund to tenant, negative = tenant owes
  moveOutDate:      string   // YYYY-MM-DD
}

function buildCheckoutFlexBubble(data: CheckoutLineData): object {
  const isRefund = data.netAmount >= 0
  const moveOutLabel = new Date(data.moveOutDate).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const rows: object[] = []

  // Tenant + date row
  rows.push({
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [
      { type: 'text', text: '👤 ' + data.tenantName, color: '#64748B', size: 'sm', flex: 1 },
      { type: 'text', text: '📅 ' + moveOutLabel, color: '#64748B', size: 'sm', align: 'end' },
    ],
  })
  rows.push({ type: 'separator', margin: 'md', color: '#E2E8F0' })

  // Deposit
  rows.push({
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: 'เงินมัดจำ', size: 'sm', color: '#334155', flex: 1 },
      { type: 'text', text: '+฿' + fmt(data.depositPaid), size: 'sm', color: '#059669', align: 'end', weight: 'bold' },
    ],
  })

  // Outstanding bills
  if (data.outstandingBills > 0) {
    rows.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ค่าเช่าค้างชำระ', size: 'sm', color: '#64748B', flex: 1 },
        { type: 'text', text: '-฿' + fmt(data.outstandingBills), size: 'sm', color: '#DC2626', align: 'end', weight: 'bold' },
      ],
    })
  }

  // Cleaning fee
  if (data.cleaningFee > 0) {
    rows.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ค่าทำความสะอาด', size: 'sm', color: '#64748B', flex: 1 },
        { type: 'text', text: '-฿' + fmt(data.cleaningFee), size: 'sm', color: '#DC2626', align: 'end', weight: 'bold' },
      ],
    })
  }

  // Extra charges
  for (const e of data.extraCharges) {
    if (e.amount > 0) {
      rows.push({
        type: 'box', layout: 'horizontal', margin: 'sm',
        contents: [
          { type: 'text', text: e.label || 'รายการพิเศษ', size: 'sm', color: '#64748B', flex: 1 },
          { type: 'text', text: '-฿' + fmt(e.amount), size: 'sm', color: '#DC2626', align: 'end', weight: 'bold' },
        ],
      })
    }
  }

  // Separator + net
  rows.push({ type: 'separator', margin: 'md', color: '#E2E8F0' })
  rows.push({
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: isRefund ? 'คืนเงินให้ผู้เช่า' : 'ผู้เช่าชำระเพิ่ม', weight: 'bold', size: 'md', color: '#0F172A', flex: 1 },
      { type: 'text', text: '฿' + fmt(Math.abs(data.netAmount)), weight: 'bold', size: 'xl', color: isRefund ? '#059669' : '#DC2626', align: 'end' },
    ],
  })

  return {
    type: 'flex',
    altText: `แจ้งการย้ายออกห้อง ${data.roomNumber} · ${isRefund ? 'คืน' : 'จ่ายเพิ่ม'} ฿${fmt(Math.abs(data.netAmount))}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#0C1B4D',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: 'แจ้งการย้ายออก', color: '#94A3B8', size: 'xs', weight: 'bold' },
          { type: 'text', text: 'ห้อง ' + data.roomNumber, color: '#FFFFFF', size: 'xxl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
        contents: rows,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        backgroundColor: isRefund ? '#F0FDF4' : '#FFF7ED',
        contents: [
          {
            type: 'text',
            text: isRefund
              ? `✅ เจ้าของห้องจะคืนเงินให้ ฿${fmt(Math.abs(data.netAmount))}`
              : `⚠️ กรุณาชำระส่วนต่าง ฿${fmt(Math.abs(data.netAmount))}`,
            size: 'sm',
            weight: 'bold',
            color: isRefund ? '#059669' : '#D97706',
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  }
}

// ── Broadcast announcement ────────────────────────────────────────────────────

export async function sendBroadcast(
  roomIds: string[],   // empty array = all active rooms
  message: string,
  imageUrl: string | null
): Promise<{ success: boolean; sent: number; failed: number; message: string }> {
  const supabase = await createClient()

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) return { success: false, sent: 0, failed: 0, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }

  // Build recipient query
  let contractQuery = supabase
    .from('contracts')
    .select('tenant_id, tenants ( full_name, line_user_id ), rooms ( room_number )')
    .eq('status', 'active')

  if (roomIds.length > 0) {
    contractQuery = contractQuery.in('room_id', roomIds)
  }

  const { data: contracts } = await contractQuery
  if (!contracts || contracts.length === 0) {
    return { success: false, sent: 0, failed: 0, message: 'ไม่มีผู้เช่าที่เลือก' }
  }

  // กันส่งซ้ำ: ผู้เช่าที่เช่าหลายห้องมี line_user_id เดียว → ส่งครั้งเดียว
  const sentTo = new Set<string>()
  let sent = 0, failed = 0

  for (const c of contracts) {
    type TJ = { full_name: string; line_user_id: string | null }
    const tenant = c.tenants as unknown as TJ | null
    const lineUserId = tenant?.line_user_id
    if (!lineUserId) { failed++; continue }
    if (sentTo.has(lineUserId)) continue   // ส่งไปแล้ว (ห้องอื่นของผู้เช่าคนเดียวกัน)

    try {
      const msgs: object[] = [{ type: 'text', text: message }]
      if (imageUrl) {
        msgs.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl })
      }
      await pushMessage(lineUserId, lineConfig.channelAccessToken, msgs)
      sentTo.add(lineUserId)
      sent++
    } catch {
      failed++
    }
  }

  // บันทึกประวัติการประกาศ
  type RJ = { room_number: string }
  const targetDesc = roomIds.length === 0
    ? 'ทุกห้อง'
    : contracts
        .map((c) => (c.rooms as unknown as RJ | null)?.room_number)
        .filter((n): n is string => Boolean(n))
        .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
        .map((n) => `ห้อง ${n}`)
        .join(', ')

  await supabase.from('broadcast_history').insert({
    message,
    image_url: imageUrl,
    target_room_numbers: targetDesc,
    recipient_count: sentTo.size + failed,
    sent_count: sent,
    failed_count: failed,
  })

  revalidatePath('/broadcast')

  return {
    success: true, sent, failed,
    message: `ส่งประกาศสำเร็จ ${sent} คน${failed > 0 ? ` · ส่งไม่ได้ ${failed} คน` : ''}`,
  }
}

// ── Bulk bill notification (all rooms in a month) ────────────────────────────

export async function sendBulkLineBillNotification(
  billingMonth: string,   // "YYYY-MM-DD"
  mode: 'text' | 'flex'
): Promise<{ success: boolean; sent: number; failed: number; message: string }> {
  const supabase = await createClient()

  // Get all pending/overdue bills for this month with tenant LINE IDs
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount,
      total_amount, due_date, billing_month,
      rooms   ( room_number, floor ),
      tenants ( full_name, line_user_id )
    `)
    .eq('billing_month', billingMonth)
    .in('status', ['pending', 'overdue'])

  if (!bills || bills.length === 0) {
    return { success: false, sent: 0, failed: 0, message: 'ไม่มีบิลที่รอชำระในเดือนนี้' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, sent: 0, failed: 0, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }
  }

  let sent = 0
  let failed = 0

  for (const bill of bills) {
    type TenantJ = { full_name: string; line_user_id: string | null }
    type RoomJ   = { room_number: string; floor: number | null }
    const tenant    = bill.tenants as unknown as TenantJ | null
    const room      = bill.rooms   as unknown as RoomJ   | null
    const lineUserId = tenant?.line_user_id

    if (!lineUserId) { failed++; continue }

    const month      = thaiMonth(bill.billing_month as string)
    const portalUrl  = buildBillPortalUrl(bill.id, lineConfig.liffId, lineConfig.appUrl)
    const tenantPortalUrl = buildTenantPortalUrl(lineConfig.liffId, lineConfig.appUrl)
    const roomNumber = room?.room_number ?? '—'
    const floor      = room?.floor ?? null

    try {
      if (mode === 'text') {
        const lines = [
          `📋 แจ้งค่าเช่า — ห้อง ${roomNumber}${floor ? ` ชั้น ${floor}` : ''}`,
          `เดือน: ${month}`,
          ``,
          `ค่าเช่า:  ฿${fmt(Number(bill.rent_amount))}`,
        ]
        lines.push(`ค่าน้ำ:   ฿${fmt(Number(bill.water_amount))}`)
        lines.push(`ค่าไฟ:   ฿${fmt(Number(bill.electricity_amount))}`)
        if (Number(bill.wifi_amount) > 0)         lines.push(`ค่า WiFi: ฿${fmt(Number(bill.wifi_amount))}`)
        lines.push(`ค่าขยะ:  ฿${fmt(Number(bill.trash_amount))}`)
        if (Number(bill.other_amount) > 0)        lines.push(`อื่นๆ:   ฿${fmt(Number(bill.other_amount))}`)
        lines.push(``, `รวม: ฿${fmt(Number(bill.total_amount))}`)
        lines.push(`ครบกำหนด: ${new Date(bill.due_date as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`)
        lines.push(``, `🔗 ดูบิล: ${portalUrl}`)
        lines.push(`🏠 ดูข้อมูลห้อง: ${tenantPortalUrl}`)
        await pushMessage(lineUserId, lineConfig.channelAccessToken, [{ type: 'text', text: lines.join('\n') }])
      } else {
        const flexMsg = buildFlexBubble({
          roomNumber,
          floor,
          tenantName:  tenant?.full_name ?? '—',
          month,
          dueDate:     bill.due_date as string,
          rentAmt:     Number(bill.rent_amount),
          waterAmt:    Number(bill.water_amount),
          elecAmt:     Number(bill.electricity_amount),
          wifiAmt:     Number(bill.wifi_amount),
          trashAmt:    Number(bill.trash_amount),
          totalAmt:    Number(bill.total_amount),
          portalUrl,
          tenantPortalUrl,
        })
        await pushMessage(lineUserId, lineConfig.channelAccessToken, [flexMsg])
      }
      sent++
    } catch {
      failed++
    }
  }

  const msg = `ส่งสำเร็จ ${sent} ห้อง${failed > 0 ? ` · ส่งไม่ได้ ${failed} ห้อง (ไม่มี LINE)` : ''}`
  return { success: true, sent, failed, message: msg }
}

export async function sendCheckoutLineNotification(
  data: CheckoutLineData,
  mode: 'text' | 'flex'
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  // Get tenant's LINE user ID
  const { data: tenant } = await supabase
    .from('tenants')
    .select('line_user_id')
    .eq('id', data.tenantId)
    .single()

  if (!tenant?.line_user_id) {
    return { success: false, message: 'ผู้เช่าไม่มี LINE User ID' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }
  }

  const isRefund   = data.netAmount >= 0
  const moveOutLabel = new Date(data.moveOutDate).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  try {
    if (mode === 'text') {
      const lines = [
        `📋 แจ้งการย้ายออก — ห้อง ${data.roomNumber}`,
        `วันที่ย้ายออก: ${moveOutLabel}`,
        ``,
        `เงินมัดจำ:          +฿${fmt(data.depositPaid)}`,
      ]
      if (data.outstandingBills > 0) lines.push(`ค่าเช่าค้างชำระ:   -฿${fmt(data.outstandingBills)}`)
      if (data.cleaningFee > 0)      lines.push(`ค่าทำความสะอาด:    -฿${fmt(data.cleaningFee)}`)
      for (const e of data.extraCharges) {
        if (e.amount > 0) lines.push(`${e.label || 'รายการอื่นๆ'}:        -฿${fmt(e.amount)}`)
      }
      lines.push(``)
      lines.push(`ยอดสุทธิ: ฿${fmt(Math.abs(data.netAmount))}`)
      lines.push(isRefund
        ? `→ เจ้าของห้องจะคืนเงินให้ท่าน ฿${fmt(data.netAmount)}`
        : `→ กรุณาชำระส่วนต่างเพิ่ม ฿${fmt(Math.abs(data.netAmount))}`)

      await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [{ type: 'text', text: lines.join('\n') }])
    } else {
      await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [buildCheckoutFlexBubble(data)])
    }
    return { success: true, message: `ส่ง LINE ${mode === 'flex' ? 'Flex Message' : 'ข้อความ'} สำเร็จ` }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}
