export type ApiEnvelope<T> = {
  data: T
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export async function apiGet<T>(path: string, init?: RequestInit) {
  return apiRequest<T>(path, {
    method: 'GET',
    ...init,
  })
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit) {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
}

export async function apiPatch<T>(path: string, body?: unknown, init?: RequestInit) {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
}

export async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | ApiErrorEnvelope | null

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : null
    throw new ApiClientError(
      response.status,
      error?.code || 'unknown_error',
      error?.message || 'Request failed',
      error?.details
    )
  }

  if (!payload || !('data' in payload)) {
    throw new ApiClientError(response.status, 'invalid_response', 'Invalid API response')
  }

  return payload.data
}

export function swrFetcher<T>(path: string) {
  return apiGet<T>(path)
}
