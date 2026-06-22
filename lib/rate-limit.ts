import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

export function getClientIp(): Promise<string> {
  return headers().then((h) =>
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/**
 * Returns true if this key has exceeded the limit within the window.
 * Uses a single-row-per-key sliding window stored in the rate_limits table.
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const supabase = createServiceClient()
  const windowStart = new Date(Date.now() - windowSec * 1000).toISOString()

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('key', key)
    .maybeSingle()

  if (!existing || existing.window_start < windowStart) {
    await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, window_start: new Date().toISOString() }, { onConflict: 'key' })
    return false
  }

  if (existing.count >= limit) return true

  await supabase
    .from('rate_limits')
    .update({ count: existing.count + 1 })
    .eq('key', key)
  return false
}
