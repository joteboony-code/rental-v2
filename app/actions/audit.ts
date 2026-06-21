'use server'

import { createClient } from '@/lib/supabase/server'

export type AuditAction =
  | 'bill_update'
  | 'bill_delete'
  | 'payment_create'
  | 'payment_delete'
  | 'slip_approve'
  | 'slip_apply_oldest_first'
  | 'tenant_credit_create'
  | 'slip_reassign'
  | 'slip_reject'
  | 'tenant_checkout'
  | 'deposit_refund'
  | 'tenant_update'
  | 'line_mapping_change'
  | 'line_bill_sent'
  | 'document_upload'
  | 'document_delete'
  | 'tenant_create'
  | 'tenant_delete'
  | 'contract_create'
  | 'contract_terminate'
  | 'room_create'
  | 'room_update'
  | 'room_delete'
  | 'reservation_clear'
  | 'reservation_convert'
  | 'bill_create'
  | 'bill_mark_paid'
  | 'line_pair'
  | 'line_unpair'
  | 'broadcast_sent'
  | 'registration_auto_approved'
  | 'registration_approved'
  | 'registration_rejected'
  | 'room_pairing_token_regenerated'
  | 'cron_reminders_sent'
  | 'cron_daily_summary_sent'

export type AuditLog = {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  tenant_id: string | null
  room_id: string | null
  old_value: unknown
  new_value: unknown
  description: string | null
  created_by: string | null
  created_at: string
  tenants: { full_name: string } | null
  rooms: { room_number: string } | null
}

type LogInput = {
  action: AuditAction
  entityType?: string | null
  entityId?: string | null
  tenantId?: string | null
  roomId?: string | null
  oldValue?: unknown
  newValue?: unknown
  description?: string | null
}

/**
 * บันทึก audit log — fire-and-forget แบบไม่ทำให้ action หลัก fail
 * (ห่อ try/catch ครบ และ return เสมอ)
 */
export async function logAudit(input: LogInput): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      action:      input.action,
      entity_type: input.entityType ?? null,
      entity_id:   input.entityId ?? null,
      tenant_id:   input.tenantId ?? null,
      room_id:     input.roomId ?? null,
      old_value:   input.oldValue ?? null,
      new_value:   input.newValue ?? null,
      description: input.description ?? null,
      created_by:  user?.id ?? null,
    })
  } catch {
    // กลืน error ทุกชนิด — log ต้องไม่ทำให้ action หลักพัง
  }
}

export type AuditFilters = {
  action?: string
  entityType?: string
  tenantId?: string
  roomId?: string
  from?: string
  to?: string
}

export async function getAuditLogs(filters: AuditFilters = {}): Promise<AuditLog[]> {
  const supabase = await createClient()
  let query = supabase
    .from('audit_logs')
    .select('*, tenants(full_name), rooms(room_number)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (filters.action)     query = query.eq('action', filters.action)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.tenantId)   query = query.eq('tenant_id', filters.tenantId)
  if (filters.roomId)     query = query.eq('room_id', filters.roomId)
  if (filters.from)       query = query.gte('created_at', filters.from)
  if (filters.to)         query = query.lte('created_at', filters.to)

  const { data } = await query
  return (data ?? []) as unknown as AuditLog[]
}
