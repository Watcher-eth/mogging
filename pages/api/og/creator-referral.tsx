import { ImageResponse } from '@vercel/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { db } from '@/lib/db'
import { findCreatorTrackingLink } from '@/lib/creator/attribution'
import { creatorAvatarDataUrl } from '@/lib/creator/invite-avatar'
import { handleApiError, methodNotAllowed } from '@/lib/api/http'

export const config = { maxDuration: 15 }
const font = readFile(join(process.cwd(), 'public/fonts/Geist-Regular.ttf'))
const background = readFile(join(process.cwd(), 'public/creator-referral-background.png')).then(data => `data:image/png;base64,${data.toString('base64')}`)
const logo = readFile(join(process.cwd(), 'public/favicon.png')).then(data => `data:image/png;base64,${data.toString('base64')}`)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
    if (!/^[a-z0-9._-]{1,120}$/.test(slug)) return res.status(404).end('Creator not found')
    const link = await findCreatorTrackingLink(slug)
    if (!link) return res.status(404).end('Creator not found')
    const account = await db.query.creatorSocialAccounts.findFirst({ where: (accounts, { eq }) => eq(accounts.id, link.socialAccountId), columns: { displayName: true, handle: true, avatarUrl: true } })
    if (!account) return res.status(404).end('Creator not found')
    const name = (account.displayName || account.handle || 'Your creator').normalize('NFKC')
    const [avatar, fontData, backdrop, appLogo] = await Promise.all([creatorAvatarDataUrl(account.avatarUrl), font, background, logo])
    // Satori renders native images into the generated PNG.
    /* eslint-disable @next/next/no-img-element */
    const image = new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'white', color: '#181a1d', fontFamily: 'Geist', position: 'relative' }}>
      <img src={backdrop} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', opacity: 0.16 }} />
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 40%, #ffffff 100%)' }} />
      <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', top: 34, left: 44, gap: 12, fontSize: 25 }}><img src={appLogo} alt="" width={40} height={40} style={{ borderRadius: 12 }} /><span>Mogging</span></div>
      <div style={{ display: 'flex', width: 152, height: 152, borderRadius: 76, border: '6px solid white', overflow: 'hidden', background: '#eef0f2', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>{avatar ? <img src={avatar} alt="" width={140} height={140} style={{ objectFit: 'cover', borderRadius: 70 }} /> : name.slice(0, 1).toUpperCase()}</div>
      <span style={{ fontSize: 27, marginTop: 18, maxWidth: 940, textAlign: 'center' }}>An invite from {name.slice(0, 55)}</span>
      <span style={{ fontSize: 64, letterSpacing: '-3px', marginTop: 26 }}>Mogging. Your face, in focus.</span>
      <span style={{ fontSize: 28, color: '#00A8EF', marginTop: 20 }}>Start your ascent with a personalized plan</span>
    </div>, { width: 1200, height: 630, fonts: [{ name: 'Geist', data: fontData, weight: 400, style: 'normal' }] })
    res.setHeader('Content-Type', 'image/png')
    return res.status(200).send(Buffer.from(await image.arrayBuffer()))
  } catch (error) { return handleApiError(error, res) }
}
