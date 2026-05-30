import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('x-cron-secret') === secret || req.nextUrl.searchParams.get('secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

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

const THRESHOLDS = [30, 7, 0] // days before expiry to notify

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 })

  const lineConfig = await getLineMessagingConfig()
  if (!lineConfig?.ownerLineUserId) {
    return NextResponse.json({ ok: false, error: 'owner LINE not configured' })
  }

  const supabase = createServiceClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayThai = thaiDate(todayStr)

  // Get all active contracts with end_date set
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id, end_date,
      rooms   ( room_number ),
      tenants ( full_name )
    `)
    .eq('status', 'active')
    .not('end_date', 'is', null)

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ ok: true, message: 'no active contracts with end_date' })
  }

  type Group = { label: string; emoji: string; items: string[] }
  const groups: Record<number, Group> = {
    30: { label: 'เหลือ 30 วัน', emoji: '⏳', items: [] },
    7:  { label: 'เหลือ 7 วัน',  emoji: '⚠️', items: [] },
    0:  { label: 'หมดสัญญาแล้ว', emoji: '🚨', items: [] },
  }

  for (const contract of contracts) {
    const endDate = new Date(contract.end_date as string)
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    type RJ = { room_number: string }
    type TJ = { full_name: string }
    const room = contract.rooms as unknown as RJ | null
    const tenant = contract.tenants as unknown as TJ | null
    const roomNumber = room?.room_number ?? '—'
    const tenantName = tenant?.full_name ?? '—'
    const endThai = thaiDate(contract.end_date as string)

    for (const threshold of THRESHOLDS) {
      if (daysLeft === threshold) {
        const daysText = threshold === 0 ? 'หมดแล้ว' : `เหลือ ${threshold} วัน`
        groups[threshold].items.push(
          `• ห้อง ${roomNumber} - ${tenantName}\n  สิ้นสุด ${endThai} • ${daysText}`
        )
      }
    }
  }

  const hasAny = THRESHOLDS.some((t) => groups[t].items.length > 0)
  if (!hasAny) return NextResponse.json({ ok: true, message: 'no contracts expiring today' })

  const total = THRESHOLDS.reduce((s, t) => s + groups[t].items.length, 0)
  const lines = [
    `📌 แจ้งเตือนสัญญาเช่าใกล้หมด / หมดสัญญา`,
    `วันที่ตรวจ ${todayThai}`,
  ]

  for (const threshold of THRESHOLDS) {
    const g = groups[threshold]
    if (g.items.length === 0) continue
    lines.push(SEP)
    lines.push(`${g.emoji} ${g.label}`)
    lines.push(...g.items)
  }

  lines.push(SEP)
  lines.push(`รวม ${total} รายการ`)

  try {
    await pushMessage(lineConfig.ownerLineUserId, lineConfig.channelAccessToken, [
      { type: 'text', text: lines.join('\n') },
    ])
    return NextResponse.json({ ok: true, notified: total })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
