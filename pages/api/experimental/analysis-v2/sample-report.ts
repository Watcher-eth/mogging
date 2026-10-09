import type { NextApiRequest, NextApiResponse } from 'next'
import { landmarkInputSchema, measureLandmarks } from '@/lib/analysis-v2/measurements'

// Fixed bundled sample only: this diagnostic does not accept or store customer images.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') return res.status(404).end()
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end() }
  const mesh = landmarkInputSchema.safeParse(req.body)
  if (!mesh.success) return res.status(400).json({ error: 'Expected landmark evidence for the bundled sample.' })
  const started = performance.now()
  try {
    const [{ default: sharp }, { evaluateV2 }] = await Promise.all([import('sharp'), import('@/lib/analysis-v2/evaluator')])
    const image = await sharp(`${process.cwd()}/public/model.png`).resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
    const geometry = measureLandmarks(mesh.data)
    const controller = new AbortController()
    const abort = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', abort)
    try {
      const result = await evaluateV2({ imageDataUrl: `data:image/jpeg;base64,${image.toString('base64')}`, geometry }, { signal: controller.signal })
      return res.status(200).json({ ...result, timing: { ...result.timing, serverTotalMs: Math.round(performance.now() - started) } })
    } finally { res.off('close', abort) }
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Experimental evaluation failed.' })
  }
}
export const config = { api: { bodyParser: { sizeLimit: '128kb' } }, maxDuration: 120 }
