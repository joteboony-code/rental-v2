import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyOwner } from '@/lib/notify-owner'
import { bangkokDateKey } from '@/lib/date-utils'

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
  const todayStr      = bangkokDateKey(today)
  const in30          = new Date(today)
  in30.setDate(in30.getDate() + 30)
  const in30Str       = bangkokDateKey(in30)

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select(`id, end_date, monthly_rent, rooms(room_number), tenants(full_name)`)
    .eq('status', 'active')
    .not('end_date', 'is', null)
    .gte('end_date', todayStr)
    .lte('end_date', in30Str)
    .order('end_date')
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: 'Contracts query failed' }, { status: 500 })
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  await notifyOwner(
    lines.join('\n'),
    'expiring_contract',
    appUrl ? { label: 'ดูผู้เช่า', url: `${appUrl}/tenants` } : undefined,
    { strict: true }
  )

  return NextResponse.json({ ok: true, expiring: contracts.length })
}
