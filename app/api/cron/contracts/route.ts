import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('x-cron-secret') === secret || req.nextUrl.searchParams.get('secret') === secret
}

const SEP = '━━━━━━━━━━━━━━'

async function push(to: string, token: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

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

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ ok: true, expiring: 0 })
  }

  // Get LINE config (service role)
  const { data: lineData } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, owner_line_user_id')
    .eq('dorm_id', DEFAULT_DORM_ID)
    .maybeSingle()

  if (!lineData?.encrypted_channel_access_token || !lineData?.owner_line_user_id) {
    return NextResponse.json({ ok: true, expiring: contracts.length, note: 'LINE not configured' })
  }

  const token = await decryptSecret(lineData.encrypted_channel_access_token)
  const owner = lineData.owner_line_user_id

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

  await push(owner, token, lines.join('\n'))

  return NextResponse.json({ ok: true, expiring: contracts.length })
}
