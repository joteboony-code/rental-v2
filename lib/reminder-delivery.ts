import type { SupabaseClient } from '@supabase/supabase-js'

export type Delivery = {
  reminder_date: string; recipient_key: string; rooms: string[];
  bill_ids: string[]; amount: number;
}

// A unique insert claims one recipient/date. Never reclaim 'sending' or
// 'unknown': the provider may already have accepted that request.
export async function claimReminder(db: SupabaseClient, row: Delivery) {
  const { data, error } = await db.from('reminder_deliveries')
    .insert({ ...row, status: 'sending' }).select('id').single()
  if (!error && data) return data.id as string
  if (error?.code === '23505') {
    // Only an explicit HTTP rejection can be retried. CAS prevents two retries.
    const { data: retry, error: retryError } = await db.from('reminder_deliveries')
      .update({ ...row, status: 'sending', reason: null, updated_at: new Date().toISOString() })
      .eq('reminder_date', row.reminder_date).eq('recipient_key', row.recipient_key)
      .eq('status', 'failed').select('id').maybeSingle()
    if (retryError) throw new Error('Cannot claim reminder retry')
    return retry?.id as string | null ?? null
  }
  throw new Error('Cannot persist reminder claim')
}

export async function sendTrackedReminder(
  db: SupabaseClient, row: Delivery, to: string, token: string, messages: object[],
) {
  const id = await claimReminder(db, row)
  if (!id) return 'existing' as const
  let status: 'accepted' | 'failed' | 'unknown' = 'unknown'
  let reason = 'network_or_timeout'
  let requestId: string | null = null
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }), signal: AbortSignal.timeout(20_000),
    })
    requestId = response.headers.get('x-line-request-id')
    status = response.ok ? 'accepted' : [400,401,403,404,413,422,429].includes(response.status) ? 'failed' : 'unknown'
    reason = response.ok ? 'line_accepted_not_delivery_receipt' : `line_http_${response.status}`
  } catch { /* Keep ambiguous requests blocked from automatic replay. */ }
  const { error } = await db.from('reminder_deliveries').update({
    status, reason, request_id: requestId, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'sending')
  if (error) throw new Error('Reminder result not persisted; do not resend')
  return status
}

export async function skipReminder(db: SupabaseClient, row: Delivery, reason: string) {
  const { error } = await db.from('reminder_deliveries').insert({ ...row, status: 'skipped', reason })
  if (error && error.code !== '23505') throw new Error('Cannot persist skipped reminder')
}
