import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storageObjectPath } from '@/lib/storage-path'

export { storageObjectPath } from '@/lib/storage-path'

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
