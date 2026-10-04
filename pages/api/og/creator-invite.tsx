import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { CreatorInviteOgCard } from '@/components/creator/invite-og-card'
import { getCreatorInvitePreview } from '@/lib/creator/invites'
import { creatorAvatarDataUrl } from '@/lib/creator/invite-avatar'
import { handleApiError, methodNotAllowed } from '@/lib/api/http'
import { creatorOgFont, creatorOgBackground } from '@/lib/creator/og-assets'

export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const invite = typeof req.query.token === 'string' ? await getCreatorInvitePreview(req.query.token) : null
    if (!invite) return res.status(404).end('Invite not found')
    const [avatar, data, backgroundImage] = await Promise.all([creatorAvatarDataUrl(invite.avatarUrl), creatorOgFont, creatorOgBackground])
    const image = new ImageResponse(<CreatorInviteOgCard invite={invite} avatar={avatar} background={backgroundImage} />, {
      width: 1200, height: 630, fonts: [{ name: 'Geist', data, weight: 400, style: 'normal' }],
    })
    res.setHeader('Content-Type', 'image/png')
    return res.status(200).send(Buffer.from(await image.arrayBuffer()))
  } catch (error) { return handleApiError(error, res) }
}
