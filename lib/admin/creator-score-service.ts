import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { calculateCreatorScores, CREATOR_SCORE_VERSION, type CreatorScore, type CreatorScoreReport, type ScoreHistoryEntry, type ScoreInput } from './creator-score-policy'

export type ScoreTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// The transaction-wide lock prevents duplicate baselines and out-of-order snapshots.
export async function reconcileCreatorScoresInTransaction(tx: ScoreTransaction, reason: string, actor: string | null = null): Promise<CreatorScoreReport> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('creator-score-history-v1', 0))`)
  const now = new Date()
  const [row] = await tx.execute(sql`
    with creators as (select id,display_name as name from creator_profiles), posts as (
      select s.id,s.creator_profile_id as "creatorId",s.sprint_id as "campaignId",s.status,
        s.admin_view_count_threshold as views,s.admin_us_audience_percent as audience,
        coalesce(s.posted_at,(select min(u.created_at) from creator_submission_updates u where u.submission_id=s.id and u.type='submitted'),s.created_at) as "postedAt",
        coalesce(s.sprint_terms,c.terms) as terms,
        case when s.status in ('approved','paid') then coalesce(s.approved_amount_cents,0) else 0 end as "earnedCents",
        coalesce((s.bonus_placement->>'bioLinkVerified')::boolean,false) as "bioVerified",
        s.bonus_placement->>'checkedAt' as "bioCheckedAt",s.social_account_id as "accountId"
      from creator_submissions s left join creator_sprints c on c.id=s.sprint_id where not s.is_draft
    ), warnings as (
      select id,creator_profile_id as "creatorId",category,penalty_points as points,submission_id as "submissionId",(resolved_at is not null) as resolved,created_at as "createdAt" from creator_internal_warnings
    ), accounts as (select id,creator_profile_id as "creatorId",followers from creator_social_accounts), payments as (
      select creator_profile_id as "creatorId",submission_id as "submissionId",amount_cents as cents,currency from creator_payments where status in ('pending','processing','paid')
    ), campaigns as (select id,name from creator_sprints)
    select json_build_object('creators',(select coalesce(json_agg(r),'[]'::json) from creators r),'posts',(select coalesce(json_agg(r),'[]'::json) from posts r),
      'warnings',(select coalesce(json_agg(r),'[]'::json) from warnings r),'accounts',(select coalesce(json_agg(r),'[]'::json) from accounts r),
      'payments',(select coalesce(json_agg(r),'[]'::json) from payments r),'campaigns',(select coalesce(json_agg(r),'[]'::json) from campaigns r)) as input
  `)
  const scores = calculateCreatorScores(row.input as ScoreInput, now)
  const previousRows = await tx.execute(sql`select distinct on (creator_profile_id) creator_profile_id,score,source_hash,delta,created_at from creator_score_history order by creator_profile_id,created_at desc,id desc`)
  const previous = new Map(previousRows.map(row => [row.creator_profile_id as string, row]))
  const inserts: { id: string; creatorId: string; score: CreatorScore; hash: string; delta: number; reason: string; actor: string | null; at: string }[] = []
  const creators = scores.map(score => {
    const old = previous.get(score.creatorId)
    // SQL row order is not guaranteed; stable penalty order is part of the fingerprint.
    score.penalties.sort((a, b) => a.id.localeCompare(b.id))
    const hash = createHash('sha256').update(JSON.stringify(score)).digest('hex')
    const changed = hash !== old?.source_hash
    const delta = old ? score.total - (old.score as CreatorScore).total : 0
    if (changed) inserts.push({ id: crypto.randomUUID(), creatorId: score.creatorId, score, hash, delta, reason: old ? reason : 'Initial score baseline', actor, at: now.toISOString() })
    return { ...score, rank: null as number | null, updatedAt: changed ? now.toISOString() : new Date(old!.created_at as string).toISOString(), delta: changed ? delta : Number(old?.delta || 0) }
  })
  if (inserts.length) await tx.execute(sql`insert into creator_score_history(id,creator_profile_id,score,source_hash,delta,reason,actor,created_at)
    select r.id,r."creatorId",r.score,r.hash,r.delta,r.reason,r.actor,r.at::timestamp from jsonb_to_recordset(${JSON.stringify(inserts)}::jsonb) as r(id text,"creatorId" text,score jsonb,hash text,delta integer,reason text,actor text,at text)`)
  creators.sort((a, b) => Number(b.assessed) - Number(a.assessed) || b.total - a.total || a.name.localeCompare(b.name) || a.creatorId.localeCompare(b.creatorId))
  let rank = 0
  for (const creator of creators) if (creator.assessed) creator.rank = ++rank
  return { creators, generatedAt: now.toISOString(), version: CREATOR_SCORE_VERSION }
}

export async function reconcileCreatorScores(reason = 'Automatic refresh: verified metrics, activity and warnings', actor: string | null = null) {
  return db.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '20s'`)
    return reconcileCreatorScoresInTransaction(tx, reason, actor)
  })
}

export async function getCreatorScoreHistory(creatorId: string, before?: string): Promise<{ entries: ScoreHistoryEntry[]; nextCursor: string | null }> {
  const exists = await db.execute(sql`select id from creator_profiles where id=${creatorId}`)
  if (!exists.length) throw new ApiError(404, 'Creator not found')
  const rows = await db.execute(sql`select id,score,delta,reason,actor,created_at from creator_score_history where creator_profile_id=${creatorId}
    ${before ? sql`and (created_at,id) < (select created_at,id from creator_score_history where id=${before} and creator_profile_id=${creatorId})` : sql``}
    order by created_at desc,id desc limit 51`)
  const entries = rows.slice(0, 50).map(row => ({ id: row.id as string, score: row.score as CreatorScore, delta: Number(row.delta), reason: row.reason as string, actor: row.actor as string | null, createdAt: new Date(row.created_at as string).toISOString() }))
  return { entries, nextCursor: rows.length > 50 ? entries[entries.length - 1].id : null }
}
