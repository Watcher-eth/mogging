import { estimatedPopulationTopPercent } from '@/lib/sharing/population-percentile'
import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import { parseFaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { ShareOverallOverlay } from '@/lib/sharing/overall-overlay'
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
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
    const suppliedLandmarks = req.method === 'POST' ? req.body?.landmarks : share.analysis.landmarks
    const landmarks = parseFaceLandmarksPayload(suppliedLandmarks)
    if (req.method === 'POST' && suppliedLandmarks !== null && !landmarks) {
      res.status(400).end('Invalid landmarks')
      return
    }
    const imageUrl = absoluteImageUrl(share.photo.imageUrl, req)
    const totalDisplayScore = readReportTotalScore(share.analysis.metrics, share.analysis.pslScore)
    const totalScore = formatScore(totalDisplayScore)
    const topPercent = estimatedPopulationTopPercent(Number(totalScore))
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

          <ShareOverallOverlay landmarks={landmarks} {...storySize} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              left: 78,
              position: 'absolute',
              top: 104,
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '1.2px' }}>MOGGING.COM</span>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.6px', marginTop: 12, opacity: 0.76 }}>{tier}</span>
          </div>

          {topPercent !== null && (
            <div style={{ position: 'absolute', top: 100, left: 410, width: 260, height: 82,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: 48, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.14)' }}>
              <span style={{ fontSize: 28, fontWeight: 800 }}>Top {topPercent}%</span>
              <span style={{ fontSize: 16, letterSpacing: '1px', marginTop: 5, opacity: 0.72 }}>ESTIMATED</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', right: 78, position: 'absolute', top: 104 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '1.2px' }}>RANK</span>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.6px', marginTop: 12, opacity: 0.76 }}>{rank.toUpperCase()}</span>
          </div>

          <div
            style={{
              alignItems: 'flex-end',
              bottom: 92,
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
        </div>
      ),
      storySize
    )

    const buffer = Buffer.from(await image.arrayBuffer())
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'image/png')
    res.status(200).send(buffer)
  } catch (error) {
    console.error(error)
    res.status(404).end('Share image not found')
  }
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
        <span style={{ fontSize: 176, fontWeight: 800, letterSpacing: 0, marginLeft: align === 'left' ? -8 : 0, marginRight: align === 'right' ? -20 : 0, opacity: align === 'right' ? 0.8 : 1 }}>{score}</span>
      </div>
    </div>
  )
}

function getLooksmaxRank(score: number | null, gender: 'male' | 'female' | 'other') {
  const value = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : null
  if (value === null) return 'Unranked'

  if (gender === 'female') {
    if (value >= 9.2) return 'God Tier'
    if (value >= 8) return 'Stacy'
    if (value >= 7.55) return 'Stacy Lite'
    if (value >= 7) return 'HTB'
    if (value >= 6.15) return 'MTB'
    if (value >= 5.35) return 'LTB'
    if (value > 4) return 'Normie'
    return 'Gooner'
  }

  if (gender === 'male') {
    if (value >= 9.95) return 'True Adam'
    if (value >= 9.2) return 'God Tier'
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
  if (typeof rawScore === 'number') return normalizeReportCategoryScore(rawScore)

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
  if (!metrics || typeof metrics !== 'object') return null
  const record = metrics as Record<string, unknown>
  const report = record.report
  if (report && typeof report === 'object' && Array.isArray((report as Record<string, unknown>).categories)) return report as Record<string, unknown>
  return Array.isArray(record.categories) ? record : null
}

function readFiniteScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeReportCategoryScore(score: number) {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}
