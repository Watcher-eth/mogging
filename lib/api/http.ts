import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError, type ZodType } from 'zod'

type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'provider_error'
  | 'image_storage_unavailable'
  | 'evaluation_processing'
  | 'account_not_found'
  | 'apple_email_required'
  | 'internal_error'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: ApiErrorCode = statusToCode(status)
  ) {
    super(message)
  }
}

export function json<T>(res: NextApiResponse, status: number, data: T) {
  return res.status(status).json({ data })
}

export function publicCache(res: NextApiResponse, maxAgeSeconds: number, staleWhileRevalidateSeconds = maxAgeSeconds * 6) {
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
  )
}

export function methodNotAllowed(res: NextApiResponse, allowed: string[]) {
  res.setHeader('Allow', allowed)
  return errorJson(res, 405, 'method_not_allowed', 'Method not allowed')
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body)
}

export function handleApiError(error: unknown, res: NextApiResponse) {
  if (error instanceof ApiError) {
    return errorJson(res, error.status, error.code, error.message)
  }

  if (error instanceof ZodError) {
    return errorJson(res, 400, 'bad_request', 'Invalid request', error.flatten())
  }

  if (isHttpLikeError(error)) {
    return errorJson(res, error.status, statusToCode(error.status), error.message)
  }

  const databaseError = error instanceof Error && 'cause' in error ? error.cause : error
  const constraint = databaseError && typeof databaseError === 'object' && 'constraint_name' in databaseError ? databaseError.constraint_name : null
  if (constraint === 'creator_bonus_budget_limit') return errorJson(res, 409, 'conflict', 'The bonus budget cannot cover this payment or budget change')
  if (constraint === 'creator_bonus_award_immutable') return errorJson(res, 409, 'conflict', 'Bonus award identity, amount, and completed payments cannot be changed')

  console.error(error)
  return errorJson(res, 500, 'internal_error', 'Internal server error')
}

export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>

function errorJson(
  res: NextApiResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : null),
    },
  })
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 400) return 'bad_request'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'internal_error'
  return 'bad_request'
}

function isHttpLikeError(error: unknown): error is Error & { status: number } {
  return error instanceof Error && 'status' in error && typeof error.status === 'number'
}
