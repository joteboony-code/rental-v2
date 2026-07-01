import { afterEach, describe, expect, it } from 'vitest'
import { signPortalToken, verifyPortalToken } from '@/lib/portal-session'

const originalSecret = process.env.PORTAL_SESSION_SECRET
const originalEncryptionKey = process.env.ENCRYPTION_KEY

afterEach(() => {
  if (originalSecret === undefined) delete process.env.PORTAL_SESSION_SECRET
  else process.env.PORTAL_SESSION_SECRET = originalSecret
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = originalEncryptionKey
})

describe('portal session tokens', () => {
  it('accepts a signed token and rejects tampering', () => {
    process.env.PORTAL_SESSION_SECRET = 'test-secret-with-sufficient-entropy'
    const token = signPortalToken('line-user-123')

    expect(verifyPortalToken(token)).toBe('line-user-123')
    expect(verifyPortalToken(`${token.slice(0, -1)}x`)).toBeNull()
  })

  it('fails closed when no signing secret exists', () => {
    delete process.env.PORTAL_SESSION_SECRET
    delete process.env.ENCRYPTION_KEY
    expect(verifyPortalToken('invalid')).toBeNull()
  })
})
