'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchResult = {
  tenants: { id: string; full_name: string; line_user_id: string | null }[]
  rooms:   { id: string; room_number: string; status: string }[]
  bills:   { id: string; billing_month: string; room_number: string; tenant_name: string }[]
}

export async function searchAction(query: string): Promise<SearchResult> {
  const empty = { tenants: [], rooms: [], bills: [] }
  if (!query || query.trim().length < 1) return empty

  const q = query.trim()
  const supabase = await createClient()

  const [{ data: tenants }, { data: rooms }] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, full_name, line_user_id')
      .ilike('full_name', `%${q}%`)
      .limit(5),
    supabase
      .from('rooms')
      .select('id, room_number, status')
      .ilike('room_number', `%${q}%`)
      .limit(5),
  ])

  return { tenants: tenants ?? [], rooms: rooms ?? [], bills: [] }
}
