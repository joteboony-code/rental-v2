import { afterEach, describe, expect, it, vi } from 'vitest'
import { lineFriendshipErrorMessage, verifyLineFriendship } from '@/lib/line-friendship'

const options = {
  accessToken: 'liff-access-token',
  expectedUserId: 'U123',
  loginChannelId: 'login-channel',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('verifyLineFriendship', () => {
  afterEach(() => vi.restoreAllMocks())

  it('accepts a valid token for the same LINE user who is an OA friend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ client_id: 'login-channel', expires_in: 3600, scope: 'openid profile' }))
      .mockResolvedValueOnce(jsonResponse({ userId: 'U123' }))
      .mockResolvedValueOnce(jsonResponse({ friendFlag: true }))

    await expect(verifyLineFriendship(options)).resolves.toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects an account that has not added or has blocked the OA', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ client_id: 'login-channel', expires_in: 3600, scope: 'profile' }))
      .mockResolvedValueOnce(jsonResponse({ userId: 'U123' }))
      .mockResolvedValueOnce(jsonResponse({ friendFlag: false }))

    await expect(verifyLineFriendship(options)).resolves.toEqual({ success: false, reason: 'not_friend' })
  })

  it('rejects a token issued for another LINE Login channel', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ client_id: 'other-channel', expires_in: 3600, scope: 'profile' }))

    await expect(verifyLineFriendship(options)).resolves.toEqual({ success: false, reason: 'invalid' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a token whose profile belongs to another user', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ client_id: 'login-channel', expires_in: 3600, scope: 'profile' }))
      .mockResolvedValueOnce(jsonResponse({ userId: 'U999' }))

    await expect(verifyLineFriendship(options)).resolves.toEqual({ success: false, reason: 'invalid' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed when LINE is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'))

    await expect(verifyLineFriendship(options)).resolves.toEqual({ success: false, reason: 'unavailable' })
  })

  it('returns a clear instruction when the OA is not a friend', () => {
    expect(lineFriendshipErrorMessage('not_friend')).toContain('เพิ่ม LINE OA')
  })
})
