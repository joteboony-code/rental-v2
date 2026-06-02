import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('x-cron-secret') === secret || req.nextUrl.searchParams.get('secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

async function pushMessage(to: string, token: string, messages: object[]) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig?.ownerLineUserId) {
    return NextResponse.json({ ok: true, skipped: 'no owner LINE configured' })
  }

  const today = new Date().toISOString().split('T')[0]
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const in30Str = in30.toISOString().split('T')[0]

  const [
    { data: unpaidBills },
    { data: dueToday },
    { count: pendingSlipCount },
    { count: openRepairCount },
    { data: expiringContracts },
    { data: promisesToday },
  ] = await Promise.all([
    // บิลค้างชำระทุกเดือน (ดึง room_number มาด้วย)
    supabase.from('bills').select('total_amount, status, rooms(room_number), payments(amount)').in('status', ['pending', 'overdue']),
    // บิลครบกำหนดวันนี้
    supabase.from('bills').select('id').in('status', ['pending', 'overdue']).eq('due_date', today),
    // สลิปรอตรวจ
    supabase.from('pending_slips').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    // แจ้งซ่อมค้าง
    supabase.from('repair_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    // สัญญาใกล้หมดอายุภายใน 30 วัน
    supabase.from('contracts').select('id, end_date, rooms(room_number)').eq('status', 'active')
      .not('end_date', 'is', null).gte('end_date', today).lte('end_date', in30Str),
    // นัดจ่ายวันนี้
    supabase.from('payment_promises').select('id, rooms(room_number)').eq('status', 'active').eq('promise_date', today),
  ])

  // คำนวณยอดค้างจริง
  type PJ = { amount: number }
  type BJ = { total_amount: number; status: string; rooms: { room_number: string } | null; payments: PJ[] | null }
  const unpaid = (unpaidBills ?? []) as unknown as BJ[]

  // รวมยอดค้างต่อห้อง (หลายบิลในห้องเดียวรวมเข้าด้วยกัน)
  const roomMap = new Map<string, number>()
  let totalOwed = 0
  let unpaidCount = 0
  for (const b of unpaid) {
    const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Math.max(0, Number(b.total_amount) - paid)
    if (remaining >= 1) {
      totalOwed += remaining
      unpaidCount++
      const rn = b.rooms?.room_number ?? '?'
      roomMap.set(rn, (roomMap.get(rn) ?? 0) + remaining)
    }
  }

  // เรียงห้องตามเลขห้อง แล้วแสดง รายการ
  const roomLines = [...roomMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'th', { numeric: true }))
    .map(([room, amt]) => `  • ห้อง ${room}  ฿${fmt(amt)}`)

  const lines: string[] = [
    '📌 สรุปประจำวัน',
    `🗓️ ${thaiDate(new Date())}`,
    SEP,
    `💰 ค้างชำระ: ${unpaidCount} บิล รวม ${fmt(totalOwed)} บาท`,
    ...roomLines,
    `📅 ครบกำหนดวันนี้: ${(dueToday ?? []).length} บิล`,
    `📥 สลิปรอตรวจ: ${pendingSlipCount ?? 0} รายการ`,
    `🔧 แจ้งซ่อมค้าง: ${openRepairCount ?? 0} งาน`,
    `📄 สัญญาใกล้หมดอายุ: ${(expiringContracts ?? []).length} ห้อง`,
  ]

  if ((promisesToday ?? []).length > 0) {
    const rooms = (promisesToday ?? [])
      .map((p) => (p.rooms as unknown as { room_number: string } | null)?.room_number)
      .filter(Boolean).join(', ')
    lines.push(`🤝 นัดจ่ายวันนี้: ${(promisesToday ?? []).length} ห้อง (${rooms})`)
  }

  if (lineConfig.appUrl) {
    lines.push(SEP)
    if ((pendingSlipCount ?? 0) > 0) lines.push(`🔗 ตรวจสลิป: ${lineConfig.appUrl}/payment-reviews`)
  }

  try {
    await pushMessage(lineConfig.ownerLineUserId, lineConfig.channelAccessToken, [
      { type: 'text', text: lines.join('\n') },
    ])
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }

  return NextResponse.json({
    ok: true,
    unpaidCount, totalOwed,
    dueToday: (dueToday ?? []).length,
    pendingSlips: pendingSlipCount ?? 0,
    openRepairs: openRepairCount ?? 0,
    expiringContracts: (expiringContracts ?? []).length,
  })
}
