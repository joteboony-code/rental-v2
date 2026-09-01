export type LiffProfile = {
  userId: string
  displayName?: string
  pictureUrl?: string
}

export type LiffClient = {
  init: (options: { liffId: string }) => Promise<void>
  isLoggedIn: () => boolean
  login: (options?: { redirectUri?: string }) => void
  getProfile: () => Promise<LiffProfile>
  getFriendship: () => Promise<{ friendFlag: boolean }>
  requestFriendship: () => Promise<void>
  getIDToken: () => string | null
  getAccessToken: () => string | null
}
