import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { notifyOwner } from '@/lib/notify-owner'
import { bangkokDateKey } from '@/lib/date-utils'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('x-cron-secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const lineConfig = await getLineMessagingConfig()

  const todayStr = bangkokDateKey()

  // Guard: ป้องกันส่งซ้ำในวันเดิม
  const { data: alreadySent } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('action', 'cron_daily_summary_sent')
    .gte('created_at', `${todayStr}T00:00:00+07:00`)
    .lte('created_at', `${todayStr}T23:59:59+07:00`)
    .maybeSingle()
  if (alreadySent) {
    return NextResponse.json({ ok: true, skipped: 'already sent today' })
  }

  const today = todayStr
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const in30Str = bangkokDateKey(in30)

  const [
    { data: unpaidBills },
    { data: dueToday },
    { count: pendingSlipCount },
    { count: openRepairCount },
    { data: expiringContracts },
    { data: promisesToday },
  ] = await Promise.all([
    // บิลค้างชำระทุกเดือน (ดึง room_number + billing_month มาด้วย)
    supabase.from('bills').select('total_amount, status, billing_month, rooms(room_number), payments(amount)').in('status', ['pending', 'overdue']).order('billing_month', { ascending: true }).limit(2000),
    // บิลครบกำหนดวันนี้
    supabase.from('bills').select('id').in('status', ['pending', 'overdue']).eq('due_date', today).limit(2000),
    // สลิปรอตรวจ
    supabase.from('pending_slips').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    // แจ้งซ่อมค้าง
    supabase.from('repair_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    // สัญญาใกล้หมดอายุภายใน 30 วัน
    supabase.from('contracts').select('id, end_date, rooms(room_number)').eq('status', 'active')
      .not('end_date', 'is', null).gte('end_date', today).lte('end_date', in30Str).limit(500),
    // นัดจ่ายวันนี้
    supabase.from('payment_promises').select('id, rooms(room_number)').eq('status', 'active').eq('promise_date', today).limit(500),
  ])

  // คำนวณยอดค้างจริงแยกรายบิล
  type PJ = { amount: number }
  type BJ = { total_amount: number; status: string; billing_month: string | null; rooms: { room_number: string } | null; payments: PJ[] | null }
  const unpaid = (unpaidBills ?? []) as unknown as BJ[]

  type BillEntry = { room: string; month: string; remaining: number }
  const billEntries: BillEntry[] = []
  let totalOwed = 0
  let unpaidCount = 0
  for (const b of unpaid) {
    const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Math.max(0, Number(b.total_amount) - paid)
    if (remaining >= 1) {
      totalOwed += remaining
      unpaidCount++
      billEntries.push({
        room: b.rooms?.room_number ?? '?',
        month: b.billing_month ?? '',
        remaining,
      })
    }
  }

  // จัดกลุ่มตามเดือน เรียงตามเดือน → ห้อง
  const thaiMonthLong = (s: string) => s
    ? new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    : ''

  billEntries.sort((a, b) =>
    a.month.localeCompare(b.month) || a.room.localeCompare(b.room, 'th', { numeric: true })
  )

  // จัด map เดือน → รายการห้อง
  const byMonth = new Map<string, BillEntry[]>()
  for (const e of billEntries) {
    if (!byMonth.has(e.month)) byMonth.set(e.month, [])
    byMonth.get(e.month)!.push(e)
  }

  const roomLines: string[] = []
  for (const [month, entries] of byMonth) {
    const monthTotal = entries.reduce((s, e) => s + e.remaining, 0)
    roomLines.push(`📅 ${thaiMonthLong(month)} ค้าง ฿${fmt(monthTotal)}`)
    for (const { room, remaining } of entries) {
      roomLines.push(`  • ห้อง ${room}  ฿${fmt(remaining)}`)
    }
  }

  const dueTodayCount = (dueToday ?? []).length
  const slipCount = pendingSlipCount ?? 0
  const repairCount = openRepairCount ?? 0
  const expiringContractCount = (expiringContracts ?? []).length
  const promisesTodayCount = (promisesToday ?? []).length

  if (unpaidCount === 0) {
    return NextResponse.json({
      ok: true,
      skipped: 'no unpaid bills',
      unpaidCount,
      totalOwed,
      dueToday: dueTodayCount,
      pendingSlips: slipCount,
      openRepairs: repairCount,
      expiringContracts: expiringContractCount,
    })
  }

  const lines: string[] = [
    '📌 สรุปประจำวัน',
    `🗓️ ${thaiDate(new Date())}`,
    SEP,
  ]

  lines.push(`💰 ค้างชำระ: ${unpaidCount} บิล รวม ${fmt(totalOwed)} บาท`)
  lines.push(...roomLines)

  if (dueTodayCount > 0) {
    lines.push(`📅 ครบกำหนดวันนี้: ${dueTodayCount} บิล`)
  }

  if (slipCount > 0) {
    lines.push(`📥 สลิปรอตรวจ: ${slipCount} รายการ`)
  }

  if (repairCount > 0) {
    lines.push(`🔧 แจ้งซ่อมค้าง: ${repairCount} งาน`)
  }

  if (expiringContractCount > 0) {
    lines.push(`📄 สัญญาใกล้หมดอายุ: ${expiringContractCount} ห้อง`)
  }

  if (promisesTodayCount > 0) {
    const rooms = (promisesToday ?? [])
      .map((p) => (p.rooms as unknown as { room_number: string } | null)?.room_number)
      .filter(Boolean).join(', ')
    lines.push(`🤝 นัดจ่ายวันนี้: ${promisesTodayCount} ห้อง (${rooms})`)
  }

  // แจ้งเตือนต่ออายุ SlipOK ทุกวันที่ 20
  if (parseInt(todayStr.split('-')[2]) === 20) {
    lines.push(SEP)
    lines.push('⚠️ วันนี้ครบกำหนดต่ออายุ SlipOK')
    lines.push('กรุณาต่อสมาชิกที่ SlipOK Bot ด้วยครับ')
  }

  const reviewUrl =
    lineConfig?.appUrl && slipCount > 0
      ? `${lineConfig.appUrl}/payment-reviews`
      : null

  // Claim via audit log BEFORE sending — unique index on (date, action) rejects concurrent duplicates
  const { error: auditErr } = await supabase.from('audit_logs').insert({
    action:      'cron_daily_summary_sent',
    entity_type: 'cron',
    description: `ส่งสรุปประจำวัน: ค้าง ${unpaidCount} บิล ฿${totalOwed}`,
    new_value:   { unpaidCount, totalOwed, date: todayStr },
  })
  if (auditErr) {
    return NextResponse.json({ ok: true, skipped: 'already sent today' })
  }

  try {
    await notifyOwner(
      lines.join('\n'),
      'daily_summary',
      reviewUrl ? { label: 'ตรวจสลิป', url: reviewUrl } : undefined
    )
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }

  return NextResponse.json({
    ok: true,
    unpaidCount, totalOwed,
    dueToday: dueTodayCount,
    pendingSlips: slipCount,
    openRepairs: repairCount,
    expiringContracts: expiringContractCount,
  })
}
