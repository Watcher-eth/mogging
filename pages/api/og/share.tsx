import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload, type NormalizedPoint } from '@/lib/analysis/landmarks'
import { getShareByToken } from '@/lib/sharing/service'

export const config = {
  maxDuration: 10,
}

type CanvasSize = {
  width: number
  height: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end('Method not allowed')
    return
  }

  const token = typeof req.query.token === 'string' ? req.query.token : null
  if (!token) {
    res.status(400).end('Missing token')
    return
  }

  try {
    const share = await getShareByToken(token)
    const landmarks = parseFaceLandmarksPayload(share.analysis.landmarks)
    const size = getShareImageSize(landmarks)
    const imageUrl = absoluteImageUrl(share.photo.imageUrl, req)
    const geometry = getOverlayGeometry(landmarks, size)
    const pslScore = typeof share.analysis.pslScore === 'number' ? share.analysis.pslScore.toFixed(1) : '--'
    const displayName = (share.photo.name || share.owner?.name || 'Mogging report').toUpperCase()
    const gender = share.photo.gender.toUpperCase()
    const tier = (share.analysis.tier || 'FACIAL AESTHETIC').toUpperCase()

    const image = new ImageResponse(
      (
        <div
          style={{
            background: '#a2a5a5',
            color: '#ffffff',
            display: 'flex',
            height: '100%',
            position: 'relative',
            width: '100%',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={imageUrl}
            style={{
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              width: '100%',
            }}
          />
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.03) 35%, rgba(0,0,0,0.80) 100%)',
              bottom: 0,
              display: 'flex',
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0) 36%, rgba(0,0,0,0.18) 100%)',
              bottom: 0,
              display: 'flex',
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />
          <div
            style={{
              border: '3px solid rgba(255,255,255,0.86)',
              bottom: 58,
              display: 'flex',
              left: 52,
              position: 'absolute',
              right: 52,
              top: 58,
            }}
          />

          {geometry ? (
            <svg
              height={size.height}
              style={{ left: 0, position: 'absolute', top: 0 }}
              viewBox={`0 0 ${size.width} ${size.height}`}
              width={size.width}
            >
              <rect {...geometry.leftBox} fill="none" stroke="rgba(255,255,255,0.88)" strokeDasharray="7 8" strokeWidth="3" />
              <rect {...geometry.rightBox} fill="none" stroke="rgba(255,255,255,0.88)" strokeDasharray="7 8" strokeWidth="3" />
              <rect {...geometry.bridgeBox} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.58)" strokeDasharray="7 8" strokeWidth="3" />
              <line x1={geometry.leftPupil.x} y1={geometry.leftPupil.y} x2={geometry.rightPupil.x} y2={geometry.rightPupil.y} stroke="rgba(255,255,255,0.74)" strokeWidth="3" />
              <circle cx={geometry.leftPupil.x} cy={geometry.leftPupil.y} fill="none" r="12" stroke="rgba(255,255,255,0.94)" strokeDasharray="4 5" strokeWidth="3" />
              <circle cx={geometry.rightPupil.x} cy={geometry.rightPupil.y} fill="none" r="12" stroke="rgba(255,255,255,0.94)" strokeDasharray="4 5" strokeWidth="3" />
              <line x1={geometry.midline.top.x} y1={geometry.midline.top.y} x2={geometry.midline.bottom.x} y2={geometry.midline.bottom.y} stroke="rgba(255,255,255,0.50)" strokeDasharray="12 16" strokeWidth="3" />
            </svg>
          ) : null}

          {geometry ? (
            <div
              style={{
                alignItems: 'center',
                background: 'rgba(255,255,255,0.94)',
                color: '#171717',
                display: 'flex',
                fontSize: size.width === size.height ? 24 : 27,
                fontWeight: 800,
                height: size.width === size.height ? 38 : 42,
                justifyContent: 'center',
                left: geometry.leftLabel.x,
                letterSpacing: '-1px',
                position: 'absolute',
                top: geometry.leftLabel.y,
                width: size.width === size.height ? 194 : 220,
              }}
            >
              EYES DISTANCE
            </div>
          ) : null}

          {geometry ? (
            <div
              style={{
                alignItems: 'center',
                background: 'rgba(255,255,255,0.94)',
                color: '#171717',
                display: 'flex',
                fontSize: size.width === size.height ? 23 : 26,
                fontWeight: 800,
                height: size.width === size.height ? 38 : 42,
                justifyContent: 'center',
                left: geometry.rightLabel.x,
                letterSpacing: '-1px',
                position: 'absolute',
                top: geometry.rightLabel.y,
                width: size.width === size.height ? 220 : 250,
              }}
            >
              PSL CALIBRATION
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              left: 86,
              position: 'absolute',
              top: 92,
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '1.2px' }}>MOGGING REPORT</span>
            <span style={{ fontSize: size.width === size.height ? 66 : 78, fontWeight: 800, letterSpacing: '-5px', lineHeight: 0.92, marginTop: 22, maxWidth: size.width === size.height ? 430 : 520 }}>
              Facial Aesthetic Assessment
            </span>
          </div>

          <div
            style={{
              alignItems: 'flex-end',
              bottom: size.width === size.height ? 138 : 156,
              display: 'flex',
              left: 86,
              lineHeight: 0.82,
              position: 'absolute',
            }}
          >
            <span style={{ fontSize: size.width === size.height ? 128 : 158, fontWeight: 800, letterSpacing: '-9px' }}>{pslScore}</span>
            <span style={{ fontSize: size.width === size.height ? 54 : 66, fontWeight: 800, letterSpacing: '-4px', marginBottom: 8, marginLeft: 12 }}>/8</span>
          </div>

          <div
            style={{
              borderTop: '2px solid rgba(255,255,255,0.78)',
              bottom: 82,
              display: 'flex',
              gap: size.width === size.height ? 38 : 42,
              left: 86,
              paddingTop: 18,
              position: 'absolute',
              right: 86,
            }}
          >
            <MetaBlock label="NAME" value={displayName} width={size.width === size.height ? 190 : 230} />
            <MetaBlock label="GENDER" value={gender} width={size.width === size.height ? 145 : 170} />
            <MetaBlock label="TYPE" value={tier} width={size.width === size.height ? 270 : 340} />
          </div>
        </div>
      ),
      size
    )

    const buffer = Buffer.from(await image.arrayBuffer())
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'image/png')
    res.status(200).send(buffer)
  } catch (error) {
    console.error(error)
    res.status(404).end('Share image not found')
  }
}

function MetaBlock({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width }}>
      <span style={{ color: 'rgba(255,255,255,0.64)', fontSize: 24, fontWeight: 700, letterSpacing: '1px' }}>
        {label} /
      </span>
      <span style={{ color: '#ffffff', fontSize: 30, fontWeight: 800, letterSpacing: '0.2px', marginTop: 10 }}>
        {value}
      </span>
    </div>
  )
}

function getShareImageSize(landmarks: FaceLandmarksPayload | null): CanvasSize {
  const ratio = landmarks ? landmarks.image.width / landmarks.image.height : 0
  if (ratio > 0.92 && ratio < 1.08) return { width: 1080, height: 1080 }
  return { width: 1080, height: 1440 }
}

function absoluteImageUrl(src: string, req: NextApiRequest) {
  if (/^https?:\/\//i.test(src)) return src

  const host = req.headers.host ?? 'localhost:3000'
  const proto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : 'http'
  return `${proto}://${host}${src.startsWith('/') ? src : `/${src}`}`
}

function getOverlayGeometry(landmarks: FaceLandmarksPayload | null, size: CanvasSize) {
  if (!landmarks || landmarks.confidence < 0.5) return null

  const leftOuter = projectPoint(landmarks.anchors.leftEyeOuter, landmarks, size)
  const leftInner = projectPoint(landmarks.anchors.leftEyeInner, landmarks, size)
  const rightInner = projectPoint(landmarks.anchors.rightEyeInner, landmarks, size)
  const rightOuter = projectPoint(landmarks.anchors.rightEyeOuter, landmarks, size)
  const leftPupil = projectPoint(landmarks.anchors.leftPupil ?? landmarks.anchors.leftEyeInner, landmarks, size)
  const rightPupil = projectPoint(landmarks.anchors.rightPupil ?? landmarks.anchors.rightEyeInner, landmarks, size)
  const forehead = projectPoint(landmarks.anchors.forehead, landmarks, size)
  const chin = projectPoint(landmarks.anchors.chin, landmarks, size)

  if (!leftOuter || !leftInner || !rightInner || !rightOuter || !leftPupil || !rightPupil) return null

  const leftBox = boxFromPoints([leftOuter, leftInner, leftPupil], 26, 34, size)
  const rightBox = boxFromPoints([rightInner, rightOuter, rightPupil], 26, 34, size)
  const bridgeBox = boxFromPoints([leftInner, rightInner], 16, 46, size)

  return {
    leftBox,
    rightBox,
    bridgeBox,
    leftPupil,
    rightPupil,
    leftLabel: {
      x: Math.max(76, leftBox.x - 14),
      y: leftBox.y + leftBox.height + 16,
    },
    rightLabel: {
      x: Math.min(size.width - 336, rightBox.x + rightBox.width + 34),
      y: Math.max(86, rightBox.y - 28),
    },
    midline: forehead && chin ? { top: forehead, bottom: chin } : { top: { x: size.width / 2, y: 90 }, bottom: { x: size.width / 2, y: size.height - 120 } },
  }
}

function projectPoint(point: NormalizedPoint | undefined, landmarks: FaceLandmarksPayload, size: CanvasSize) {
  if (!point) return null

  const sourceWidth = landmarks.image.width
  const sourceHeight = landmarks.image.height
  const scale = Math.max(size.width / sourceWidth, size.height / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const offsetX = (size.width - renderedWidth) / 2
  const offsetY = (size.height - renderedHeight) / 2

  return {
    x: offsetX + point.x * sourceWidth * scale,
    y: offsetY + point.y * sourceHeight * scale,
  }
}

function boxFromPoints(points: Array<{ x: number; y: number }>, paddingX: number, paddingY: number, size: CanvasSize) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const left = Math.max(52, minX - paddingX)
  const top = Math.max(52, minY - paddingY)

  return {
    x: left,
    y: top,
    width: Math.min(size.width - 104, maxX + paddingX) - left,
    height: Math.min(size.height - 104, maxY + paddingY) - top,
  }
}
