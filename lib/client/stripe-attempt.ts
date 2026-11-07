type StripeAttempt = { attempt_id: string; product: string; flow_id?: string; sessionId: string }
type StripeSurface = 'web_analysis' | 'scan_app_credits' | 'landing'

export function rememberStripeAttempt(surface: StripeSurface, attempt: StripeAttempt) {
  try { sessionStorage.setItem(`mogging:stripe:${surface}`, JSON.stringify(attempt)) } catch { /* Checkout still works. */ }
}

export function takeStripeAttempt(surface: StripeSurface, sessionId?: string): StripeAttempt | null {
  const attempt = readStripeAttempt(surface, sessionId)
  if (attempt) clearStripeAttempt(surface)
  return attempt
}

export function readStripeAttempt(surface: StripeSurface, sessionId?: string): StripeAttempt | null {
  try {
    const key = `mogging:stripe:${surface}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const attempt = JSON.parse(raw) as StripeAttempt
    if (sessionId && attempt.sessionId !== sessionId) return null
    return attempt
  } catch { return null }
}

export function clearStripeAttempt(surface: StripeSurface) {
  try { sessionStorage.removeItem(`mogging:stripe:${surface}`) } catch { /* Storage is optional. */ }
}

export function stripeAttemptProperties(attempt: StripeAttempt | null) {
  return attempt ? { attempt_id: attempt.attempt_id, flow_id: attempt.flow_id, product: attempt.product } : {}
}
