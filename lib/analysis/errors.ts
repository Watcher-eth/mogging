export type AnalysisProviderErrorCode =
  | 'provider_auth'
  | 'provider_rate_limited'
  | 'provider_bad_response'
  | 'provider_unavailable'
  | 'provider_invalid_json'
  | 'provider_unknown'

export class AnalysisProviderError extends Error {
  constructor(
    public readonly code: AnalysisProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly raw?: string
  ) {
    super(message)
  }
}

export function toAnalysisFailure(error: unknown) {
  if (error instanceof AnalysisProviderError) {
    return {
      failureReason: error.message,
      metrics: {
        providerError: {
          code: error.code,
          retryable: error.retryable,
          status: error.status ?? null,
          raw: error.raw ? error.raw.slice(0, 1000) : null,
        },
      },
    }
  }

  return {
    failureReason: 'Image analysis failed',
    metrics: {
      providerError: {
        code: 'provider_unknown',
        retryable: true,
        status: null,
        raw: error instanceof Error ? error.message.slice(0, 1000) : null,
      },
    },
  }
}
