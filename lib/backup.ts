import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createServiceClient } from '@/lib/supabase/service'
import { backupObjectPath, decryptBackupPayload, encryptBackupPayload } from '@/lib/backup-crypto'
import { BACKUP_TABLES, OPTIONAL_BACKUP_TABLES, validateBackupData } from '@/lib/backup-schema'
import type { CronReport } from '@/lib/cron-runner'

const BACKUP_ROOT = 'rental-v2'
const STORAGE_PAGE_SIZE = 20

export { BACKUP_TABLES } from '@/lib/backup-schema'

type R2ObjectSummary = {
  key: string
  uploaded: Date
}

export type BackupBucket = {
  get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>
  put(
    key: string,
    value: ArrayBuffer | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string }
      customMetadata?: Record<string, string>
      sha256?: ArrayBuffer
    }
  ): Promise<unknown>
  list(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<{
    objects: R2ObjectSummary[]
    truncated: boolean
    cursor?: string
  }>
}

type TableBackup = {
  table: string
  rows: number
}

type StorageBackup = {
  bucket: string
  files: number
  encryptedBytes: number
}

export type BackupSummary = {
  version: 1
  id: string
  status: 'running' | 'success' | 'failed'
  startedAt: string
  completedAt: string | null
  snapshotPrefix: string | null
  tables: TableBackup[]
  storage: StorageBackup[]
  totalRows: number
  totalFiles: number
  encryptedBytes: number
  encryption: 'AES-256-GCM'
  storageLayout?: 'indexed-v2'
  error?: string
}

export type StoragePageResult = {
  files: number
  encryptedBytes: number
  nextCursor?: string
}

function backupSecret(): string {
  const secret = process.env.BACKUP_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('Missing BACKUP_ENCRYPTION_KEY or ENCRYPTION_KEY')
  }
  return secret
}

export async function getBackupBucket(): Promise<BackupBucket> {
  const { env } = await getCloudflareContext({ async: true })
  const bucket = env.BACKUP_BUCKET
  if (!bucket) throw new Error('BACKUP_BUCKET binding is not configured')
  return bucket
}

function snapshotId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const input = encoder.encode(JSON.stringify(value))
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

const encoder = new TextEncoder()

async function sha256(payload: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', payload)
}

async function putEncrypted(
  bucket: BackupBucket,
  key: string,
  payload: ArrayBuffer,
  secret: string,
  sourceType: 'table' | 'storage'
): Promise<number> {
  const encrypted = await encryptBackupPayload(payload, secret)
  await bucket.put(key, encrypted, {
    httpMetadata: {
      contentType: 'application/octet-stream',
      cacheControl: 'private, no-store',
    },
    customMetadata: {
      encrypted: 'AES-256-GCM',
      sourceType,
      createdAt: new Date().toISOString(),
    },
    sha256: await sha256(encrypted),
  })
  const stored = await bucket.get(key)
  if (!stored) throw new Error('Backup read-back failed')
  const restored = await decryptBackupPayload(await stored.arrayBuffer(), secret)
  if (await digestHex(restored) !== await digestHex(payload)) throw new Error('Backup verification failed')
  return encrypted.byteLength
}

async function digestHex(payload: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', payload as BufferSource)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function backupDatabase(bucket: BackupBucket, prefix: string, secret: string) {
  const { data, error } = await createServiceClient().rpc('admin_export_application_backup')
  if (error) throw new Error(`Database export failed: ${error.code ?? 'unknown'}`)
  const bundle = validateBackupData(data)
  if (BACKUP_TABLES.some(table => !OPTIONAL_BACKUP_TABLES.has(table) && !(table in bundle.tables))) {
    throw new Error('Incomplete database export')
  }
  const tables = Object.entries(bundle.tables).map(([table, rows]) => ({ table, rows: rows.length }))
  const encryptedBytes = await putEncrypted(bucket, `${prefix}/database/application-data.json.gz.enc`,
    await gzipJson(bundle), secret, 'table')
  return { tables, encryptedBytes }
}

export async function backupStoragePage({
  destinationBucket,
  snapshotPrefix,
  sourceBucket,
  cursor,
}: {
  destinationBucket: BackupBucket
  snapshotPrefix: string
  sourceBucket: string
  cursor?: string
}): Promise<StoragePageResult> {
  const supabase = createServiceClient()
  const secret = backupSecret()
  const { data, error } = await supabase.storage.from(sourceBucket).listV2({
    limit: STORAGE_PAGE_SIZE,
    cursor,
    with_delimiter: false,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error) throw new Error(`Storage ${sourceBucket}: ${error.message}`)
  if (data.hasNext && !data.nextCursor) throw new Error('Storage pagination cursor missing')

  let files = 0
  let encryptedBytes = 0
  const index: { sourcePath: string; objectKey: string; contentType: string }[] = []
  const keyId = await digestHex(encoder.encode(`backup-cache:${secret}`))
  for (const object of data.objects) {
    const sourcePath = object.key ?? object.name
    const version = object.updated_at || crypto.randomUUID()
    const hash = await digestHex(encoder.encode(JSON.stringify([keyId, sourceBucket, sourcePath, version, object.metadata])))
    const objectKey = `${BACKUP_ROOT}/blobs/${hash}.enc`
    const cached = await destinationBucket.head(objectKey)
    if (cached) {
      index.push({ sourcePath, objectKey, contentType: String(object.metadata?.mimetype ?? 'application/octet-stream') })
      files += 1
      continue
    }
    const { data: file, error: downloadError } = await supabase.storage
      .from(sourceBucket)
      .download(sourcePath)
    if (downloadError) {
      throw new Error(`Storage ${sourceBucket}/${sourcePath}: ${downloadError.message}`)
    }

    encryptedBytes += await putEncrypted(
      destinationBucket,
      objectKey,
      await file.arrayBuffer(),
      secret,
      'storage'
    )
    index.push({ sourcePath, objectKey, contentType: file.type || 'application/octet-stream' })
    files += 1
  }
  const pageKey = await digestHex(encoder.encode(cursor ?? 'first'))
  encryptedBytes += await putEncrypted(destinationBucket,
    `${snapshotPrefix}/storage-index/${backupObjectPath(sourceBucket)}/${pageKey}.json.enc`,
    encoder.encode(JSON.stringify({ bucket: sourceBucket, files: index })).buffer,
    secret, 'storage')

  return {
    files,
    encryptedBytes,
    nextCursor: data.hasNext ? data.nextCursor : undefined,
  }
}

async function backupStorage(
  bucket: BackupBucket,
  prefix: string
): Promise<StorageBackup[]> {
  const supabase = createServiceClient()
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets({
    limit: 100,
    sortColumn: 'name',
    sortOrder: 'asc',
  })
  if (bucketsError) throw new Error(`Storage buckets: ${bucketsError.message}`)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) throw new Error('Missing CRON_SECRET for backup storage stages')
  const { env } = await getCloudflareContext({ async: true })
  const self = env.WORKER_SELF_REFERENCE
  if (!self) throw new Error('WORKER_SELF_REFERENCE binding is not configured')

  const results: StorageBackup[] = []
  for (const sourceBucket of buckets ?? []) {
    let cursor: string | undefined
    let files = 0
    let encryptedBytes = 0

    do {
      const response = await self.fetch(new Request('https://self/api/cron/backup/storage', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({
          snapshotPrefix: prefix,
          sourceBucket: sourceBucket.id,
          cursor,
        }),
      }))
      const stage = await response.json() as StoragePageResult & { error?: string }
      if (!response.ok) {
        throw new Error(stage.error ?? `Storage ${sourceBucket.id}: backup stage failed`)
      }
      files += stage.files
      encryptedBytes += stage.encryptedBytes
      cursor = stage.nextCursor
    } while (cursor)

    results.push({ bucket: sourceBucket.id, files, encryptedBytes })
  }

  return results
}

async function writeStatus(bucket: BackupBucket, key: string, summary: BackupSummary) {
  await bucket.put(key, JSON.stringify(summary), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store',
    },
  })
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown backup error'
}

export async function runBackup(providedBucket?: BackupBucket): Promise<BackupSummary> {
  const bucket = providedBucket ?? await getBackupBucket()
  const started = new Date()
  const id = snapshotId(started)
  const prefix = `${BACKUP_ROOT}/snapshots/${id}`
  const latestKey = `${BACKUP_ROOT}/latest.json`
  const summary: BackupSummary = {
    version: 1,
    id,
    status: 'running',
    startedAt: started.toISOString(),
    completedAt: null,
    snapshotPrefix: prefix,
    tables: [],
    storage: [],
    totalRows: 0,
    totalFiles: 0,
    encryptedBytes: 0,
    encryption: 'AES-256-GCM',
    storageLayout: 'indexed-v2',
  }

  await writeStatus(bucket, latestKey, summary)

  try {
    const secret = backupSecret()
    const database = await backupDatabase(bucket, prefix, secret)
    summary.tables = database.tables
    summary.storage = await backupStorage(bucket, prefix)
    summary.totalRows = summary.tables.reduce((total, table) => total + table.rows, 0)
    summary.totalFiles = summary.storage.reduce((total, item) => total + item.files, 0)
    summary.encryptedBytes =
      database.encryptedBytes +
      summary.storage.reduce((total, item) => total + item.encryptedBytes, 0)
    summary.status = 'success'
    summary.completedAt = new Date().toISOString()

    await writeStatus(bucket, `${BACKUP_ROOT}/manifests/${id}.json`, summary)
    await writeStatus(bucket, latestKey, summary)
    return summary
  } catch (error) {
    summary.status = 'failed'
    summary.completedAt = new Date().toISOString()
    summary.error = safeError(error)
    await writeStatus(bucket, `${BACKUP_ROOT}/manifests/${id}.json`, summary)
    await writeStatus(bucket, latestKey, summary)
    throw error
  }
}

async function readSummary(bucket: BackupBucket, key: string): Promise<BackupSummary | null> {
  const object = await bucket.get(key)
  if (!object) return null
  try {
    const summary = JSON.parse(await object.text()) as BackupSummary
    if (summary.status === 'running' && Date.now() - Date.parse(summary.startedAt) > 30 * 60_000) {
      return { ...summary, status: 'failed', error: 'Backup ค้างเกิน 30 นาที กรุณาตรวจสอบแล้วลองใหม่' }
    }
    return summary
  } catch {
    return null
  }
}

export async function getBackupOverview(providedBucket?: BackupBucket): Promise<{
  latest: BackupSummary | null
  history: BackupSummary[]
}> {
  const bucket = providedBucket ?? await getBackupBucket()
  const latest = await readSummary(bucket, `${BACKUP_ROOT}/latest.json`)
  const allKeys: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: `${BACKUP_ROOT}/manifests/`, limit: 1000, cursor })
    allKeys.push(...page.objects.map(object => object.key))
    cursor = page.truncated ? page.cursor : undefined
    if (page.truncated && !cursor) throw new Error('Backup history cursor missing')
  } while (cursor)
  const keys = allKeys
    .filter((key) => key.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 10)
  const history = (await Promise.all(keys.map((key) => readSummary(bucket, key))))
    .filter((item): item is BackupSummary => item !== null)
  return { latest, history }
}

export async function getCronOverview(bucket: BackupBucket): Promise<(CronReport & { overdue: boolean }) | null> {
  const object = await bucket.get('rental-v2-state/cron/latest.json')
  if (!object) return null
  const report = JSON.parse(await object.text()) as CronReport
  const now = Date.now()
  return { ...report, overdue: now - Date.parse(report.startedAt) > 36 * 60 * 60_000,
    results: report.results.map(result => result.status === 'running' && now - Date.parse(result.startedAt) > 30 * 60_000
      ? { ...result, status: 'failed', reason: 'stale_run' } : result),
  }
}
