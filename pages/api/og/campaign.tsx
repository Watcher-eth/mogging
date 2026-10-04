import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { CampaignOgCard } from '@/components/creator/campaign-og-card'
import { getCampaignPreview } from '@/lib/creator/sprint-service'
import { creatorOgFont, creatorOgBackground } from '@/lib/creator/og-assets'
import { handleApiError, methodNotAllowed } from '@/lib/api/http'

export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const campaign = typeof req.query.id === 'string' ? await getCampaignPreview(req.query.id) : null
    if (!campaign) return res.status(404).end('Campaign not found')
    const [data, background] = await Promise.all([creatorOgFont, creatorOgBackground])
    const image = new ImageResponse(<CampaignOgCard campaign={campaign} background={background} />, {
      width: 1200, height: 630, fonts: [
        { name: 'Geist', data, weight: 400, style: 'normal' },
      ],
    })
    res.setHeader('Content-Type', 'image/png')
    return res.status(200).send(Buffer.from(await image.arrayBuffer()))
  } catch (error) { return handleApiError(error, res) }
}
