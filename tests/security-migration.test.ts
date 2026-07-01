import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/security_hardening_20260701.sql'),
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
})
