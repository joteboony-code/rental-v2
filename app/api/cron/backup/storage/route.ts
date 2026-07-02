import { NextRequest, NextResponse } from 'next/server'
import { backupStoragePage, getBackupBucket } from '@/lib/backup'

const SNAPSHOT_PREFIX = /^rental-v2\/snapshots\/\d{4}-\d{2}-\d{2}T[\d-]+Z$/
const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('x-cron-secret') === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as {
    snapshotPrefix?: string
    sourceBucket?: string
    cursor?: string
  } | null
  if (
    !body?.snapshotPrefix ||
    !SNAPSHOT_PREFIX.test(body.snapshotPrefix) ||
    !body.sourceBucket ||
    !BUCKET_NAME.test(body.sourceBucket) ||
    (body.cursor !== undefined && typeof body.cursor !== 'string')
  ) {
    return NextResponse.json({ error: 'Invalid backup stage request' }, { status: 400 })
  }

  try {
    const result = await backupStoragePage({
      destinationBucket: await getBackupBucket(),
      snapshotPrefix: body.snapshotPrefix,
      sourceBucket: body.sourceBucket,
      cursor: body.cursor,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[backup] storage stage failed', error)
    const message = error instanceof Error ? error.message : 'Storage backup failed'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
