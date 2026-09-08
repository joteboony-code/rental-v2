import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storageObjectPath } from '@/lib/storage-path'

export { storageObjectPath } from '@/lib/storage-path'

/** Batch signing keeps a page of photos within the Worker's subrequest budget.
 * Use the caller's authenticated client: never elevate permissions for signing.
 */
export async function createSignedStorageUrls(
  supabase: SupabaseClient,
  bucket: string,
  values: (string | null | undefined)[],
  expiresIn = 900
): Promise<Map<string, string | null>> {
  const paths = new Map<string, string | null>()
  for (const value of values) {
    if (value) paths.set(value, storageObjectPath(value, bucket))
  }
  const unique = [...new Set([...paths.values()].filter((path): path is string => !!path))]
  const signed = new Map<string, string>()
  for (let offset = 0; offset < unique.length; offset += 100) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique.slice(offset, offset + 100), expiresIn)
      if (error) {
        console.warn('[storage-sign-batch] Request failed', { bucket, count: Math.min(100, unique.length - offset) })
        continue
      }
      for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl)
      }
    } catch {
      // Do not log signed URLs, tokens or object paths, or fan out individual retries.
      console.warn('[storage-sign-batch] Request failed', { bucket })
    }
  }
  return new Map([...paths].map(([value, path]) => [value, path ? signed.get(path) ?? null : null]))
}

export async function createSignedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  storedValue: string | null | undefined,
  expiresIn = 900
): Promise<string | null> {
  const path = storageObjectPath(storedValue, bucket)
  if (!path) return null

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  return error ? null : data.signedUrl
}
