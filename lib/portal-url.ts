import { createHmac, timingSafeEqual } from 'crypto'
import { normalizeOrigin } from '@/lib/pair-url'

const DEFAULT_APP_ORIGIN = 'https://rental-v2.joteboony.workers.dev'

export function createBillToken(billId: string): string {
  const secret = process.env.PORTAL_SESSION_SECRET ?? process.env.ENCRYPTION_KEY ?? ''
  const exp = Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days
  const payload = `${billId}|${exp}`
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}|${mac}`).toString('base64url')
}

export function verifyBillToken(billId: string, token: string): boolean {
  try {
    const secret = process.env.PORTAL_SESSION_SECRET ?? process.env.ENCRYPTION_KEY ?? ''
    if (!secret) return false
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastPipe = decoded.lastIndexOf('|')
    if (lastPipe < 0) return false
    const mac = decoded.slice(lastPipe + 1)
    const rest = decoded.slice(0, lastPipe)
    const pipeParts = rest.split('|')
    if (pipeParts.length < 2) return false
    const expStr = pipeParts[pipeParts.length - 1]
    const tokenBillId = pipeParts.slice(0, -1).join('|')
    if (tokenBillId !== billId) return false
    const exp = Number(expStr)
    if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return false
    const expected = createHmac('sha256', secret).update(rest).digest('hex')
    const macBuf = Buffer.from(mac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    return macBuf.length === expectedBuf.length && timingSafeEqual(macBuf, expectedBuf)
  } catch {
    return false
  }
}

export function buildBillDetailPath(billId: string) {
  const token = createBillToken(billId)
  return `/portal/${encodeURIComponent(billId)}?t=${encodeURIComponent(token)}`
}

function getAppOrigin(appUrl: string | null) {
  return (
    normalizeOrigin(appUrl) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    DEFAULT_APP_ORIGIN
  )
}

function getLiffId(liffId: string | null) {
  const trimmed = liffId?.trim()
  return trimmed || null
}

export function buildTenantPortalUrl(liffId: string | null, appUrl: string | null) {
  const cleanLiffId = getLiffId(liffId)
  if (cleanLiffId) return `https://liff.line.me/${cleanLiffId}`

  return `${getAppOrigin(appUrl)}/portal`
}

export function buildBillPortalUrl(
  billId: string,
  liffId: string | null,
  appUrl: string | null
) {
  // ถ้ามี LIFF — เปิด portal เต็ม (ผู้เช่า login เห็นข้อมูลห้อง/บิล/ประวัติ/QR ครบ)
  const cleanLiffId = getLiffId(liffId)
  if (cleanLiffId) return `https://liff.line.me/${cleanLiffId}`

  // ไม่มี LIFF — fallback เป็นหน้าบิลเดี่ยวแบบ URL ปกติ พร้อม token
  const t = createBillToken(billId)
  return `${getAppOrigin(appUrl)}/portal/${billId}?t=${t}`
}
