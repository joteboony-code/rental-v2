import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyOwner } from '@/lib/notify-owner'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('x-cron-secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const today         = new Date()
  const todayStr      = today.toISOString().split('T')[0]
  const in30          = new Date(today)
  in30.setDate(in30.getDate() + 30)
  const in30Str       = in30.toISOString().split('T')[0]

  const { data: contracts } = await supabase
    .from('contracts')
    .select(`id, end_date, monthly_rent, rooms(room_number), tenants(full_name)`)
    .eq('status', 'active')
    .not('end_date', 'is', null)
    .gte('end_date', todayStr)
    .lte('end_date', in30Str)
    .order('end_date')
    .limit(500)

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ ok: true, expiring: 0 })
  }

  type RJ = { room_number: string }
  type TJ = { full_name: string }

  const lines = [
    `📋 สัญญาใกล้หมดอายุ`,
    `${SEP}`,
    `🗓️ วันนี้: ${today.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    ``,
    ...contracts.map((c) => {
      const room   = c.rooms   as unknown as RJ | null
      const tenant = c.tenants as unknown as TJ | null
      const endDate = new Date(c.end_date as string)
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
      const endStr = endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      return `🏠 ห้อง ${room?.room_number ?? '—'} — ${tenant?.full_name ?? '—'}\n    หมดสัญญา ${endStr} (เหลือ ${daysLeft} วัน)`
    }),
    `${SEP}`,
    `รวม ${contracts.length} ห้อง`,
  ]

  await notifyOwner(lines.join('\n'))

  return NextResponse.json({ ok: true, expiring: contracts.length })
}
