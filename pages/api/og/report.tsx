import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload, type NormalizedPoint } from '@/lib/analysis/landmarks'
import { getShareByToken } from '@/lib/sharing/service'

export const config = {
  maxDuration: 10,
}

const width = 1200
const height = 630
const photo = {
  x: 0,
  y: 0,
  width,
  height,
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
    const imageUrl = absoluteImageUrl(share.photo.imageUrl, req)
    const pslScore = formatScore(share.analysis.pslScore)
    const eyeOverlay = getEyeOverlay(landmarks, share.analysis.pslScore)
    const symmetryOverlay = getSymmetryOverlay(landmarks)
    const displayName = (share.photo.name || share.owner?.name || 'Mogging report').toUpperCase()
    const gender = share.photo.gender.toUpperCase()
    const tier = (share.analysis.tier || 'FACIAL AESTHETIC').toUpperCase()
    const harmony = formatMetric(share.analysis.harmonyScore)
    const dimorphism = formatMetric(share.analysis.dimorphismScore)

    const image = new ImageResponse(
      (
        <div
          style={{
            alignItems: 'center',
            background: '#9da1a3',
            color: '#ffffff',
            display: 'flex',
            height: '100%',
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              height: photo.height,
              left: photo.x,
              overflow: 'hidden',
              position: 'absolute',
              top: photo.y,
              width: photo.width,
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
                background: 'linear-gradient(90deg, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.10) 35%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.44) 100%)',
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
                background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.66) 100%)',
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
                border: '2px solid rgba(255,255,255,0.82)',
                bottom: 42,
                display: 'flex',
                left: 54,
                position: 'absolute',
                right: 54,
                top: 42,
              }}
            />
            {symmetryOverlay ? (
              <svg
                height={photo.height}
                style={{ left: 0, position: 'absolute', top: 0 }}
                viewBox={`0 0 ${photo.width} ${photo.height}`}
                width={photo.width}
              >
                <line
                  x1={symmetryOverlay.top.x}
                  y1={symmetryOverlay.top.y}
                  x2={symmetryOverlay.bottom.x}
                  y2={symmetryOverlay.bottom.y}
                  stroke="rgba(255,255,255,0.48)"
                  strokeDasharray="7 12"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            ) : null}
            {eyeOverlay ? (
              <svg
                height={photo.height}
                style={{ left: 0, position: 'absolute', top: 0 }}
                viewBox={`0 0 ${photo.width} ${photo.height}`}
                width={photo.width}
              >
                <rect
                  x={eyeOverlay.leftBox.x}
                  y={eyeOverlay.leftBox.y}
                  width={eyeOverlay.leftBox.width}
                  height={eyeOverlay.leftBox.height}
                  fill="none"
                  stroke="rgba(255,255,255,0.86)"
                  strokeDasharray="3 4"
                  strokeWidth="2"
                />
                <rect
                  x={eyeOverlay.rightBox.x}
                  y={eyeOverlay.rightBox.y}
                  width={eyeOverlay.rightBox.width}
                  height={eyeOverlay.rightBox.height}
                  fill="none"
                  stroke="rgba(255,255,255,0.86)"
                  strokeDasharray="3 4"
                  strokeWidth="2"
                />
                <rect
                  x={eyeOverlay.bridgeBox.x}
                  y={eyeOverlay.bridgeBox.y}
                  width={eyeOverlay.bridgeBox.width}
                  height={eyeOverlay.bridgeBox.height}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.58)"
                  strokeDasharray="3 4"
                  strokeWidth="2"
                />
                <line x1={eyeOverlay.leftPupil.x} y1={eyeOverlay.leftPupil.y} x2={eyeOverlay.rightPupil.x} y2={eyeOverlay.rightPupil.y} stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                <circle cx={eyeOverlay.leftPupil.x} cy={eyeOverlay.leftPupil.y} fill="none" r="8" stroke="rgba(255,255,255,0.92)" strokeDasharray="2 3" strokeWidth="2" />
                <circle cx={eyeOverlay.rightPupil.x} cy={eyeOverlay.rightPupil.y} fill="none" r="8" stroke="rgba(255,255,255,0.92)" strokeDasharray="2 3" strokeWidth="2" />
                <line x1={eyeOverlay.rightPupil.x + 12} y1={eyeOverlay.rightPupil.y - 4} x2={eyeOverlay.callout.x} y2={eyeOverlay.callout.y} stroke="rgba(255,255,255,0.84)" strokeWidth="2" />
              </svg>
            ) : null}
            {eyeOverlay ? (
              <div
                style={{
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.92)',
                  color: '#1f1f1f',
                  display: 'flex',
                  fontSize: 18,
                  fontWeight: 800,
                  height: 30,
                  justifyContent: 'center',
                  left: eyeOverlay.leftLabel.x,
                  letterSpacing: '-1px',
                  position: 'absolute',
                  top: eyeOverlay.leftLabel.y,
                  width: 154,
                }}
              >
                EYES DISTANCE
              </div>
            ) : null}
            {eyeOverlay ? (
              <div
                style={{
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.92)',
                  color: '#1f1f1f',
                  display: 'flex',
                  fontSize: 17,
                  fontWeight: 800,
                  height: 30,
                  justifyContent: 'center',
                  left: eyeOverlay.rightLabel.x,
                  letterSpacing: '-0.8px',
                  position: 'absolute',
                  top: eyeOverlay.rightLabel.y,
                  width: 192,
                }}
              >
                PSL CALIBRATION
              </div>
            ) : null}
            {eyeOverlay ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.88)',
                  display: 'flex',
                  flexDirection: 'column',
                  fontSize: 15,
                  fontWeight: 700,
                  left: eyeOverlay.note.x,
                  letterSpacing: '0.7px',
                  lineHeight: 1.16,
                  position: 'absolute',
                  top: eyeOverlay.note.y,
                  width: 270,
                }}
              >
                <span>PROPORTION / HARMONY</span>
                <span>MEASURED AGAINST EYE</span>
                <span>SPACING, MIDLINE AND</span>
                <span>FEATURE BALANCE.</span>
              </div>
            ) : null}
            <div
              style={{
                alignItems: 'flex-end',
                bottom: 70,
                display: 'flex',
                left: 88,
                lineHeight: 0.82,
                position: 'absolute',
              }}
            >
              <span style={{ fontSize: 118, fontWeight: 800, letterSpacing: '-8px' }}>{pslScore}</span>
              <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-3px', marginBottom: 6, marginLeft: 10 }}>
                /8
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                left: 88,
                position: 'absolute',
                top: 84,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '1px' }}>MOGGING REPORT</span>
              <span style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-4px', lineHeight: 0.92, marginTop: 18, maxWidth: 330 }}>
                Facial Aesthetic Assessment
              </span>
            </div>
            <div
              style={{
                alignItems: 'flex-end',
                borderTop: '2px solid rgba(255,255,255,0.72)',
                bottom: 60,
                display: 'flex',
                gap: 18,
                left: 374,
                paddingTop: 16,
                position: 'absolute',
                right: 88,
              }}
            >
              <MetaBlock label="NAME" value={displayName} width={160} />
              <MetaBlock label="GENDER" value={gender} width={100} />
              <MetaBlock label="TYPE" value={tier} width={185} />
              <MetaBlock label="HARM." value={harmony} width={82} />
              <MetaBlock label="DIMORPH." value={dimorphism} width={90} />
            </div>
          </div>
        </div>
      ),
      {
        width,
        height,
      }
    )

    const buffer = Buffer.from(await image.arrayBuffer())
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'image/png')
    res.status(200).send(buffer)
    return
  } catch (error) {
    console.error(error)
    res.status(404).end('Report image not found')
  }
}

function absoluteImageUrl(src: string, req: NextApiRequest) {
  if (/^https?:\/\//i.test(src)) return src

  const host = req.headers.host ?? 'localhost:3000'
  const proto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : 'http'
  return `${proto}://${host}${src.startsWith('/') ? src : `/${src}`}`
}

function formatScore(score: number | null) {
  return typeof score === 'number' ? score.toFixed(1) : '--'
}

function formatMetric(score: number | null) {
  return typeof score === 'number' ? score.toFixed(1) : '--'
}

function MetaBlock({ label, value, width: blockWidth }: { label: string; value: string; width: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: blockWidth }}>
      <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 20, fontWeight: 700, letterSpacing: '1px' }}>
        {label} /
      </span>
      <span style={{ color: '#ffffff', fontSize: 24, fontWeight: 800, letterSpacing: '0.3px', marginTop: 8 }}>
        {value}
      </span>
    </div>
  )
}

function getEyeOverlay(landmarks: FaceLandmarksPayload | null, pslScore: number | null) {
  if (!landmarks || landmarks.confidence < 0.5) return null

  const leftOuter = projectPoint(landmarks.anchors.leftEyeOuter, landmarks)
  const leftInner = projectPoint(landmarks.anchors.leftEyeInner, landmarks)
  const rightInner = projectPoint(landmarks.anchors.rightEyeInner, landmarks)
  const rightOuter = projectPoint(landmarks.anchors.rightEyeOuter, landmarks)
  const leftPupil = projectPoint(landmarks.anchors.leftPupil ?? landmarks.anchors.leftEyeInner, landmarks)
  const rightPupil = projectPoint(landmarks.anchors.rightPupil ?? landmarks.anchors.rightEyeInner, landmarks)
  if (!leftOuter || !leftInner || !rightInner || !rightOuter || !leftPupil || !rightPupil) return null

  const leftBox = boxFromPoints([leftOuter, leftInner, leftPupil], 18, 22)
  const rightBox = boxFromPoints([rightInner, rightOuter, rightPupil], 18, 22)
  const bridgeBox = boxFromPoints([leftInner, rightInner], 10, 32)
  const scoreLabel = typeof pslScore === 'number' ? `${pslScore.toFixed(1)} / 8` : 'MEASURED'

  return {
    leftBox,
    rightBox,
    bridgeBox,
    leftPupil,
    rightPupil,
    callout: {
      x: Math.min(photo.width - 292, rightBox.x + rightBox.width + 38),
      y: Math.max(86, rightBox.y - 4),
    },
    leftLabel: {
      x: Math.max(72, leftBox.x - 10),
      y: leftBox.y + leftBox.height + 10,
    },
    rightLabel: {
      x: Math.min(photo.width - 310, rightBox.x + rightBox.width + 30),
      y: Math.max(72, rightBox.y - 22),
    },
    note: {
      x: Math.min(photo.width - 338, rightBox.x + rightBox.width + 34),
      y: Math.max(118, rightBox.y + 24),
    },
    scoreLabel,
  }
}

function getSymmetryOverlay(landmarks: FaceLandmarksPayload | null) {
  if (!landmarks || landmarks.confidence < 0.5) return null

  const forehead = projectPoint(landmarks.anchors.forehead, landmarks)
  const chin = projectPoint(landmarks.anchors.chin, landmarks)
  if (!forehead || !chin) return null

  return {
    top: forehead,
    bottom: chin,
  }
}

function projectPoint(point: NormalizedPoint | undefined, landmarks: FaceLandmarksPayload) {
  if (!point) return null

  const sourceWidth = landmarks.image.width
  const sourceHeight = landmarks.image.height
  const scale = Math.max(photo.width / sourceWidth, photo.height / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const offsetX = (photo.width - renderedWidth) / 2
  const offsetY = (photo.height - renderedHeight) / 2

  return {
    x: offsetX + point.x * sourceWidth * scale,
    y: offsetY + point.y * sourceHeight * scale,
  }
}

function boxFromPoints(points: Array<{ x: number; y: number }>, paddingX: number, paddingY: number) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: Math.max(48, minX - paddingX),
    y: Math.max(48, minY - paddingY),
    width: Math.min(photo.width - 96, maxX + paddingX) - Math.max(48, minX - paddingX),
    height: Math.min(photo.height - 96, maxY + paddingY) - Math.max(48, minY - paddingY),
  }
}
