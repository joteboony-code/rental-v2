import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { decryptBackupPayload } from '@/lib/backup-crypto'
import { BACKUP_TABLES } from '@/lib/backup-schema'

const mocks = vi.hoisted(() => ({ service: vi.fn(), context: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mocks.context }))
import { backupStoragePage, getBackupOverview, runBackup, type BackupBucket } from '@/lib/backup'

const secret = 'test-only-backup-encryption-key'
let objects: Map<string, ArrayBuffer>
let downloads: ReturnType<typeof vi.fn>
let rpc: ReturnType<typeof vi.fn>
let bucket: BackupBucket
const encoder = new TextEncoder()
beforeEach(() => {
  vi.stubEnv('BACKUP_ENCRYPTION_KEY', secret)
  vi.stubEnv('CRON_SECRET', 'test-only-cron')
  objects = new Map()
  bucket = {
    async put(key, value) { objects.set(key, typeof value === 'string' ? encoder.encode(value).buffer : value) },
    async get(key) {
      const data = objects.get(key)
      return data ? { text: async () => new TextDecoder().decode(data), arrayBuffer: async () => data } : null
    },
    async head(key) { const data = objects.get(key); return data ? { size: data.byteLength } : null },
    async list({ prefix = '', cursor = '0', limit = 1000 } = {}) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort()
      const offset = Number(cursor)
      const next = offset + limit
      return { objects: keys.slice(offset, next).map(key => ({ key, uploaded: new Date() })),
        truncated: next < keys.length, cursor: next < keys.length ? String(next) : undefined }
    },
  }
  downloads = vi.fn(async (name: string) => ({ data: new Blob([`photo:${name}`], { type: 'image/jpeg' }), error: null }))
  rpc = vi.fn(async () => ({ data: { version: 1, exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(BACKUP_TABLES.map(table => [table, []])) }, error: null }))
  mocks.service.mockReturnValue({ rpc, storage: {
    listBuckets: async () => ({ data: [{ id: 'meter-photos' }], error: null }),
    from: () => ({ download: downloads, listV2: async () => ({ error: null, data: {
      objects: [{ name: 'room1/water.jpg', key: 'room1/water.jpg', updated_at: '2026-09-07T00:00:00Z', metadata: { mimetype: 'image/jpeg' } }], hasNext: false,
    } }) }),
  } })
  mocks.context.mockReturnValue({ env: { BACKUP_BUCKET: bucket, WORKER_SELF_REFERENCE: {
    async fetch(req: Request) {
      const args = await req.json()
      return Response.json(await backupStoragePage({ destinationBucket: bucket, ...args }))
    },
  } } })
})

describe('encrypted backup pipeline', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('exports all persistent tables and reuses unchanged encrypted photos', async () => {
    const first = await runBackup(bucket)
    expect(first.totalFiles).toBe(1)
    expect(first.tables.map(t => t.table)).toContain('meter_baseline_adjustments')
    expect(first.tables.map(t => t.table)).toContain('portal_bill_deliveries')
    const encrypted = objects.get(`${first.snapshotPrefix}/database/application-data.json.gz.enc`)!
    const data = JSON.parse(gunzipSync(Buffer.from(await decryptBackupPayload(encrypted, secret))).toString())
    expect(Object.keys(data.tables)).toHaveLength(BACKUP_TABLES.length)
    await runBackup(bucket)
    expect(downloads).toHaveBeenCalledTimes(1)
    expect([...objects.keys()].filter(key => key.startsWith('rental-v2/blobs/'))).toHaveLength(1)
  })
  it('accepts an absent legacy page_views table without inventing a restore target', async () => {
    rpc.mockResolvedValue({ data: { version: 1, exportedAt: new Date().toISOString(),
      tables: Object.fromEntries(BACKUP_TABLES.filter(table => table !== 'page_views').map(table => [table, []])) }, error: null })
    const result = await runBackup(bucket)
    expect(result.status).toBe('success')
    expect(result.tables).toHaveLength(BACKUP_TABLES.length - 1)
    expect(result.tables.map(table => table.table)).not.toContain('page_views')
    expect(result.tables.map(table => table.table)).toContain('settings')
  })
  it('still rejects exports missing a required table', async () => {
    rpc.mockResolvedValue({ data: { version: 1, exportedAt: new Date().toISOString(),
      tables: Object.fromEntries(BACKUP_TABLES.filter(table => table !== 'settings').map(table => [table, []])) }, error: null })
    await expect(runBackup(bucket)).rejects.toThrow('Incomplete database export')
  })
  it('records a failed manifest if database export fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    await expect(runBackup(bucket)).rejects.toThrow('Database export failed')
    const latest = JSON.parse(await (await bucket.get('rental-v2/latest.json'))!.text())
    expect(latest.status).toBe('failed')
    expect([...objects.keys()].some(key => key.startsWith('rental-v2/manifests/'))).toBe(true)
  })
  it('reads the latest history across more than one R2 listing page', async () => {
    const sample = await runBackup(bucket)
    for (let n = 0; n < 1005; n++) {
      const id = `z${String(n).padStart(4, '0')}`
      await bucket.put(`rental-v2/manifests/${id}.json`, JSON.stringify({ ...sample, id }))
    }
    const overview = await getBackupOverview(bucket)
    expect(overview.history).toHaveLength(10)
    expect(overview.history[0].id).toBe('z1004')
  })
  it('recovers a snapshot through the offline CLI without connecting to a database', async () => {
    const summary = await runBackup(bucket)
    const temp = await mkdtemp(path.join(tmpdir(), 'rental-backup-test-'))
    try {
      for (const [key, data] of objects) {
        const file = path.join(temp, 'r2', key)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, Buffer.from(data))
      }
      const output = path.join(temp, 'restored')
      const result = await promisify(execFile)(process.execPath,
        ['scripts/restore-backup.mjs', path.join(temp, 'r2'), summary.id, output],
        { env: { ...process.env, BACKUP_ENCRYPTION_KEY: secret } })
      expect(result.stdout).toContain('no database was changed')
      expect(await readFile(path.join(output, 'storage/meter-photos/room1/water.jpg'), 'utf8')).toBe('photo:room1/water.jpg')
      expect(JSON.parse(await readFile(path.join(output, 'verification.json'), 'utf8')).verified).toBe(true)
    } finally {
      // Only the exact temporary directory created by this test is removed.
      await rm(temp, { recursive: true, force: true })
    }
  })
})
