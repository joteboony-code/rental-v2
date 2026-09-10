import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getAuthedUser } from '@/lib/require-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const labels: Record<string, string> = {
  accepted: 'LINE รับคำขอแล้ว (ยังไม่ยืนยันการอ่าน)', failed: 'ส่งไม่สำเร็จ — ลองใหม่ได้',
  unknown: 'ไม่ทราบผล — ห้ามส่งซ้ำก่อนตรวจสอบ', sending: 'กำลังส่ง / ถ้าค้างให้ตรวจสอบก่อน',
  skipped: 'ข้ามการส่ง',
}
function reasonLabel(reason: string | null) {
  const reasons: Record<string,string> = {
    no_line_recipient: 'ยังไม่มีผู้รับ LINE', promise_snooze_or_paid: 'มีนัดชำระ / พักแจ้งเตือน / ไม่มียอดค้าง',
    network_or_timeout: 'การเชื่อมต่อขาดหาย ต้องตรวจแชทก่อนส่งซ้ำ',
    line_accepted_not_delivery_receipt: 'LINE รับคำขอแล้ว ยังไม่ใช่การยืนยันว่าอ่าน',
    owner_summary_sent: 'ส่งสรุปเจ้าของแล้ว', owner_summary_uncertain: 'ยังยืนยันผลส่งสรุปไม่ได้',
  }
  if (reason?.startsWith('line_http_')) return `LINE ตอบกลับรหัส ${reason.slice(10)}`
  return reason ? reasons[reason] ?? reason : 'ยังไม่มีผลตอบกลับ'
}

async function retryToday() {
  'use server'
  if (!(await getAuthedUser())) throw new Error('ไม่มีสิทธิ์')
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่างานอัตโนมัติ')
  const { GET } = await import('@/app/api/cron/reminders/route')
  await GET(new NextRequest('https://self/api/cron/reminders', { headers: { 'x-cron-secret': secret } }))
  revalidatePath('/bills/reminder-history')
}

export default async function ReminderHistoryPage() {
  if (!(await getAuthedUser())) redirect('/login')
  const db = await createClient()
  const { data, error } = await db.from('reminder_deliveries')
    .select('id,reminder_date,recipient_key,rooms,amount,status,reason,updated_at')
    .order('reminder_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
  return <main className="space-y-5">
    <Link href="/bills">← กลับหน้าบิล</Link>
    <h1 className="text-2xl font-bold">ประวัติแจ้งเตือนอัตโนมัติ</h1>
    <p>แสดงล่าสุดไม่เกิน 500 รายการ • LINE รับคำขอ ไม่ได้แปลว่าผู้เช่าเปิดอ่านแล้ว</p>
    <form action={retryToday}>
      <button className="rounded-full bg-slate-950 px-5 py-3 text-white">ลองรอบวันนี้อีกครั้ง</button>
      <p className="mt-2 text-sm">ใช้ได้เฉพาะวันส่งที่ตั้งไว้ ส่งเฉพาะรายการที่ยังไม่เคยส่งหรือ LINE ปฏิเสธชัดเจน ไม่ส่งซ้ำรายการที่รับคำขอแล้วหรือไม่ทราบผล</p>
    </form>
    {error ? <p role="alert">ยังอ่านประวัติไม่ได้ กรุณารัน SQL ระบบแจ้งเตือนก่อน</p> : null}
    {!error && !data?.length ? <p>ยังไม่มีประวัติในระบบใหม่</p> : null}
    <div className="space-y-3">{data?.map(row => <section key={row.id} className="rounded-2xl border p-4 space-y-1">
      <h2 className="font-bold">{row.reminder_date} · {row.recipient_key === '__owner_summary' ? 'สรุปเจ้าของ' : `ห้อง ${row.rooms.join(', ')}`}</h2>
      <p>{labels[row.status] ?? row.status}</p>
      <p>ยอด ฿{Number(row.amount).toLocaleString('th-TH')} · {reasonLabel(row.reason)}</p>
    </section>)}</div>
  </main>
}
