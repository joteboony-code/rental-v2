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
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSec,
  })

  // Fail closed for authentication-sensitive callers if the rate-limit store is unavailable.
  return error ? true : Boolean(data)
}
