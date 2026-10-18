import postgres from 'postgres'
import { creatorPostIdentity, resolveCreatorPostIdentity } from '../../lib/creator/post-identity'

const apply = process.argv.includes('--apply')
const db = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
try {
  const rows = await db.begin('read only', tx => tx<{
    id: string; post_url: string | null; status: string; name: string; pending_cents: number; paid_cents: number
  }[]>`select s.id, s.post_url, s.status, p.display_name as name,
    coalesce((select sum(amount_cents) from creator_payments where submission_id=s.id and status in ('pending','processing')),0)::int pending_cents,
    coalesce((select sum(amount_cents) from creator_payments where submission_id=s.id and status='paid'),0)::int paid_cents
    from creator_submissions s join creator_profiles p on p.id=s.creator_profile_id order by s.created_at`)
  const resolved: (typeof rows[number] & { key: string })[] = []
  const unresolved: (typeof rows[number])[] = []
  for (const row of rows) {
    if (!row.post_url) continue
    try { resolved.push({ ...row, key: creatorPostIdentity(row.post_url) || await resolveCreatorPostIdentity(row.post_url) }) }
    catch { unresolved.push(row) }
  }
  const groups = Map.groupBy(resolved, row => row.key)
  const duplicates = [...groups.values()].filter(group => group.length > 1)
  if (apply) {
    if (unresolved.some(row => row.status !== 'rejected')) throw new Error('Resolve active shared links before backfilling identities')
    if (duplicates.some(group => group.filter(row => row.status !== 'rejected').length > 1)) throw new Error('Resolve duplicate active submissions before backfilling identities')
    await db.begin(async tx => {
      // Preserve submitted URLs, statuses, earnings and payment history.
      for (const row of resolved) await tx`update creator_submissions set post_key=${row.key} where id=${row.id} and post_url=${row.post_url}`
    })
  }
  console.log(JSON.stringify({ mode: apply ? 'backfill' : 'audit', submissions: rows.length, resolved: resolved.length, withoutUrl: rows.filter(row => !row.post_url).length, unresolved, duplicates }, null, 2))
} finally { await db.end() }
