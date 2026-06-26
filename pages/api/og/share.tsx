import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { parseFaceLandmarksPayload } from '@/lib/analysis/landmarks'
import {
  getReportCategoryById,
  getReportOverlayGeometry,
  getReportOverlayYOffset,
  type ReportOverlayGeometry,
} from '@/lib/analysis/report-overlays'
import { getShareByToken } from '@/lib/sharing/service'

export const config = {
  maxDuration: 10,
}

type CanvasSize = {
  width: number
  height: number
}

const storySize: CanvasSize = {
  width: 1080,
  height: 1920,
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
    const category = getReportCategoryById(typeof req.query.overlay === 'string' ? req.query.overlay : 'overall')
    const geometry = getReportOverlayGeometry(category, landmarks)
    const yOffset = geometry.usesLandmarks ? 0 : getReportOverlayYOffset(category.id)
    const pslScore = formatScore(toDisplayScore(share.analysis.pslScore))
    const potential = readReportPotential(share.analysis.metrics, share.analysis.pslScore)
    const tier = (share.analysis.tier || 'Facial aesthetic').toUpperCase()

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
              transform: 'scale(1.14)',
              width: '100%',
            }}
          />
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.02) 38%, rgba(0,0,0,0.76) 100%)',
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
              background: 'linear-gradient(90deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.18) 100%)',
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
              border: '3px solid rgba(255,255,255,0.84)',
              bottom: 76,
              display: 'flex',
              left: 54,
              position: 'absolute',
              right: 54,
              top: 76,
            }}
          />

          <ReportOverlaySvg categoryId={category.id} geometry={geometry} yOffset={yOffset} size={storySize} />

          <div
            style={{
              alignItems: 'center',
              background: 'rgba(255,255,255,0.94)',
              color: '#171717',
              display: 'flex',
              fontSize: 26,
              fontWeight: 800,
              height: 44,
              justifyContent: 'center',
              left: percentX(geometry.label.x),
              letterSpacing: '-1px',
              position: 'absolute',
              top: percentY(geometry.label.y + yOffset),
              width: geometry.label.title.length > 10 ? 250 : 220,
            }}
          >
            {geometry.label.title.toUpperCase()}
          </div>

          <div
            style={{
              alignItems: 'center',
              background: 'rgba(255,255,255,0.94)',
              color: '#171717',
              display: 'flex',
              fontSize: 24,
              fontWeight: 800,
              height: 40,
              justifyContent: 'center',
              left: percentX(geometry.label.x),
              letterSpacing: '-0.7px',
              position: 'absolute',
              top: percentY(geometry.label.y + yOffset) + 52,
              width: 210,
            }}
          >
            {geometry.label.value.toUpperCase()}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              left: 78,
              position: 'absolute',
              top: 104,
            }}
          >
            <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: '1.2px' }}>MOGGING REPORT</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.6px', marginTop: 12, opacity: 0.76 }}>{tier}</span>
          </div>

          <div
            style={{
              alignItems: 'flex-end',
              bottom: 164,
              display: 'flex',
              left: 78,
              lineHeight: 0.82,
              position: 'absolute',
            }}
          >
            <span style={{ fontSize: 176, fontWeight: 800, letterSpacing: '-10px' }}>{pslScore}</span>
            <span style={{ fontSize: 70, fontWeight: 800, letterSpacing: '-4px', marginBottom: 10, marginLeft: 12 }}>/10</span>
          </div>

          <div
            style={{
              alignItems: 'center',
              background: 'rgba(255,255,255,0.94)',
              bottom: 292,
              color: '#171717',
              display: 'flex',
              fontSize: 24,
              fontWeight: 800,
              height: 46,
              justifyContent: 'center',
              left: 78,
              letterSpacing: '-0.5px',
              padding: '0 18px',
              position: 'absolute',
            }}
          >
            POTENTIAL {potential.score}/8 · {potential.label.toUpperCase()}
          </div>

          <div
            style={{
              borderTop: '2px solid rgba(255,255,255,0.76)',
              bottom: 92,
              display: 'flex',
              justifyContent: 'space-between',
              left: 78,
              paddingTop: 18,
              position: 'absolute',
              right: 78,
            }}
          >
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '1px' }}>{category.title.toUpperCase()} OVERLAY</span>
            <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 20, fontWeight: 700, letterSpacing: '0.8px' }}>MOGGING.COM</span>
          </div>
        </div>
      ),
      storySize
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

function ReportOverlaySvg({
  categoryId,
  geometry,
  size,
  yOffset,
}: {
  categoryId: string
  geometry: ReportOverlayGeometry
  size: CanvasSize
  yOffset: number
}) {
  return (
    <svg
      height={size.height}
      style={{ left: 0, position: 'absolute', top: 0 }}
      viewBox={`0 0 ${size.width} ${size.height}`}
      width={size.width}
    >
      {geometry.boxes.map((box, index) => (
        <rect
          key={`${categoryId}-box-${index}`}
          x={percentX(box.x)}
          y={percentY(box.y + yOffset)}
          width={percentX(box.width)}
          height={percentY(box.height)}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeDasharray={box.dashed ? '13 13' : undefined}
          strokeWidth="4"
        />
      ))}
      {geometry.lines.map((line, index) => (
        <line
          key={`${categoryId}-line-${index}`}
          x1={percentX(line.x1)}
          y1={percentY(line.y1 + yOffset)}
          x2={percentX(line.x2)}
          y2={percentY(line.y2 + yOffset)}
          stroke="rgba(255,255,255,0.88)"
          strokeDasharray={categoryId === 'overall' ? '12 14' : undefined}
          strokeLinecap="round"
          strokeWidth="4"
        />
      ))}
      {geometry.points.map((point, index) => (
        <g key={`${categoryId}-point-${index}`}>
          <circle cx={percentX(point.x)} cy={percentY(point.y + yOffset)} r="17" fill="none" stroke="rgba(255,255,255,0.72)" strokeDasharray="7 7" strokeWidth="4" />
          <circle cx={percentX(point.x)} cy={percentY(point.y + yOffset)} r="6" fill="white" />
        </g>
      ))}
    </svg>
  )
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

function toDisplayScore(score: number | null) {
  return typeof score === 'number' ? Math.max(0, Math.min(10, (Math.max(0, Math.min(8, score)) / 8) * 10)) : null
}

function readReportPotential(metrics: unknown, pslScore: number | null) {
  const report = metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>).report : null
  const potential = report && typeof report === 'object' ? (report as Record<string, unknown>).potential : null
  const score = potential && typeof potential === 'object' && typeof (potential as Record<string, unknown>).score === 'number'
    ? Math.max(0, Math.min(8, Math.round(((potential as Record<string, number>).score) * 10) / 10))
    : Math.max(0, Math.min(8, Math.round(((pslScore ?? 5) + 0.7) * 10) / 10))
  const label = potential && typeof potential === 'object' && typeof (potential as Record<string, unknown>).label === 'string'
    ? (potential as Record<string, string>).label
    : 'Clear upside'

  return {
    score: score.toFixed(1),
    label,
  }
}

function percentX(value: number) {
  return (value / 100) * storySize.width
}

function percentY(value: number) {
  return (value / 100) * storySize.height
}
