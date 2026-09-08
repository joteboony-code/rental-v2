import { NextRequest, NextResponse } from 'next/server'
import { CRON_JOBS } from '@/lib/cron-runner'
import { notifyOwner } from '@/lib/notify-owner'

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body: unknown = await req.json()
    if (!body || typeof body !== 'object' || !('failed' in body) || !Array.isArray(body.failed)
      || body.failed.length > CRON_JOBS.length || body.failed.some(job => !CRON_JOBS.includes(job))) {
      return NextResponse.json({ error: 'Invalid jobs' }, { status: 400 })
    }
    const labels: Record<string, string> = { reminders: 'แจ้งเตือนค่าเช่า', contracts: 'แจ้งสัญญาหมดอายุ', 'daily-summary': 'สรุปประจำวัน', backup: 'สำรองข้อมูล' }
    const names = body.failed.map(job => labels[job]).join(', ')
    await notifyOwner(`⚠️ งานอัตโนมัติทำงานไม่ครบ\n${names}\nดูรายละเอียดที่ ตั้งค่า → สำรองข้อมูล → งานอัตโนมัติ`, undefined, undefined, { strict: true })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Owner alert failed' }, { status: 502 })
  }
}
