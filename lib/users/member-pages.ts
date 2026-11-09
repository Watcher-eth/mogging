import type { SkinPortrait } from '@/components/analysis/progress-skin-portrait'
import type { GetServerSideProps } from 'next'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getAuthSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { getEntitlementSummary } from '@/lib/payments/entitlements'
import { deriveProtocolProfile } from '@/lib/creator/protocol-tasks'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
export type ProgressEvaluation = { id: string; date: string; scores: Record<string, number>; potential?: number }

export function memberPage(page: 'protocol' | 'progress'): GetServerSideProps {
  return async ({ req, res }) => {
    res.setHeader('Cache-Control', 'private, no-store')
    const session = await getAuthSession(req, res)
    const userId = session?.user?.id
    if (!userId) return { redirect: { destination: `/?login=1&next=%2F${page}`, permanent: false } }

    const access = await getEntitlementSummary({ userId })
    if (!access.subscription.active) return { notFound: true }

    const { analyses, photos } = schema
    const rows = await db.select({
      id: analyses.id, date: analyses.createdAt, psl: analyses.pslScore, metrics: analyses.metrics, gender: photos.gender,
    }).from(analyses).innerJoin(photos, eq(analyses.photoId, photos.id))
      .where(and(eq(photos.userId, userId), eq(photos.photoType, 'face'), eq(analyses.status, 'complete'),
        sql`coalesce(${analyses.metrics}->>'presentation', '') <> 'face-study'`))
      .orderBy(desc(analyses.createdAt), desc(analyses.id)).limit(100)

    const evaluations: ProgressEvaluation[] = []
    let latest: Record<string, unknown> | null = null
    for (const row of rows) {
      const expanded = record(row.metrics.webReportV2)
      const report = record(row.metrics.report)
      const detail = expanded?.version === 2 ? expanded : report
      const categories = Array.isArray(detail?.categories) ? detail.categories : []
      if (!latest && categories.length) latest = detail
      const scores: Record<string, number> = Object.create(null)
      for (const value of categories) {
        const entry = record(value)
        if (typeof entry?.id !== 'string' || typeof entry.score !== 'number' || entry.score < 0 || entry.score > 10 || !Number.isFinite(entry.score)) continue
        scores[metricAliases.get(entry.id) ?? entry.id] = entry.score
      }
      const overall = expanded?.overallScore
      if (typeof overall === 'number' && Number.isFinite(overall) && overall >= 0 && overall <= 10) scores.overall = overall
      else if (scores.overall === undefined && row.psl !== null && Number.isFinite(row.psl) && row.psl >= 0 && row.psl <= 8) scores.overall = row.psl * 1.25
      if (Object.keys(scores).length) {
        const potential = record(report?.potential)?.score ?? record(expanded?.potential)?.score
        evaluations.push({
          id: row.id,
          date: row.date.toISOString(),
          scores: { ...scores },
          ...(page === 'progress' && typeof potential === 'number' && potential >= 1 && potential <= 8
            ? { potential: pslToOverallScore(potential) } : {}),
        })
      }
    }

    const profile = deriveProtocolProfile({ report: latest, startedOn: evaluations.at(-1)?.date.slice(0, 10) })
    if (page === 'protocol') return { props: { userId, profile, hasEvaluation: evaluations.length > 0, gender: rows[0]?.gender ?? null } }

    const latestId = rows[0]?.id
    const [photo] = latestId ? await db.select({ src: photos.imageUrl, landmarks: analyses.landmarks })
      .from(analyses).innerJoin(photos, eq(analyses.photoId, photos.id))
      .where(and(eq(analyses.id, latestId), eq(photos.userId, userId))).limit(1) : []
    const skinPortrait: SkinPortrait | null = photo
      ? { src: photo.src, landmarks: photo.landmarks as SkinPortrait['landmarks'] }
      : null
    return { props: { evaluations, focusIds: profile.focusIds, skinPortrait } }
  }
}

const metricAliases = new Map([['face-shape', 'face'], ['eyebrows', 'brows'], ['lips', 'mouth'], ['cheekbones', 'cheeks']])
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
