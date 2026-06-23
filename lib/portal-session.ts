import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  const s = process.env.PORTAL_SESSION_SECRET ?? process.env.ENCRYPTION_KEY ?? ''
  if (!s) console.warn('[portal-session] No PORTAL_SESSION_SECRET or ENCRYPTION_KEY set')
  return s
}

// Token format (base64url-encoded): "lineUserId|expEpoch|hmac-hex"
export function signPortalToken(lineUserId: string): string {
  const secret = getSecret()
  const exp = Math.floor(Date.now() / 1000) + 3600
  const payload = `${lineUserId}|${exp}`
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}|${mac}`).toString('base64url')
}

export function verifyPortalToken(token: string): string | null {
  try {
    const secret = getSecret()
    if (!secret) return null
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastPipe = decoded.lastIndexOf('|')
    if (lastPipe < 0) return null
    const mac = decoded.slice(lastPipe + 1)
    const rest = decoded.slice(0, lastPipe)
    const pipeParts = rest.split('|')
    if (pipeParts.length < 2) return null
    const expStr = pipeParts[pipeParts.length - 1]
    const lineUserId = pipeParts.slice(0, -1).join('|')
    const exp = Number(expStr)
    if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return null
    const payload = rest
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const macBuf = Buffer.from(mac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null
    return lineUserId
  } catch {
    return null
  }
}
