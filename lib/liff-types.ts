export type LiffProfile = {
  userId: string
  displayName?: string
}

export type LiffClient = {
  init: (options: { liffId: string }) => Promise<void>
  isLoggedIn: () => boolean
  login: (options?: { redirectUri?: string }) => void
  getProfile: () => Promise<LiffProfile>
}
