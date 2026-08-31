import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTenantPortalDashboard } from '@/app/actions/portal'
import { getAdminTenantPortalDashboard } from '@/app/actions/portal-admin'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), identity: 'verified-line-id' as string | null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portal-session', () => ({ verifyPortalToken: () => mock.identity, signPortalToken: vi.fn() }))
vi.mock('@/lib/require-admin', () => ({ getAuthedUser: async () => ({ id: 'admin' }) }))
vi.mock('@/lib/notify-owner', () => ({ notifyOwner: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({
  rpc: mock.rpc,
  from: (table: string) => {
    const data = table === 'contracts' ? {
      id: 'contract', tenant_id: 'tenant', room_id: 'room',
      tenants: { id: 'tenant', full_name: 'Test' }, rooms: { id: 'room', room_number: '1' },
    } : table === 'bills' ? [] : {}
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    }
    return chain
  },
}) }))
beforeEach(() => {
  mock.identity = 'verified-line-id'
  mock.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name === 'get_tenant_portal_by_line_user'
      ? { tenant: { id: 'authorized-tenant' }, room: { id: 'authorized-room' }, bills: [] } : null,
    error: null,
  }))
})
describe('portal opening authorization and previews', () => {
  it('records the verified LINE recipient and authorized returned room, not the requested room blindly', async () => {
    const result = await getTenantPortalDashboard('signed-token', 'requested-room')
    expect(result.success).toBe(true)
    expect(mock.rpc).toHaveBeenLastCalledWith('record_portal_bill_open', {
      p_line_user_id: 'verified-line-id', p_tenant_id: 'authorized-tenant', p_room_id: 'authorized-room',
    })
  })
  it('does not count rejected sessions or inaccessible rooms', async () => {
    mock.identity = null
    await getTenantPortalDashboard('invalid')
    expect(mock.rpc).not.toHaveBeenCalled()
    mock.identity = 'verified-line-id'
    mock.rpc.mockResolvedValue({ data: null, error: null })
    await getTenantPortalDashboard('signed-token', 'other-room')
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('allows the tenant portal to load even if optional read tracking fails', async () => {
    mock.rpc.mockImplementation(async (name: string) => name === 'record_portal_bill_open'
      ? { error: { message: 'tracking unavailable' }, data: null }
      : { error: null, data: { tenant: { id: 'tenant' }, room: { id: 'room' }, bills: [] } })
    expect((await getTenantPortalDashboard('signed-token')).success).toBe(true)
  })
  it('never counts a successful owner/admin preview as a tenant opening', async () => {
    expect((await getAdminTenantPortalDashboard('room')).success).toBe(true)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
