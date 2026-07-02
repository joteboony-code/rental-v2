import { NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/require-admin'
import { getBackupBucket, runBackup } from '@/lib/backup'

export async function POST() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    console.error('[backup] manual backup failed', error)
    const message = error instanceof Error ? error.message : 'Backup failed'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
