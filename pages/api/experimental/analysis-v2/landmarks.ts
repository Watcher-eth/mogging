import type { NextApiRequest, NextApiResponse } from 'next'
import { landmarkInputSchema, measureLandmarks } from '@/lib/analysis-v2/measurements'

// This lab has no connection to reports, authentication, credits, storage, or the v1 evaluator.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') return res.status(404).end()
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }
  const result = landmarkInputSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: 'Expected one dense landmark mesh and valid image dimensions.' })
  return res.status(200).json(measureLandmarks(result.data))
}
export const config = { api: { bodyParser: { sizeLimit: '128kb' } } }
