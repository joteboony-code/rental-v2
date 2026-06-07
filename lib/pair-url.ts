export function normalizeOrigin(value?: string | null) {
  if (!value) return ''
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(withProtocol).origin
  } catch {
    return withProtocol
  }
}

/** URL สำหรับเพิ่มเพื่อน LINE OA (ใช้เป็น QR ให้ผู้เช่าสแกนเพื่อเริ่มจับคู่ผ่าน chat) */
export function buildAddFriendUrl(lineOaBasicId?: string | null): string | null {
  if (!lineOaBasicId) return null
  const id = lineOaBasicId.startsWith('@') ? lineOaBasicId.slice(1) : lineOaBasicId
  return `https://line.me/R/ti/p/%40${id}`
}

/** URL สำหรับหน้า portal/register (self-registration flow) */
export function buildRegisterUrl({
  appOrigin,
  registrationToken,
}: {
  appOrigin: string
  registrationToken?: string | null
}) {
  if (!registrationToken) return ''
  const path = `/portal/register?token=${encodeURIComponent(registrationToken)}`
  return appOrigin ? `${appOrigin}${path}` : path
}

/** URL สำหรับหน้า portal/pair (web-based pairing fallback) */
export function buildPairUrl({
  appOrigin,
  liffId,
  roomNumber,
}: {
  appOrigin: string
  liffId?: string | null
  roomNumber?: string | null
}) {
  const params = new URLSearchParams()
  if (roomNumber) params.set('room', roomNumber)

  if (liffId) {
    // LIFF URL ไม่รองรับ subpath — ต้องใช้ liffId เดียว + query params
    const url = new URL(`https://liff.line.me/${liffId}`)
    params.forEach((value, key) => url.searchParams.set(key, value))
    return url.toString()
  }

  const path = `/portal/pair${params.size ? `?${params.toString()}` : ''}`
  return appOrigin ? `${appOrigin}${path}` : path
}
