// Exercises real Postgres persistence using temporary tables only; public data is read-only.
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reconcileCreatorScoresInTransaction } from '@/lib/admin/creator-score-service'

await db.transaction(async tx => {
  await tx.execute(sql`set local statement_timeout = '20s'`)
  await tx.execute(sql`create temp table creator_internal_warnings (like public.creator_internal_warnings including defaults) on commit drop`)
  await tx.execute(sql`alter table creator_internal_warnings add column if not exists category text not null default 'other', add column if not exists penalty_points integer not null default 0, add column if not exists submission_id text`)
  await tx.execute(sql`create temp table creator_score_history (id text primary key,creator_profile_id text not null,score jsonb not null,source_hash text not null,delta integer not null,reason text not null,actor text,created_at timestamp not null) on commit drop`)
  const initial = await reconcileCreatorScoresInTransaction(tx, 'Integration baseline', 'test-admin')
  if (!initial.creators.length) throw new Error('Expected existing creator data')
  const [first] = await tx.execute(sql`select count(*)::int as n from creator_score_history`)
  await reconcileCreatorScoresInTransaction(tx, 'Identical refresh', 'test-admin')
  const [second] = await tx.execute(sql`select count(*)::int as n from creator_score_history`)
  if (first.n !== second.n || first.n !== initial.creators.length) throw new Error('Duplicate snapshots created')
  const creator = initial.creators.find(creator => creator.total > 40)!
  await tx.execute(sql`insert into creator_internal_warnings(id,creator_profile_id,note,category,penalty_points,created_by_email,created_at) values ('score-integration-warning',${creator.creatorId},'Temporary integration evidence','views_mismatch',40,'test-admin',now())`)
  const penalized = await reconcileCreatorScoresInTransaction(tx, 'Warning added', 'test-admin')
  if (penalized.creators.find(row => row.creatorId === creator.creatorId)!.total !== creator.total - 40) throw new Error('Warning deduction not persisted')
  await tx.execute(sql`update creator_internal_warnings set resolved_at=now(),resolved_by_email='test-admin' where id='score-integration-warning'`)
  const restored = await reconcileCreatorScoresInTransaction(tx, 'Warning resolved', 'test-admin')
  if (restored.creators.find(row => row.creatorId === creator.creatorId)!.total !== creator.total) throw new Error('Resolution did not restore score')
  const history = await tx.execute(sql`select score,delta,reason from creator_score_history where creator_profile_id=${creator.creatorId} order by created_at,id`)
  if (history.length !== 3 || Number(history[1].delta) !== -40 || Number(history[2].delta) !== 40) throw new Error('History deltas are incorrect')
  if ((history[0].score as { penalties: unknown[] }).penalties.length !== 0) throw new Error('Baseline snapshot mutated')
  console.log(JSON.stringify({ creators: initial.creators.length, ranked: initial.creators.filter(row => row.assessed).length, snapshotsIdempotent: true, deduction: -40, restoration: 40, immutableBaseline: true, publicWrites: 0 }))
})
process.exit(0)
