import { NextRequest, NextResponse } from 'next/server'
import { getBackupBucket, runBackup } from '@/lib/backup'
import { bangkokDateKey } from '@/lib/date-utils'

export async function GET(req: NextRequest) {
  const supplied = req.headers.get('x-cron-secret')
  if (!supplied || ![process.env.CRON_SECRET, process.env.BACKUP_TRIGGER_SECRET].filter(Boolean).includes(supplied)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const bucket = await getBackupBucket()
    const markerKey = `rental-v2-state/daily-backups/${bangkokDateKey()}.json`
    if (await bucket.get(markerKey)) {
      return NextResponse.json({ ok: true, backedUp: false, reason: 'already_backed_up_today' })
    }
    const summary = await runBackup(bucket)
    await bucket.put(markerKey, JSON.stringify({ snapshotId: summary.id, completedAt: summary.completedAt }))
    return NextResponse.json({ ok: true, backedUp: true, id: summary.id, rows: summary.totalRows,
      files: summary.totalFiles, encryptedBytes: summary.encryptedBytes })
  } catch (error) {
    console.error('[backup] scheduled backup failed', error)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
