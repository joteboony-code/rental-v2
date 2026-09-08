import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/security_hardening_20260701.sql'),
  'utf8'
).toLowerCase()
const orderedMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202607120001_atomic_security_hardening.sql'),
  'utf8'
).toLowerCase()
const privateMediaMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202609040001_private_meter_repair_media.sql'),
  'utf8'
).toLowerCase()
const atomicManualPaymentsMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202609040002_atomic_manual_payments.sql'),
  'utf8'
).toLowerCase()

describe('security hardening migration', () => {
  it('restricts privileged RPCs to service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.checkout_tenant(uuid, uuid, uuid, text, text, uuid[])'
    )
    expect(migration).toContain(
      'grant execute on function public.checkout_tenant(uuid, uuid, uuid, text, text, uuid[])'
    )
    expect(migration).toContain(
      'revoke all on function public.apply_multi_bill_payment(jsonb, text, text, text, text, timestamptz, uuid)'
    )
    expect(migration).toMatch(/apply_multi_bill_payment[\s\S]*?to service_role/)
  })

  it('makes tenant documents private and guards admin transaction RPCs', () => {
    expect(migration).toMatch(
      /update storage\.buckets[\s\S]*?set public = false[\s\S]*?tenant-documents/
    )
    expect(migration.match(/if not public\.is_admin\(\) then/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps identity RPCs private and makes critical workflows atomic', () => {
    expect(orderedMigration).toMatch(/pair_tenant_line[\s\S]*?from public, anon, authenticated/)
    expect(orderedMigration).toMatch(/get_tenant_portal_by_line_user[\s\S]*?from public, anon, authenticated/)
    expect(orderedMigration).toContain('create or replace function public.admin_approve_pending_slip')
    expect(orderedMigration).toContain('create or replace function public.admin_convert_reservation')
    expect(orderedMigration.match(/to service_role/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps meter, repair, and contract media private', () => {
    expect(privateMediaMigration).toMatch(
      /update storage\.buckets[\s\S]*?set public = false[\s\S]*?meter-photos[\s\S]*?repair-photos[\s\S]*?contract-documents/
    )
    expect(privateMediaMigration).toContain('drop policy if exists "meter-photos: public read"')
    expect(privateMediaMigration).toContain('drop policy if exists "photos: public read"')
    expect(privateMediaMigration).toMatch(/private operational media: admin read[\s\S]*?public\.is_admin\(\)/)
  })

  it('makes every manual payment mutation atomic and service-role only', () => {
    expect(atomicManualPaymentsMigration).toContain('create or replace function public.admin_record_payment')
    expect(atomicManualPaymentsMigration).toContain('create or replace function public.admin_delete_payment')
    expect(atomicManualPaymentsMigration).toContain('create or replace function public.admin_mark_bill_paid')
    expect(atomicManualPaymentsMigration.match(/for update/g)?.length).toBeGreaterThanOrEqual(4)
    expect(atomicManualPaymentsMigration).toContain('amount exceeds remaining balance')
    expect(atomicManualPaymentsMigration).toContain('possible duplicate payment')
    expect(atomicManualPaymentsMigration.match(/to service_role/g)?.length).toBe(3)
    expect(atomicManualPaymentsMigration).toMatch(/admin_delete_payment[\s\S]*?slip_in_use/)
  })
})
