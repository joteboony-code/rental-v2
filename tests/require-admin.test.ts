import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import { getAuthedUser } from '@/lib/require-admin'

function mockClient(role: string | null) {
  const user = { id: 'user-1' }
  const maybeSingle = vi.fn().mockResolvedValue({
    data: role === null ? null : { role },
    error: null,
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })

  return {
    user,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user } }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
            data: { currentLevel: 'aal2', nextLevel: 'aal2' },
            error: null,
          }),
        },
      },
      from: vi.fn().mockReturnValue({ select }),
    },
  }
}

describe('getAuthedUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows an authenticated admin profile', async () => {
    const { client, user } = mockClient('admin')
    createClientMock.mockResolvedValue(client)

    await expect(getAuthedUser()).resolves.toEqual(user)
  })

  it('denies an authenticated non-admin profile', async () => {
    const { client } = mockClient('staff')
    createClientMock.mockResolvedValue(client)

    await expect(getAuthedUser()).resolves.toBeNull()
  })

  it('denies an authenticated user without a profile', async () => {
    const { client } = mockClient(null)
    createClientMock.mockResolvedValue(client)

    await expect(getAuthedUser()).resolves.toBeNull()
  })
})
