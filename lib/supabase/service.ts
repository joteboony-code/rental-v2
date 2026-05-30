import { createClient } from '@supabase/supabase-js'

/**
 * Service role client — bypasses RLS entirely.
 * Use ONLY in server-side code for public pages (portal, pair).
 * Never expose to browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
