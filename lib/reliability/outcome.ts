export type BackendOutcome = {
  outcome: 'ok' | 'rejected' | 'failed' | 'degraded'
  code: string
  alert: boolean
}
const providerCodes = new Set(['provider_auth','provider_rate_limited','provider_bad_response','provider_unavailable','provider_invalid_json','provider_unknown'])
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

// Read only known scalar fields. Never retain a response body, provider raw text or user data.
export function backendOutcome(status: number, body: unknown, feature?: string): BackendOutcome {
  const root = object(body)
  // An authenticated provider webhook rejected by our contract is an integration
  // failure, unlike an ordinary malformed client request. Do not hide it as 4xx.
  if (feature === 'payments/stripe-webhook' && status === 400) return { outcome: 'failed', code: 'billing_signature_invalid', alert: true }
  if (feature === 'payments/revenuecat-webhook' && status === 400) return { outcome: 'failed', code: 'billing_invalid_payload', alert: true }
  if (object(root.error).code === 'provider_error') return {outcome:'failed',code:`provider_http_${status}`,alert:true}
  if (status >= 500) return { outcome: 'failed', code: `http_${status}`, alert: true }
  if (status >= 400) return { outcome: 'rejected', code: `http_${status}`, alert: false }
  const analysis = object(object(root.data).analysis)
  if (analysis.status === 'failed') {
    const provider = object(object(analysis.metrics).providerError)
    const code = providerCodes.has(String(provider.code)) ? String(provider.code)
      : analysis.failureReason === 'No face detected' ? 'input_no_face' : 'evaluation_failed'
    return { outcome: 'failed', code, alert: code !== 'input_no_face' }
  }
  if (analysis.persistenceFailureReason) return { outcome: 'degraded', code: 'analysis_persistence_failed', alert: true }
  // Availability endpoint also reports missing runtime configuration as HTTP 503.
  return { outcome: 'ok', code: 'ok', alert: false }
}

// NextAuth metadata can contain tokens or URLs. Classify only known messages.
export function authErrorOutcome(metadata: unknown): BackendOutcome {
  const value = object(metadata)
  const error = object(value.error ?? metadata)
  const message = typeof error.message === 'string' ? error.message : ''
  if (message === 'access_denied') return { outcome: 'rejected', code: 'oauth_cancelled', alert: false }
  const code = message === 'State cookie was missing.' ? 'oauth_state_missing'
    : message === 'PKCE code_verifier cookie was missing.' ? 'oauth_pkce_missing' : 'oauth_failed'
  return { outcome: 'failed', code, alert: true }
}
