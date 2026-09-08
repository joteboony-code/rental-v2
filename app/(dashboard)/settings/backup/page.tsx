import Link from 'next/link'
import { ChevronLeft, Cloud, DatabaseBackup, FileArchive, ShieldCheck } from 'lucide-react'
import { BackupNowButton } from '../_components/backup-now-button'
import { getBackupBucket, getBackupOverview, getCronOverview, type BackupSummary } from '@/lib/backup'

const dateTime = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: BackupSummary['status'] }) {
  const styles = {
    running: 'bg-amber-50 text-amber-700 ring-amber-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  } as const
  const labels = { running: 'กำลังทำงาน', success: 'สำเร็จ', failed: 'ไม่สำเร็จ' } as const
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default async function BackupSettingsPage() {
  let configured = true
  let latest: BackupSummary | null = null
  let history: BackupSummary[] = []
  let cron: Awaited<ReturnType<typeof getCronOverview>> = null

  try {
    const bucket = await getBackupBucket()
    const [overview, cronOverview] = await Promise.all([
      getBackupOverview(bucket), getCronOverview(bucket),
    ])
    cron = cronOverview
    latest = overview.latest
    history = overview.history
  } catch {
    configured = false
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/settings" className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-700">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100">
            <DatabaseBackup className="size-5 text-sky-700" />
          </div>
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">ตั้งค่า</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">สำรองข้อมูล</h1>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Cloud className="size-4 text-sky-600" />
              <h2 className="text-sm font-semibold text-slate-800">Cloudflare R2</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              สำรองทุกวัน เวลา 09:00 น. ไม่ต้องรอชำระครบ เก็บแบบ Private และเข้ารหัส AES-256-GCM รูปเดิมที่ไม่เปลี่ยนจะไม่เก็บซ้ำ
            </p>
          </div>
          <BackupNowButton disabled={!configured || latest?.status === 'running'} />
        </div>

        {!configured && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            ยังไม่พบการเชื่อมต่อ BACKUP_BUCKET
          </div>
        )}

        {configured && latest && (
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">สถานะล่าสุด</p>
              <div className="mt-1"><StatusBadge status={latest.status} /></div>
            </div>
            <div>
              <p className="text-xs text-slate-400">เวลา</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {dateTime.format(new Date(latest.completedAt ?? latest.startedAt))}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">รายการข้อมูล</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{latest.totalRows.toLocaleString('th-TH')} แถว</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">ไฟล์ / ขนาด</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {latest.totalFiles.toLocaleString('th-TH')} / {formatBytes(latest.encryptedBytes)}
              </p>
            </div>
          </div>
        )}

        {latest?.error && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{latest.error}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">งานอัตโนมัติ</h2>
          <p className="mt-1 text-xs text-slate-400">แสดงผลรอบล่าสุด หากไม่สำเร็จระบบจะพยายามแจ้งเจ้าของผ่านช่องทางที่ตั้งไว้</p>
        </div>
        {!cron ? <p className="p-5 text-sm text-slate-400">ยังไม่มีผลการทำงานหลังอัปเดตระบบ</p> : <div className="p-5 space-y-3">
          {cron.overdue && <p className="text-sm text-rose-600">ไม่ได้รับผลรอบใหม่เกิน 36 ชั่วโมง กรุณาตรวจ Cron Trigger</p>}
          {cron.results.map(result => {
            const labels = { reminders: 'แจ้งเตือนค่าเช่า', contracts: 'สัญญาใกล้หมดอายุ', 'daily-summary': 'สรุปประจำวัน', backup: 'สำรองข้อมูล' }
            return <div key={result.job} className="flex justify-between items-center gap-3 text-sm">
              <span className="text-slate-700">{labels[result.job]}</span>
              <StatusBadge status={result.status} />
            </div>
          })}
          <p className="text-xs text-slate-400">รอบล่าสุด {dateTime.format(new Date(cron.startedAt))}</p>
          {cron.alertFailed && <p className="text-sm text-rose-600">ส่งแจ้งเจ้าของไม่สำเร็จ กรุณาตรวจช่องทาง LINE / Telegram</p>}
        </div>}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <FileArchive className="size-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">ประวัติ Backup ล่าสุด</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติ Backup ของ rental-v2</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {dateTime.format(new Date(item.completedAt ?? item.startedAt))}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {item.totalRows.toLocaleString('th-TH')} แถว · {item.totalFiles.toLocaleString('th-TH')} ไฟล์ · เขียนเพิ่ม {formatBytes(item.encryptedBytes)}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-2xl bg-slate-950 p-4 text-white">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
        <p className="text-xs leading-5 text-slate-300">
          Backup ชุดนี้แยกอยู่ใต้ <span className="font-mono text-white">rental-v2/</span>
          {' '}และไม่แก้ไขไฟล์ Backup เดิมใน Bucket
        </p>
      </div>
    </div>
  )
}
