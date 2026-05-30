import { normalizeOrigin } from '@/lib/pair-url'

const DEFAULT_APP_ORIGIN = 'https://rental.joteboony.workers.dev'

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
  // LIFF ไม่รองรับ subpath — ใช้ direct URL เสมอ
  return `${getAppOrigin(appUrl)}/portal/${billId}`
}
