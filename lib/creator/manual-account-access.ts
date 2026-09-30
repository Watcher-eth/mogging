const manualTikTokCreators = new Set(['mohummadtaha12345@gmail.com'])

export function canManuallyConnectTikTok(email: string | null | undefined) {
  return Boolean(email && manualTikTokCreators.has(email.trim().toLowerCase()))
}
