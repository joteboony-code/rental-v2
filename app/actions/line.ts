'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { roomRow } from '@/lib/room-utils'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { buildBillPortalUrl, buildTenantPortalUrl } from '@/lib/portal-url'
import { getAuthedUser } from '@/lib/require-admin'
import { logAudit } from './audit'

// ── helpers ──────────────────────────────────────────────────────────
function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

function thaiDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

const PAID_BILL_NOTIFY_BLOCK_MESSAGE = 'บิลนี้ชำระแล้ว ไม่สามารถส่งใบแจ้งค่าเช่าได้'

function billRemaining(totalAmount: unknown, payments: { amount: unknown }[] | null | undefined) {
  const paid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
  return Math.max(0, Number(totalAmount) - paid)
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
  meterRecordedAt?: string | null
}) {
  const rows: object[] = [
    {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'text', text: '👤 ' + data.tenantName, color: '#64748B', size: 'sm', flex: 1 },
      ],
    },
    ...(data.meterRecordedAt ? [{
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'text', text: 'วันที่จดมิเตอร์', color: '#94A3B8', size: 'xs', flex: 1 },
        { type: 'text', text: thaiDate(data.meterRecordedAt), color: '#64748B', size: 'xs', align: 'end' },
      ],
    }] : []),
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

// ── Types and helpers for multi-room combined statements ──────────────────────

type RoomStatement = {
  billId: string
  roomNumber: string
  floor: number | null
  billingMonth: string
  dueDate: string
  rentAmt: number
  waterAmt: number
  elecAmt: number
  wifiAmt: number
  trashAmt: number
  otherAmt: number
  otherNote: string | null
  currentTotal: number
  meterRecordedAt: string | null
  overdueBills: { billId: string; billingMonth: string; remaining: number }[]
  overdueTotal: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRoomStatements(supabase: any, tenantId: string): Promise<{
  rooms: RoomStatement[]
  grandTotal: number
  earliestDueDate: string
}> {
  const { data: rawBills } = await supabase
    .from('bills')
    .select(`
      id, billing_month, due_date,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note,
      total_amount,
      rooms ( room_number, floor ),
      meter_readings ( reading_date, created_at ),
      payments ( amount )
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: false })

  type PayJ = { amount: number }
  type BillFull = {
    id: string; billing_month: string; due_date: string
    rent_amount: number; water_amount: number; electricity_amount: number
    wifi_amount: number; trash_amount: number; other_amount: number; other_note: string | null
    total_amount: number
    rooms: { room_number: string; floor: number | null } | null
    meter_readings: { reading_date: string | null; created_at: string } | null
    payments: PayJ[] | null
  }

  const allBills = (rawBills ?? []) as unknown as BillFull[]

  // Group by room; bills already sorted newest → oldest
  const byRoom = new Map<string, BillFull[]>()
  for (const b of allBills) {
    const rn = b.rooms?.room_number ?? '?'
    if (!byRoom.has(rn)) byRoom.set(rn, [])
    byRoom.get(rn)!.push(b)
  }

  const rooms: RoomStatement[] = []
  for (const [, roomBills] of byRoom) {
    const main  = roomBills[0]
    const older = roomBills.slice(1)

    // Reverse older bills so overdue is listed oldest → newest
    const overdueBills = [...older].reverse()
      .map((b) => {
        const paid      = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
        const remaining = Math.max(0, Number(b.total_amount) - paid)
        return { billId: b.id, billingMonth: b.billing_month, remaining }
      })
      .filter((o) => o.remaining >= 1)

    rooms.push({
      billId:      main.id,
      roomNumber:  main.rooms?.room_number ?? '?',
      floor:       main.rooms?.floor ?? null,
      billingMonth: main.billing_month,
      dueDate:     main.due_date,
      rentAmt:     Number(main.rent_amount),
      waterAmt:    Number(main.water_amount),
      elecAmt:     Number(main.electricity_amount),
      wifiAmt:     Number(main.wifi_amount),
      trashAmt:    Number(main.trash_amount),
      otherAmt:    Number(main.other_amount),
      otherNote:   main.other_note,
      currentTotal: Number(main.total_amount),
      meterRecordedAt: main.meter_readings?.reading_date ?? main.meter_readings?.created_at ?? null,
      overdueBills,
      overdueTotal: overdueBills.reduce((s, o) => s + o.remaining, 0),
    })
  }

  rooms.sort((a, b) => {
    const na = parseInt(a.roomNumber) || 0
    const nb = parseInt(b.roomNumber) || 0
    return na - nb || a.roomNumber.localeCompare(b.roomNumber)
  })

  const grandTotal      = rooms.reduce((s, r) => s + r.currentTotal + r.overdueTotal, 0)
  const dueDates        = rooms.map((r) => r.dueDate).filter(Boolean).sort()
  const earliestDueDate = dueDates[0] ?? new Date().toISOString().slice(0, 10)

  return { rooms, grandTotal, earliestDueDate }
}

function buildCombinedFlexBubble(data: {
  tenantName:      string
  rooms:           RoomStatement[]
  grandTotal:      number
  earliestDueDate: string
  portalUrl:       string
}): object {
  const body: object[] = []

  for (let i = 0; i < data.rooms.length; i++) {
    const r = data.rooms[i]
    if (i > 0) body.push({ type: 'separator', margin: 'xl', color: '#CBD5E1' })

    // Room header pill
    body.push({
      type: 'box', layout: 'vertical', spacing: 'none',
      backgroundColor: '#F1F5F9', cornerRadius: '8px',
      paddingStart: '12px', paddingEnd: '12px', paddingTop: '8px', paddingBottom: '8px',
      contents: [{
        type: 'text',
        text: `🏠 ห้อง ${r.roomNumber} · แถวที่ ${roomRow(r.roomNumber)}`,
        weight: 'bold', size: 'sm', color: '#0F172A',
      }],
    })

    // ── Overdue first (oldest → newest) ────────────────────────────────────────
    if (r.overdueBills.length > 0) {
      const odRows: object[] = [
        { type: 'text', text: `⚠️ ยอดค้างเก่า ห้อง ${r.roomNumber}`, size: 'xs', color: '#DC2626', weight: 'bold' },
      ]
      for (const od of r.overdueBills) {
        odRows.push({
          type: 'box', layout: 'horizontal', margin: 'sm',
          contents: [
            { type: 'text', text: `ค้างเดือน ${thaiMonth(od.billingMonth)}`, size: 'xs', color: '#64748B', flex: 1 },
            { type: 'text', text: '฿' + fmt(od.remaining), size: 'xs', color: '#DC2626', align: 'end', weight: 'bold' },
          ],
        })
      }
      body.push({
        type: 'box', layout: 'vertical', margin: 'sm',
        backgroundColor: '#FEF2F2', cornerRadius: '8px', paddingAll: '10px',
        contents: odRows,
      })
    }

    // ── Current billing period — shown last ────────────────────────────────────
    body.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'รอบบิล', size: 'xs', color: '#94A3B8', flex: 1 },
        { type: 'text', text: thaiMonth(r.billingMonth), size: 'xs', color: '#64748B', align: 'end' },
      ],
    })
    body.push(billRow('ค่าเช่า', r.rentAmt))
    body.push(billRow('💧 ค่าน้ำ',  r.waterAmt, '#2563EB'))
    body.push(billRow('⚡ ค่าไฟ',   r.elecAmt,  '#D97706'))
    if (r.wifiAmt  > 0) body.push(billRow('📶 ค่า WiFi', r.wifiAmt, '#4F46E5'))
    body.push(billRow('🗑️ ค่าขยะ', r.trashAmt, '#64748B'))
    if (r.otherAmt > 0) body.push(billRow(`📦 ${r.otherNote || 'ค่าอื่น ๆ'}`, r.otherAmt))

    // Room total = current bill + overdue
    const roomTotal = r.currentTotal + r.overdueTotal
    body.push({ type: 'separator', margin: 'md', color: '#E2E8F0' })
    body.push({
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: `รวมห้อง ${r.roomNumber}`, weight: 'bold', size: 'sm', color: '#0F172A', flex: 1 },
        { type: 'text', text: '฿' + fmt(roomTotal), weight: 'bold', size: 'md', color: '#0F172A', align: 'end' },
      ],
    })
  }

  // Grand total
  body.push({ type: 'separator', margin: 'xl', color: '#94A3B8' })
  body.push({
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: 'ยอดรวมทั้งหมด', weight: 'bold', size: 'md', color: '#0F172A', flex: 1 },
      { type: 'text', text: '฿' + fmt(data.grandTotal), weight: 'bold', size: 'xl', color: '#0F172A', align: 'end' },
    ],
  })
  body.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'ครบกำหนด', size: 'xs', color: '#94A3B8', flex: 1 },
      {
        type: 'text',
        text: new Date(data.earliestDueDate).toLocaleDateString('th-TH', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok',
        }),
        size: 'xs', color: '#EF4444', align: 'end',
      },
    ],
  })

  return {
    type: 'flex',
    altText: `แจ้งค่าเช่า ${data.tenantName} รวม ${data.rooms.length} ห้อง ฿${fmt(data.grandTotal)}`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#0C1B4D', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'แจ้งค่าเช่า', color: '#94A3B8', size: 'xs', weight: 'bold' },
          { type: 'text', text: data.tenantName, color: '#FFFFFF', size: 'xl', weight: 'bold' },
          { type: 'text', text: `${data.rooms.length} ห้อง · รวม ฿${fmt(data.grandTotal)}`, color: '#64748B', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
        contents: body,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#F8FAFC',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: '🔗 ดูบิล / ชำระเงิน', uri: data.portalUrl },
          style: 'primary', color: '#0C1B4D', height: 'sm',
        }],
      },
    },
  }
}

// ── Main action ──────────────────────────────────────────────────────
export async function sendLineBillNotification(
  billId: string,
  mode: 'text' | 'flex'
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

  // Re-fetch the latest bill state before every send; stale bill pages can stay open for days.
  const { data: bill } = await supabase
    .from('bills')
    .select(`
      *,
      rooms   ( room_number, floor ),
      tenants ( full_name, line_user_id ),
      meter_readings ( reading_date, created_at ),
      payments ( amount )
    `)
    .eq('id', billId)
    .single()

  if (!bill) return { success: false, message: 'ไม่พบบิล' }

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; line_user_id: string | null }
  type MeterJoin  = { reading_date: string | null; created_at: string } | null

  const room   = bill.rooms   as unknown as RoomJoin   | null
  const tenant = bill.tenants as unknown as TenantJoin | null
  const meter  = bill.meter_readings as unknown as MeterJoin
  const remaining = billRemaining(bill.total_amount, bill.payments as { amount: unknown }[] | null)

  if (bill.status === 'paid' || remaining <= 0) {
    return { success: false, message: PAID_BILL_NOTIFY_BLOCK_MESSAGE }
  }

  if (!tenant?.line_user_id) {
    return { success: false, message: 'ผู้เช่าไม่มี LINE User ID — กรุณาเพิ่มในข้อมูลผู้เช่า' }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token ในหน้าตั้งค่า' }
  }

  // ── Multi-room: send combined statement ──────────────────────────────────────
  const auditLineBillSent = (extra: Record<string, unknown> = {}) => {
    logAudit({
      action: 'line_bill_sent',
      entityType: 'bill',
      entityId: billId,
      tenantId: (bill.tenant_id as string | null) ?? null,
      roomId: (bill.room_id as string | null) ?? null,
      newValue: {
        bill_id: billId,
        room_id: (bill.room_id as string | null) ?? null,
        tenant_id: (bill.tenant_id as string | null) ?? null,
        billing_month: bill.billing_month,
        remaining,
        sent_by: user?.id ?? null,
        mode,
        ...extra,
      },
      description: `ส่ง LINE แจ้งค่าเช่า ${thaiMonth(bill.billing_month)} ยอดค้าง ฿${fmt(remaining)}`,
    }).catch(() => {})
  }

  const { rooms: allRooms, grandTotal: allTotal, earliestDueDate } =
    await fetchRoomStatements(supabase, bill.tenant_id as string)
  if (allRooms.length >= 2) {
    const combinedUrl = buildTenantPortalUrl(lineConfig.liffId, lineConfig.appUrl)
    try {
      if (mode === 'flex') {
        await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [
          buildCombinedFlexBubble({ tenantName: tenant.full_name, rooms: allRooms, grandTotal: allTotal, earliestDueDate, portalUrl: combinedUrl }),
        ])
      } else {
        const lines = [`📋 แจ้งค่าเช่า — ${tenant.full_name}  (${allRooms.length} ห้อง)`, '']
        for (const r of allRooms) {
          lines.push(`🏠 ห้อง ${r.roomNumber} แถวที่ ${roomRow(r.roomNumber)} — ${thaiMonth(r.billingMonth)}`)
          lines.push(`   ค่าเช่า ฿${fmt(r.rentAmt)} · น้ำ ฿${fmt(r.waterAmt)} · ไฟ ฿${fmt(r.elecAmt)}`)
          if (r.wifiAmt  > 0) lines.push(`   WiFi ฿${fmt(r.wifiAmt)}`)
          lines.push(`   ขยะ ฿${fmt(r.trashAmt)}`)
          if (r.otherAmt > 0) lines.push(`   ${r.otherNote || 'ค่าอื่น ๆ'} ฿${fmt(r.otherAmt)}`)
          lines.push(`   รวม ฿${fmt(r.currentTotal)}`)
          for (const od of r.overdueBills) lines.push(`   ⚠️ ค้าง ${thaiMonth(od.billingMonth)} ฿${fmt(od.remaining)}`)
          lines.push('')
        }
        lines.push(`💰 ยอดรวมทั้งหมด ฿${fmt(allTotal)}`)
        lines.push(`🔗 ${combinedUrl}`)
        await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [{ type: 'text', text: lines.join('\n') }])
      }
      auditLineBillSent({ combined_room_count: allRooms.length })
      return { success: true, message: `ส่ง LINE ${mode === 'flex' ? 'Flex' : 'ข้อความ'} รวม ${allRooms.length} ห้อง สำเร็จ` }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  }
  // ── end multi-room ───────────────────────────────────────────────────────────

  const month      = thaiMonth(bill.billing_month)
  const portalUrl  = buildBillPortalUrl(billId, lineConfig.liffId, lineConfig.appUrl)
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
        meterRecordedAt: meter?.reading_date ?? meter?.created_at ?? null,
      })
      await pushMessage(tenant.line_user_id, lineConfig.channelAccessToken, [flexMsg])
    }

    auditLineBillSent()
    return { success: true, message: `ส่ง LINE ${mode === 'flex' ? 'Flex Message' : 'ข้อความ'} สำเร็จ` }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}

// ── Payment confirmed notification ──────────────────────────────────────────

export async function sendPaymentConfirmedNotification(
  billId: string
): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
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
  // ตรวจสิทธิ์ชัดเจน (defense-in-depth) — broadcast ยิงหาผู้เช่าทุกคน เปลืองโควต้า LINE
  if (!(await getAuthedUser())) return { success: false, sent: 0, failed: 0, message: 'ไม่มีสิทธิ์ใช้งาน' }

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

  logAudit({ action: 'broadcast_sent', description: `ส่งประกาศถึง ${sent} ห้อง: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}` }).catch(() => {})

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, sent: 0, failed: 0, message: 'ไม่มีสิทธิ์ใช้งาน' }

  // Get all pending/overdue bills for this month with tenant LINE IDs
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id, tenant_id, room_id, status,
      rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount,
      total_amount, due_date, billing_month,
      rooms   ( room_number, floor ),
      tenants ( full_name, line_user_id ),
      meter_readings ( reading_date, created_at ),
      payments ( amount )
    `)
    .eq('billing_month', billingMonth)
    .in('status', ['pending', 'overdue'])

  if (!bills || bills.length === 0) {
    return { success: false, sent: 0, failed: 0, message: 'ไม่มีบิลที่รอชำระในเดือนนี้' }
  }

  const payableBills = bills.filter((bill) => {
    const remaining = billRemaining(bill.total_amount, bill.payments as { amount: unknown }[] | null)
    return bill.status !== 'paid' && remaining > 0
  })

  if (payableBills.length === 0) {
    return { success: false, sent: 0, failed: 0, message: PAID_BILL_NOTIFY_BLOCK_MESSAGE }
  }

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig) {
    return { success: false, sent: 0, failed: 0, message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' }
  }

  let sent = 0
  let failed = 0

  type TenantJ = { full_name: string; line_user_id: string | null }
  type RoomJ   = { room_number: string; floor: number | null }
  type MeterJ  = { reading_date: string | null; created_at: string } | null

  const auditBulkLineBillSent = (bill: (typeof payableBills)[number], extra: Record<string, unknown> = {}) => {
    const remaining = billRemaining(bill.total_amount, bill.payments as { amount: unknown }[] | null)
    logAudit({
      action: 'line_bill_sent',
      entityType: 'bill',
      entityId: bill.id as string,
      tenantId: (bill.tenant_id as string | null) ?? null,
      roomId: (bill.room_id as string | null) ?? null,
      newValue: {
        bill_id: bill.id,
        room_id: (bill.room_id as string | null) ?? null,
        tenant_id: (bill.tenant_id as string | null) ?? null,
        billing_month: bill.billing_month,
        remaining,
        sent_by: user?.id ?? null,
        mode,
        bulk: true,
        ...extra,
      },
      description: `LINE bill notification ${thaiMonth(bill.billing_month as string)} remaining ${fmt(remaining)}`,
    }).catch(() => {})
  }

  // Group by line_user_id (fallback to tenant_id) — prevents duplicate sends for tenants with multiple rooms
  const byLineUser = new Map<string, {
    lineUserId: string | null
    tenantName: string
    tenantIds: Set<string>
    bills: (typeof payableBills)[number][]
  }>()

  for (const bill of payableBills) {
    const tenant     = bill.tenants as unknown as TenantJ | null
    const lineUserId = tenant?.line_user_id ?? null
    const tid        = bill.tenant_id as string
    const groupKey   = lineUserId ?? tid

    if (!byLineUser.has(groupKey)) {
      byLineUser.set(groupKey, { lineUserId, tenantName: tenant?.full_name ?? '—', tenantIds: new Set(), bills: [] })
    }
    const grp = byLineUser.get(groupKey)!
    grp.tenantIds.add(tid)
    grp.bills.push(bill)
    if (tenant?.full_name) grp.tenantName = tenant.full_name
  }

  for (const [, grp] of byLineUser) {
    const { lineUserId } = grp
    if (!lineUserId) { failed += grp.bills.length; continue }

    // Merge outstanding room statements across all tenant IDs linked to this LINE user
    const allStmtRooms: RoomStatement[] = []
    let allGrandTotal = 0
    let allEarliestDue = ''
    for (const tid of grp.tenantIds) {
      const { rooms: stmtRooms, grandTotal, earliestDueDate } =
        await fetchRoomStatements(supabase, tid)
      allStmtRooms.push(...stmtRooms)
      allGrandTotal += grandTotal
      if (!allEarliestDue || (earliestDueDate && earliestDueDate < allEarliestDue)) {
        allEarliestDue = earliestDueDate
      }
    }
    allStmtRooms.sort((a, b) => {
      const na = parseInt(a.roomNumber) || 0
      const nb = parseInt(b.roomNumber) || 0
      return na - nb || a.roomNumber.localeCompare(b.roomNumber)
    })

    if (mode === 'flex' && allStmtRooms.length >= 2) {
      // Multi-room → one combined Flex
      const portalUrl = buildTenantPortalUrl(lineConfig.liffId, lineConfig.appUrl)
      try {
        await pushMessage(lineUserId, lineConfig.channelAccessToken, [
          buildCombinedFlexBubble({
            tenantName: grp.tenantName,
            rooms: allStmtRooms,
            grandTotal: allGrandTotal,
            earliestDueDate: allEarliestDue,
            portalUrl,
          }),
        ])
        sent += grp.bills.length
        grp.bills.forEach((bill) => auditBulkLineBillSent(bill, { combined_room_count: allStmtRooms.length }))
      } catch {
        failed += grp.bills.length
      }
      continue
    }

    // Single room (or text mode) → per-bill behavior
    for (const bill of grp.bills) {
      const room       = bill.rooms         as unknown as RoomJ  | null
      const meter      = bill.meter_readings as unknown as MeterJ
      const month      = thaiMonth(bill.billing_month as string)
      const portalUrl  = buildBillPortalUrl(bill.id, lineConfig.liffId, lineConfig.appUrl)
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
          if (Number(bill.wifi_amount)  > 0) lines.push(`ค่า WiFi: ฿${fmt(Number(bill.wifi_amount))}`)
          lines.push(`ค่าขยะ:  ฿${fmt(Number(bill.trash_amount))}`)
          if (Number(bill.other_amount) > 0) lines.push(`อื่นๆ:   ฿${fmt(Number(bill.other_amount))}`)
          lines.push(``, `รวม: ฿${fmt(Number(bill.total_amount))}`)
          lines.push(`ครบกำหนด: ${new Date(bill.due_date as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`)
          lines.push(``, `🔗 ดูบิล: ${portalUrl}`)
          await pushMessage(lineUserId, lineConfig.channelAccessToken, [{ type: 'text', text: lines.join('\n') }])
        } else {
          const flexMsg = buildFlexBubble({
            roomNumber,
            floor,
            tenantName:  grp.tenantName,
            month,
            dueDate:     bill.due_date as string,
            rentAmt:     Number(bill.rent_amount),
            waterAmt:    Number(bill.water_amount),
            elecAmt:     Number(bill.electricity_amount),
            wifiAmt:     Number(bill.wifi_amount),
            trashAmt:    Number(bill.trash_amount),
            totalAmt:    Number(bill.total_amount),
            portalUrl,
            meterRecordedAt: meter?.reading_date ?? meter?.created_at ?? null,
          })
          await pushMessage(lineUserId, lineConfig.channelAccessToken, [flexMsg])
        }
        sent++
        auditBulkLineBillSent(bill)
      } catch {
        failed++
      }
    }
  }

  const msg = `ส่งสำเร็จ ${sent} ห้อง${failed > 0 ? ` · ส่งไม่ได้ ${failed} ห้อง (ไม่มี LINE)` : ''}`
  return { success: true, sent, failed, message: msg }
}

export async function sendCheckoutLineNotification(
  data: CheckoutLineData,
  mode: 'text' | 'flex'
): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

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
