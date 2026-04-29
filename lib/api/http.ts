import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError, type ZodType } from 'zod'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function methodNotAllowed(res: NextApiResponse, allowed: string[]) {
  res.setHeader('Allow', allowed)
  return res.status(405).json({ error: 'Method not allowed' })
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body)
}

export function handleApiError(error: unknown, res: NextApiResponse) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message })
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request',
      details: error.flatten(),
    })
  }

  console.error(error)
  return res.status(500).json({ error: 'Internal server error' })
}

export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>

