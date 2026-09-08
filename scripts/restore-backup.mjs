// Offline only: decrypts a locally downloaded R2 snapshot and prepares restore.sql.
// Never connects to Supabase and never overwrites an existing output directory.
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { decryptBackupPayload } from '../lib/backup-crypto.ts'
import { createRestoreSql, validateBackupData } from '../lib/backup-schema.ts'

const [rootArg, snapshotId, outputArg] = process.argv.slice(2)
if (!rootArg || !outputArg || !/^\d{4}-\d{2}-\d{2}T[\dTZ-]+$/.test(snapshotId ?? '')) {
  throw new Error('Usage: node scripts/restore-backup.mjs <local-R2-root> <snapshot-id> <new-output-directory>')
}
const secret = process.env.BACKUP_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY
if (!secret) throw new Error('Set BACKUP_ENCRYPTION_KEY locally; do not put it in command arguments')
const root = path.resolve(rootArg)
const output = path.resolve(outputArg)
function inside(base, child) {
  const resolved = path.resolve(base, child)
  const rel = path.relative(base, resolved)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Unsafe backup path')
  return resolved
}
async function decrypt(key) {
  const data = await readFile(inside(root, key))
  const payload = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return Buffer.from(await decryptBackupPayload(payload, secret))
}
async function filesIn(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in backup input')
    const name = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await filesIn(name))
    else out.push(name)
  }
  return out
}
const manifest = JSON.parse(await readFile(inside(root, `rental-v2/manifests/${snapshotId}.json`), 'utf8'))
const prefix = `rental-v2/snapshots/${snapshotId}`
if (manifest.status !== 'success' || manifest.snapshotPrefix !== prefix) throw new Error('Snapshot is not complete')
const database = validateBackupData(JSON.parse(gunzipSync(await decrypt(`${prefix}/database/application-data.json.gz.enc`)).toString('utf8')))
for (const table of manifest.tables) {
  if (database.tables[table.table]?.length !== table.rows) throw new Error('Database count mismatch')
}
await mkdir(output) // intentionally fails if destination exists
const seen = new Set()
let files = 0
try {
  if (manifest.storageLayout === 'indexed-v2') {
    for (const bucket of manifest.storage) {
      const indexDir = inside(root, `${prefix}/storage-index/${encodeURIComponent(bucket.bucket)}`)
      let bucketFiles = 0
      for (const indexFile of await filesIn(indexDir)) {
        const index = JSON.parse((await decrypt(path.relative(root, indexFile))).toString('utf8'))
        if (index.bucket !== bucket.bucket || !Array.isArray(index.files)) throw new Error('Invalid storage index')
        for (const file of index.files) {
          if (!/^rental-v2\/blobs\/[a-f0-9]{64}\.enc$/.test(file.objectKey) || typeof file.sourcePath !== 'string') throw new Error('Invalid blob reference')
          const key = `${bucket.bucket}/${file.sourcePath}`
          if (seen.has(key)) throw new Error('Duplicate storage path')
          seen.add(key)
          const target = inside(inside(inside(output, 'storage'), bucket.bucket), file.sourcePath)
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, await decrypt(file.objectKey), { flag: 'wx', mode: 0o600 })
          bucketFiles++
        }
      }
      if (bucketFiles !== bucket.files) throw new Error('Storage count mismatch')
      files += bucketFiles
    }
  } else {
    for (const bucket of manifest.storage) {
      if (!bucket.files) continue
      const dir = inside(root, `${prefix}/storage/${encodeURIComponent(bucket.bucket)}`)
      let count = 0
      for (const input of await filesIn(dir)) {
        const relative = path.relative(dir, input).replace(/\.enc$/, '').split(path.sep).map(decodeURIComponent).join('/')
        const target = inside(inside(inside(output, 'storage'), bucket.bucket), relative)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, await decrypt(path.relative(root, input)), { flag: 'wx', mode: 0o600 })
        count++
      }
      if (count !== bucket.files) throw new Error('Storage count mismatch')
      files += count
    }
  }
  if (files !== manifest.totalFiles) throw new Error('Total file count mismatch')
  await writeFile(inside(output, 'restore.sql'), createRestoreSql(database), { flag: 'wx', mode: 0o600 })
  await writeFile(inside(output, 'verification.json'), JSON.stringify({ snapshotId, tables: manifest.tables, files, verified: true }, null, 2), { flag: 'wx', mode: 0o600 })
  console.log(`Verified ${manifest.tables.length} tables and ${files} files. SQL prepared; no database was changed.`)
} catch (error) {
  console.error('Restore preparation failed. Partial output is NOT a valid recovery set; do not import it.')
  throw error
}
