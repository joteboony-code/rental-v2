export type LineFriendshipFailureReason = 'invalid' | 'not_friend' | 'unavailable'

export type LineFriendshipVerification =
  | { success: true }
  | { success: false; reason: LineFriendshipFailureReason }

type AccessTokenVerification = {
  client_id?: string
  expires_in?: number
  scope?: string
}

type LineProfile = {
  userId?: string
}

function unavailable(status: number) {
  return status >= 500 || status === 429
}

/**
 * Verifies the LIFF access token, binds it to the ID-token user, and confirms
 * that the account can currently receive messages from the linked LINE OA.
 * This must run server-side; the browser friendship flag is only UI feedback.
 */
export async function verifyLineFriendship(options: {
  accessToken: string
  expectedUserId: string
  loginChannelId: string
}): Promise<LineFriendshipVerification> {
  const { accessToken, expectedUserId, loginChannelId } = options
  if (!accessToken || accessToken.length > 4096 || !expectedUserId || !loginChannelId) {
    return { success: false, reason: 'invalid' }
  }

  try {
    const signal = AbortSignal.timeout(8_000)
    const tokenResponse = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
      { signal }
    )
    if (!tokenResponse.ok) {
      return { success: false, reason: unavailable(tokenResponse.status) ? 'unavailable' : 'invalid' }
    }

    const token = await tokenResponse.json() as AccessTokenVerification
    const scopes = new Set((token.scope ?? '').split(/\s+/).filter(Boolean))
    if (token.client_id !== loginChannelId || !scopes.has('profile') || Number(token.expires_in) <= 0) {
      return { success: false, reason: 'invalid' }
    }

    const headers = { Authorization: `Bearer ${accessToken}` }
    const profileResponse = await fetch('https://api.line.me/v2/profile', { headers, signal })
    if (!profileResponse.ok) {
      return { success: false, reason: unavailable(profileResponse.status) ? 'unavailable' : 'invalid' }
    }
    const profile = await profileResponse.json() as LineProfile
    if (profile.userId !== expectedUserId) {
      return { success: false, reason: 'invalid' }
    }

    const friendshipResponse = await fetch('https://api.line.me/friendship/v1/status', { headers, signal })
    if (!friendshipResponse.ok) {
      return { success: false, reason: unavailable(friendshipResponse.status) ? 'unavailable' : 'invalid' }
    }
    const friendship = await friendshipResponse.json() as { friendFlag?: boolean }
    return friendship.friendFlag
      ? { success: true }
      : { success: false, reason: 'not_friend' }
  } catch {
    return { success: false, reason: 'unavailable' }
  }
}

export function lineFriendshipErrorMessage(reason: LineFriendshipFailureReason) {
  if (reason === 'not_friend') return 'กรุณาเพิ่ม LINE OA หรือปลดบล็อกก่อนดำเนินการ'
  if (reason === 'unavailable') return 'ตรวจสอบสถานะ LINE OA ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  return 'ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาเปิดลิงก์ผ่าน LINE แล้วลองใหม่'
}
