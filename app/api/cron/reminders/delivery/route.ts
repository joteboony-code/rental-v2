import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { sendTrackedReminder } from '@/lib/reminder-delivery'

const schema = z.object({
  row: z.object({
    reminder_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    recipient_key: z.string().min(1).max(128), rooms: z.array(z.string()).max(100),
    bill_ids: z.array(z.string().uuid()).max(2000), amount: z.number().finite().nonnegative(),
  }),
  to: z.string().min(1).max(128), messages: z.array(z.record(z.string(), z.unknown())).min(1).max(5),
})

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || parsed.data.row.recipient_key !== parsed.data.to) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date())
  if (parsed.data.row.reminder_date !== today) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    const config = await getLineMessagingConfig()
    if (!config) return NextResponse.json({ ok: false }, { status: 503 })
    const result = await sendTrackedReminder(createServiceClient(), parsed.data.row, parsed.data.to, config.channelAccessToken, parsed.data.messages)
    return NextResponse.json({ ok: true, result })
  } catch {
    return NextResponse.json({ ok: false, error: 'Delivery needs review' }, { status: 503 })
  }
}
