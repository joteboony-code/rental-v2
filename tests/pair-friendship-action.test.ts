import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}))
vi.mock('@/lib/line-integration', () => ({ getLineMessagingConfig: vi.fn() }))
vi.mock('@/app/actions/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/require-admin', () => ({ getAuthedUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { pairTenantLine } from '@/app/actions/pair'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function form(accessToken?: string) {
  const data = new FormData()
  data.set('room_number', '21')
  data.set('id_token', 'id-token')
  if (accessToken) data.set('line_access_token', accessToken)
  return data
}

describe('pairTenantLine friendship enforcement', () => {
  beforeEach(() => {
    process.env.LINE_LOGIN_CHANNEL_ID = 'login-channel'
    rpcMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.LINE_LOGIN_CHANNEL_ID
  })

  it('blocks a direct submission that omits the LIFF access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const result = await pairTenantLine(undefined, form())

    expect(result?.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('does not pair when LINE reports that the user is not an OA friend', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ sub: 'U123', name: 'Tester' }))
      .mockResolvedValueOnce(response({ client_id: 'login-channel', expires_in: 3600, scope: 'profile' }))
      .mockResolvedValueOnce(response({ userId: 'U123' }))
      .mockResolvedValueOnce(response({ friendFlag: false }))

    const result = await pairTenantLine(undefined, form('access-token'))

    expect(result).toMatchObject({ success: false })
    expect(result?.message).toContain('เพิ่ม LINE OA')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('pairs only after the server confirms the OA friendship', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ sub: 'U123', name: 'Tester' }))
      .mockResolvedValueOnce(response({ client_id: 'login-channel', expires_in: 3600, scope: 'profile' }))
      .mockResolvedValueOnce(response({ userId: 'U123' }))
      .mockResolvedValueOnce(response({ friendFlag: true }))
    rpcMock.mockResolvedValueOnce({
      data: [{ success: true, message: 'สำเร็จ', tenant_name: 'ผู้เช่า', room_number: '21' }],
      error: null,
    })

    const result = await pairTenantLine(undefined, form('access-token'))

    expect(result?.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledOnce()
  })
})
