import type { GetServerSideProps } from 'next'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { getAuthSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { getEntitlementSummary } from '@/lib/payments/entitlements'
import { deriveProtocolProfile } from '@/lib/creator/protocol-tasks'
import { readFeatureMeasurements } from '@/lib/analysis-v2/feature-history'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
export type ProgressEvaluation = { id: string; date: string; scores: Record<string, number>; measurements?: Record<string, number>; potential?: number }
export type MemberProfile = { imageUrl: string | null; score: number | null }

const { analyses, photos } = schema

function savedEvaluations(userId: string) {
  return and(eq(photos.userId, userId), eq(photos.photoType, 'face'), eq(analyses.status, 'complete'),
    sql`coalesce(${analyses.metrics}->>'presentation', '') <> 'face-study'`)
}

export async function getMemberProfile(userId: string): Promise<MemberProfile> {
  const where = savedEvaluations(userId)
  const [[first], [latest]] = await Promise.all([
    db.select({ imageUrl: photos.imageUrl }).from(analyses).innerJoin(photos, eq(analyses.photoId, photos.id))
      .where(where).orderBy(asc(analyses.createdAt), asc(analyses.id)).limit(1),
    db.select({ metrics: analyses.metrics, psl: analyses.pslScore }).from(analyses).innerJoin(photos, eq(analyses.photoId, photos.id))
      .where(where).orderBy(desc(analyses.createdAt), desc(analyses.id)).limit(1),
  ])
  if (!latest) return { imageUrl: first?.imageUrl ?? null, score: null }
  const { expanded, categories } = evaluationMetrics(latest.metrics)
  return { imageUrl: first?.imageUrl ?? null, score: overallScore(expanded, categories, latest.psl) }
}

function evaluationMetrics(metrics: Record<string, unknown>) {
  const expanded = record(metrics.webReportV2)
  const report = record(metrics.report)
  const detail = expanded?.version === 2 ? expanded : report
  const categories: unknown[] = Array.isArray(detail?.categories) ? detail.categories : []
  return { expanded, report, detail, categories }
}

function overallScore(expanded: Record<string, unknown> | null, categories: unknown[], psl: number | null) {
  if (validScore(expanded?.overallScore)) return expanded.overallScore
  const category = categories.map(record).findLast(entry => entry?.id === 'overall' && validScore(entry.score))
  if (validScore(category?.score)) return category.score
  return typeof psl === 'number' && Number.isFinite(psl) && psl >= 0 && psl <= 8 ? psl * 1.25 : null
}

function validScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10
}

export function memberPage(page: 'protocol' | 'progress'): GetServerSideProps {
  return async ({ req, res }) => {
    res.setHeader('Cache-Control', 'private, no-store')
    const session = await getAuthSession(req, res)
    const userId = session?.user?.id
    if (!userId) return { redirect: { destination: `/?login=1&next=%2F${page}`, permanent: false } }

    const access = await getEntitlementSummary({ userId })
    if (!access.subscription.active) return { notFound: true }

    const rows = await db.select({
      id: analyses.id, date: analyses.createdAt, psl: analyses.pslScore, metrics: analyses.metrics, gender: photos.gender,
    }).from(analyses).innerJoin(photos, eq(analyses.photoId, photos.id))
      .where(savedEvaluations(userId))
      .orderBy(desc(analyses.createdAt), desc(analyses.id)).limit(100)

    const evaluations: ProgressEvaluation[] = []
    let latest: Record<string, unknown> | null = null
    for (const row of rows) {
      const { expanded, report, detail, categories } = evaluationMetrics(row.metrics)
      if (!latest && categories.length) latest = detail
      const scores: Record<string, number> = Object.create(null)
      for (const value of categories) {
        const entry = record(value)
        if (typeof entry?.id !== 'string' || !validScore(entry.score)) continue
        scores[metricAliases.get(entry.id) ?? entry.id] = entry.score
      }
      const overall = overallScore(expanded, categories, row.psl)
      if (overall !== null) scores.overall = overall
      const measurements = page === 'progress' ? readFeatureMeasurements(expanded?.entries) : undefined
      if (Object.keys(scores).length || measurements) {
        const potential = record(report?.potential)?.score ?? record(expanded?.potential)?.score
        evaluations.push({
          id: row.id,
          date: row.date.toISOString(),
          scores: { ...scores },
          ...(measurements ? { measurements } : {}),
          ...(page === 'progress' && typeof potential === 'number' && potential >= 1 && potential <= 8
            ? { potential: pslToOverallScore(potential) } : {}),
        })
      }
    }

    const profile = deriveProtocolProfile({ report: latest, startedOn: evaluations.at(-1)?.date.slice(0, 10) })
    if (page === 'protocol') return { props: { userId, profile, hasEvaluation: evaluations.length > 0, gender: rows[0]?.gender ?? null } }

    return { props: { evaluations, focusIds: profile.focusIds, userId } }
  }
}

const metricAliases = new Map([['face-shape', 'face'], ['eyebrows', 'brows'], ['lips', 'mouth'], ['cheekbones', 'cheeks']])
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
