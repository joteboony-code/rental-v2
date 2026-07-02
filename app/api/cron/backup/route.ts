import { NextRequest, NextResponse } from 'next/server'
import { getBackupBucket, runBackup } from '@/lib/backup'

function isAuthorized(req: NextRequest) {
  const supplied = req.headers.get('x-cron-secret')
  const allowed = [
    process.env.CRON_SECRET,
    process.env.BACKUP_TRIGGER_SECRET,
  ].filter(Boolean)
  return !!supplied && allowed.includes(supplied)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runBackup(await getBackupBucket())
    return NextResponse.json({
      ok: true,
      id: summary.id,
      rows: summary.totalRows,
      files: summary.totalFiles,
      encryptedBytes: summary.encryptedBytes,
    })
  } catch (error) {
    console.error('[backup] scheduled backup failed', error)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
