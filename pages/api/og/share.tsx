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

type ImageDimensions = {
  width: number
  height: number
}

type CoverFrame = {
  x: number
  y: number
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
    const sourceGeometry = getReportOverlayGeometry(category, landmarks)
    const imageFrame = getImageCoverFrame(landmarks?.image ?? null, storySize)
    const geometry = mapLandmarkGeometryToStoryFrame(sourceGeometry, imageFrame, storySize)
    const yOffset = geometry.usesLandmarks ? 0 : getReportOverlayYOffset(category.id)
    const totalDisplayScore = readReportTotalScore(share.analysis.metrics, share.analysis.pslScore)
    const totalScore = formatScore(totalDisplayScore)
    const potential = readReportPotential(share.analysis.metrics, share.analysis.pslScore, totalDisplayScore)
    const rank = getLooksmaxRank(totalDisplayScore, share.photo.gender)
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
              width: '100%',
            }}
          />
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.08) 36%, rgba(0,0,0,0.82) 100%)',
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
              background: 'linear-gradient(90deg, rgba(0,0,0,0.4) 0%, rgba(12,34,28,0.12) 42%, rgba(0,0,0,0.28) 100%)',
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
              background: 'linear-gradient(140deg, rgba(226,205,164,0.12) 0%, rgba(20,42,34,0.14) 42%, rgba(0,0,0,0.24) 100%)',
              bottom: 0,
              display: 'flex',
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />

          <ReportOverlaySvg categoryId={category.id} geometry={geometry} yOffset={yOffset} size={storySize} />

          <RankBadge label={rank} />

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
              justifyContent: 'space-between',
              left: 78,
              lineHeight: 0.82,
              position: 'absolute',
              right: 78,
            }}
          >
            <ScoreBlock align="left" label="TOTAL SCORE" score={totalScore} />
            <ScoreBlock align="right" label="POTENTIAL" score={potential.score} />
          </div>

          <div
            style={{
              bottom: 92,
              display: 'flex',
              justifyContent: 'flex-end',
              left: 78,
              position: 'absolute',
              right: 78,
            }}
          >
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
      {geometry.polylines.map((polyline, index) => (
        <path
          key={`${categoryId}-polyline-${index}`}
          d={toSvgPath(polyline.points, yOffset, Boolean(polyline.closed))}
          fill={polyline.closed ? 'rgba(255,255,255,0.08)' : 'none'}
          stroke="rgba(255,255,255,0.9)"
          strokeDasharray={polyline.dashed ? '12 14' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
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

function ScoreBlock({ align, label, score }: { align: 'left' | 'right'; label: string; score: string }) {
  return (
    <div
      style={{
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '1.3px', marginBottom: 18, opacity: 0.86 }}>{label}</span>
      <div style={{ alignItems: 'flex-end', display: 'flex' }}>
        <span style={{ fontSize: 176, fontWeight: 800, letterSpacing: '-10px' }}>{score}</span>
      </div>
    </div>
  )
}

function RankBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        left: 72,
        position: 'absolute',
        right: 72,
        textAlign: 'center',
        top: 254,
      }}
    >
      <span
        style={{
          color: 'rgba(0,0,0,0.54)',
          fontSize: 92,
          fontWeight: 650,
          letterSpacing: '-4.8px',
          lineHeight: 0.92,
          position: 'absolute',
          transform: 'translate(0px, 5px)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: 'rgba(255,255,255,0.96)',
          fontSize: 92,
          fontWeight: 650,
          letterSpacing: '-4.8px',
          lineHeight: 0.92,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}

function getLooksmaxRank(score: number | null, gender: 'male' | 'female' | 'other') {
  const value = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : null
  if (value === null) return 'Unranked'

  if (value >= 9.2) return 'God Tier'

  if (gender === 'female') {
    if (value >= 8) return 'Stacy'
    if (value >= 7.35) return 'Mogging'
    if (value >= 6.6) return 'Ascending'
    if (value >= 5.6) return 'Pretty'
    if (value > 4) return 'Normie'
    return 'Gooner'
  }

  if (gender === 'male') {
    if (value >= 8.5) return 'Chad'
    if (value >= 8) return 'Chadlite'
    if (value >= 7.35) return 'Mogging'
    if (value >= 6.6) return 'Ascending'
    if (value >= 5.6) return 'Normie+'
    if (value > 4) return 'Normie'
    return 'Gooner'
  }

  if (value >= 8) return 'Elite'
  if (value >= 7.35) return 'Mogging'
  if (value >= 6.6) return 'Ascending'
  if (value >= 5.6) return 'Normie+'
  if (value > 4) return 'Normie'
  return 'Gooner'
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

function readReportTotalScore(metrics: unknown, pslScore: number | null) {
  const report = readReportObject(metrics)
  const categories = report && Array.isArray(report.categories) ? report.categories : []
  const overall = categories.find((category) => (
    category && typeof category === 'object' && (category as Record<string, unknown>).id === 'overall'
  ))
  const rawScore = overall && typeof overall === 'object' ? readFiniteScore((overall as Record<string, unknown>).score) : undefined
  if (typeof rawScore === 'number') return normalizeReportCategoryScore('overall', rawScore)

  return toDisplayScore(pslScore)
}

function readReportPotential(metrics: unknown, pslScore: number | null, totalDisplayScore: number | null) {
  const report = readReportObject(metrics)
  const potential = report && typeof report === 'object' ? (report as Record<string, unknown>).potential : null
  const baselineScore = totalDisplayScore ?? toDisplayScore(pslScore) ?? 6.2
  const fallbackScore = Math.min(10, Math.round((baselineScore + 0.7) * 10) / 10)
  let candidate = fallbackScore

  if (potential && typeof potential === 'object') {
    const rawScore = readFiniteScore((potential as Record<string, unknown>).score)
    if (typeof rawScore === 'number') {
      if (rawScore > 0 && rawScore <= 2) {
        candidate = Math.round((baselineScore + rawScore) * 10) / 10
      } else if (rawScore <= 8) {
        candidate = toDisplayScore(rawScore) ?? fallbackScore
      } else {
        candidate = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10))
      }
    }
  }

  if (candidate <= baselineScore) {
    candidate = Math.min(10, Math.round((baselineScore + 0.3) * 10) / 10)
  }

  const label = potential && typeof potential === 'object' && typeof (potential as Record<string, unknown>).label === 'string'
    ? (potential as Record<string, string>).label
    : 'Clear upside'

  return {
    score: formatScore(Math.max(0, Math.min(10, candidate))),
    label,
  }
}

function readReportObject(metrics: unknown) {
  const report = metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>).report : null
  return report && typeof report === 'object' ? (report as Record<string, unknown>) : null
}

function readFiniteScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeReportCategoryScore(id: string, score: number) {
  if (id === 'overall' && score <= 8) return Math.round((score / 8) * 100) / 10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}

function getImageCoverFrame(image: ImageDimensions | null, canvas: CanvasSize): CoverFrame | null {
  if (!image || image.width <= 0 || image.height <= 0) return null

  const scale = Math.max(canvas.width / image.width, canvas.height / image.height)
  const width = image.width * scale
  const height = image.height * scale

  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

function mapLandmarkGeometryToStoryFrame(
  geometry: ReportOverlayGeometry,
  imageFrame: CoverFrame | null,
  canvas: CanvasSize
): ReportOverlayGeometry {
  if (!geometry.usesLandmarks || !imageFrame) return geometry

  const point = (value: { x: number; y: number }) => mapImagePercentPointToCanvasPercent(value, imageFrame, canvas)
  const line = (value: { x1: number; y1: number; x2: number; y2: number }) => {
    const start = point({ x: value.x1, y: value.y1 })
    const end = point({ x: value.x2, y: value.y2 })
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
  }
  const box = (value: { x: number; y: number; width: number; height: number; dashed?: boolean }) => {
    const start = point({ x: value.x, y: value.y })
    const end = point({ x: value.x + value.width, y: value.y + value.height })
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      dashed: value.dashed,
    }
  }
  const label = point(geometry.label)

  return {
    ...geometry,
    boxes: geometry.boxes.map(box),
    lines: geometry.lines.map(line),
    polylines: geometry.polylines.map((polyline) => ({
      ...polyline,
      points: polyline.points.map(point),
    })),
    points: geometry.points.map(point),
    label: {
      ...geometry.label,
      x: clampPercent(label.x, 6, 78),
      y: clampPercent(label.y, 6, 88),
    },
  }
}

function mapImagePercentPointToCanvasPercent(point: { x: number; y: number }, imageFrame: CoverFrame, canvas: CanvasSize) {
  return {
    x: ((imageFrame.x + (point.x / 100) * imageFrame.width) / canvas.width) * 100,
    y: ((imageFrame.y + (point.y / 100) * imageFrame.height) / canvas.height) * 100,
  }
}

function clampPercent(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function percentX(value: number) {
  return (value / 100) * storySize.width
}

function percentY(value: number) {
  return (value / 100) * storySize.height
}

function toSvgPath(points: Array<{ x: number; y: number }>, yOffset: number, closed: boolean) {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  const path = [
    `M ${percentX(first.x)} ${percentY(first.y + yOffset)}`,
    ...rest.map((point) => `L ${percentX(point.x)} ${percentY(point.y + yOffset)}`),
  ].join(' ')
  return closed ? `${path} Z` : path
}
