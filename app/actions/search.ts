'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchResult = {
  tenants: { id: string; full_name: string; phone: string | null; line_user_id: string | null }[]
  rooms:   { id: string; room_number: string; status: string }[]
  bills:   { id: string; billing_month: string; room_number: string; tenant_name: string; total_amount: number; status: string }[]
  payments:{ id: string; bill_id: string; amount: number; slip_ref: string | null; note: string | null; room_number: string }[]
  slips:   { id: string; amount: number | null; slip_ref: string | null; status: string; tenant_name: string }[]
  repairs: { id: string; title: string; status: string; room_number: string }[]
}

const empty: SearchResult = { tenants: [], rooms: [], bills: [], payments: [], slips: [], repairs: [] }

export async function searchAction(query: string): Promise<SearchResult> {
  if (!query || query.trim().length < 1) return empty

  const q = query.trim()
  const like = `%${q}%`
  const supabase = await createClient()

  // ตรวจว่า query เป็นตัวเลข (ใช้ค้นยอดเงิน)
  const numeric = Number(q.replace(/,/g, ''))
  const isNumeric = !isNaN(numeric) && q.length >= 2

  const [
    { data: tenants },
    { data: rooms },
    { data: bills },
    { data: payments },
    { data: slips },
    { data: repairs },
  ] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, full_name, phone, line_user_id, line_display_name')
      .or(`full_name.ilike.${like},phone.ilike.${like},line_user_id.ilike.${like},line_display_name.ilike.${like}`)
      .limit(6),

    supabase
      .from('rooms')
      .select('id, room_number, status')
      .ilike('room_number', like)
      .limit(6),

    supabase
      .from('bills')
      .select('id, billing_month, total_amount, status, rooms(room_number), tenants(full_name)')
      .or(isNumeric ? `total_amount.eq.${numeric}` : `billing_month.ilike.${like}`)
      .order('billing_month', { ascending: false })
      .limit(6),

    supabase
      .from('payments')
      .select('id, bill_id, amount, slip_ref, note, bills(rooms(room_number))')
      .or(isNumeric ? `slip_ref.ilike.${like},amount.eq.${numeric}` : `slip_ref.ilike.${like},note.ilike.${like}`)
      .order('paid_at', { ascending: false })
      .limit(6),

    supabase
      .from('pending_slips')
      .select('id, amount, slip_ref, sender_name, status, tenants(full_name)')
      .eq('status', 'pending')
      .or(`slip_ref.ilike.${like},sender_name.ilike.${like}`)
      .limit(6),

    supabase
      .from('repair_requests')
      .select('id, title, status, rooms(room_number)')
      .ilike('title', like)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  type RJ = { room_number: string } | null
  type TJ = { full_name: string } | null

  return {
    tenants: (tenants ?? []).map((t) => ({
      id: t.id, full_name: t.full_name, phone: t.phone, line_user_id: t.line_user_id,
    })),
    rooms: rooms ?? [],
    bills: (bills ?? []).map((b) => ({
      id: b.id,
      billing_month: b.billing_month,
      total_amount: Number(b.total_amount),
      status: b.status,
      room_number: (b.rooms as unknown as RJ)?.room_number ?? '—',
      tenant_name: (b.tenants as unknown as TJ)?.full_name ?? '—',
    })),
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      bill_id: p.bill_id,
      amount: Number(p.amount),
      slip_ref: p.slip_ref,
      note: p.note,
      room_number: ((p.bills as unknown as { rooms: RJ } | null)?.rooms)?.room_number ?? '—',
    })),
    slips: (slips ?? []).map((s) => ({
      id: s.id,
      amount: s.amount != null ? Number(s.amount) : null,
      slip_ref: s.slip_ref,
      status: s.status,
      tenant_name: (s.tenants as unknown as TJ)?.full_name ?? '—',
    })),
    repairs: (repairs ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      room_number: (r.rooms as unknown as RJ)?.room_number ?? '—',
    })),
  }
}
