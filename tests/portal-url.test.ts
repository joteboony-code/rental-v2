import { afterEach, describe, expect, it } from 'vitest'
import { buildBillDetailPath, verifyBillToken } from '@/lib/portal-url'

const originalSecret = process.env.PORTAL_SESSION_SECRET

afterEach(() => {
  if (originalSecret === undefined) Reflect.deleteProperty(process.env, 'PORTAL_SESSION_SECRET')
  else process.env.PORTAL_SESSION_SECRET = originalSecret
})

describe('bill portal links', () => {
  it('builds a bill-scoped detail URL with a valid token', () => {
    process.env.PORTAL_SESSION_SECRET = 'test-secret-with-sufficient-entropy'
    const billId = 'bill-123'
    const path = buildBillDetailPath(billId)
    const url = new URL(path, 'https://example.com')

    expect(url.pathname).toBe(`/portal/${billId}`)
    expect(verifyBillToken(billId, url.searchParams.get('t') ?? '')).toBe(true)
    expect(verifyBillToken('another-bill', url.searchParams.get('t') ?? '')).toBe(false)
  })
})
