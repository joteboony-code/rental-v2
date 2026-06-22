import { createHmac } from 'crypto'

const SESSION_TTL_SECS = 3600

function signingKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return k + ':portal-session'
}

export function createPortalToken(lineUserId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECS
  const payload = `${lineUserId}|${exp}`
  const sig = createHmac('sha256', signingKey()).update(payload).digest('hex')
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}

export function verifyPortalToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const lastPipe = decoded.lastIndexOf('|')
    if (lastPipe < 0) return null
    const sig = decoded.slice(lastPipe + 1)
    const payload = decoded.slice(0, lastPipe)
    const expected = createHmac('sha256', signingKey()).update(payload).digest('hex')
    if (sig !== expected) return null
    const sep = payload.indexOf('|')
    if (sep < 0) return null
    const lineUserId = payload.slice(0, sep)
    const exp = parseInt(payload.slice(sep + 1), 10)
    if (!lineUserId || isNaN(exp) || Date.now() / 1000 > exp) return null
    return lineUserId
  } catch {
    return null
  }
}
