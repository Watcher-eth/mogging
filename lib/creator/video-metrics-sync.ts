import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { hasVideoScope, queryTikTokVideos, refreshTikTokVideoToken, TikTokVideoError } from './tiktok-video-api'

// Prepared posts can predate their actual submission. Use the first submission event,
// with the row creation time as a fallback for older records without history.
const trackableSubmission = sql`not s.is_draft and s.post_key ~ '^tiktok:[0-9]+$'
  and coalesce((select min(u.created_at) from creator_submission_updates u
    where u.submission_id=s.id and u.type='submitted'), s.created_at)
    > (now() at time zone 'UTC') - interval '10 days'`

// Collection is independent of payout approvals. Never rewrite reviewed earnings or view thresholds.
export async function syncCreatorVideoMetrics(timeBudgetMs = 40_000) {
  const deadline = Date.now() + timeBudgetMs
  return db.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '8s'`)
    const [lock] = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended('creator-video-metrics',0)) as acquired`)
    if (!lock.acquired) return { status: 'already_running', accounts: 0, observations: 0 }
    // Current lower-bound reports are baselines, not historical or API-verified impressions.
    await tx.execute(sql`insert into creator_video_observations(post_key,source,observed_at,submission_id,views)
      select distinct on(s.post_key) s.post_key,'reported_threshold',date_trunc('hour',now() at time zone 'UTC'),s.id,
        greatest(coalesce(s.admin_view_count_threshold,0),coalesce(s.view_count_threshold,0))
      from creator_submissions s where not s.is_draft and s.post_key is not null
        and (s.admin_view_count_threshold is not null or s.view_count_threshold is not null)
        and not exists(select 1 from creator_video_observations o where o.post_key=s.post_key and o.source='reported_threshold'
          and o.views=greatest(coalesce(s.admin_view_count_threshold,0),coalesce(s.view_count_threshold,0)))
      order by s.post_key,s.updated_at desc on conflict do nothing`)
    await tx.execute(sql`insert into creator_video_observations(post_key,source,observed_at,submission_id,measured_at,views)
      select distinct on(s.post_key,a.assessed_at) s.post_key,'verified_recording',a.assessed_at,s.id,a.assessed_at,(a.data#>>'{metrics,totalViews}')::bigint
      from creator_submission_analytics a join creator_submissions s on s.id=a.submission_id
      where not s.is_draft and s.post_key is not null and a.data#>>'{metricsVerified,totalViews}'='true'
        and a.data#>>'{metricsVerified,totalViewsExact}'='true' and a.data#>>'{metrics,totalViewsExact}'='true'
        and a.data->>'storageKey'=a.storage_key
        and (a.data#>>'{metrics,totalViews}') ~ '^[0-9]{1,10}$'
        and case when (a.data#>>'{metrics,totalViews}') ~ '^[0-9]{1,10}$' then (a.data#>>'{metrics,totalViews}')::numeric<=2000000000 else false end
      order by s.post_key,a.assessed_at on conflict do nothing`)
    const accounts = await tx.execute(sql`select a.id,a.provider_account_id,p.user_id,a.connection_method,coalesce(state.cursor,0) as cursor
      from creator_social_accounts a join creator_profiles p on p.id=a.creator_profile_id
      left join creator_video_sync_state state on state.account_id=a.id
      where a.platform='tiktok' and p.auth_status<>'suspended'
        and exists(select 1 from creator_submissions s where s.social_account_id=a.id and ${trackableSubmission})
        and (state.next_attempt_at is null or state.next_attempt_at<=now() at time zone 'UTC'
          or a.oauth_verified_at>state.checked_at)
      order by state.next_attempt_at asc nulls first,a.id limit 10`)
    let observations = 0, checked = 0
    for (const account of accounts) {
      if (Date.now() > deadline - 23_000) break
      let status = 'connection_required'
      let syncedAt: Date | undefined
      let cursor = Number(account.cursor)
      try {
        const [tokens] = account.connection_method === 'oauth' ? await tx.select().from(schema.accounts).where(and(
          eq(schema.accounts.provider, 'tiktok-creator'), eq(schema.accounts.providerAccountId, String(account.provider_account_id)),
          eq(schema.accounts.userId, String(account.user_id)))).for('update') : []
        if (tokens && !hasVideoScope(tokens.scope)) status = 'video_scope_required'
        else if (tokens && tokens.access_token) {
          let access = tokens.access_token
          if (!tokens.expires_at || tokens.expires_at <= Date.now() / 1000 + 120) {
            if (!tokens.refresh_token || !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new TikTokVideoError('reconnect_required')
            const refreshed = await refreshTikTokVideoToken(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET, tokens.refresh_token)
            if (refreshed.open_id !== tokens.providerAccountId || !hasVideoScope(refreshed.scope)) throw new TikTokVideoError('reconnect_required')
            await tx.update(schema.accounts).set({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token,
              expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in, scope: refreshed.scope.replaceAll(',', ' ') })
              .where(and(eq(schema.accounts.provider, 'tiktok-creator'), eq(schema.accounts.providerAccountId, tokens.providerAccountId)))
            access = refreshed.access_token
          }
          // Rotate through in-window posts, including private/missing videos.
          // A missing response must not starve the rest of an account's catalog.
          const batch = await tx.execute(sql`select distinct on(s.post_key) s.id,s.post_key from creator_submissions s
            where s.social_account_id=${String(account.id)} and ${trackableSubmission}
            order by s.post_key,s.created_at offset ${cursor} limit 20`)
          const videos = await queryTikTokVideos(access, batch.map(post => String(post.post_key).slice(7)))
          const observed = new Date(); observed.setUTCMinutes(0,0,0)
          for (const video of videos) {
            const post = batch.find(post => post.post_key === `tiktok:${video.id}`)!
            await tx.insert(schema.creatorVideoObservations).values({ postKey: String(post.post_key), source: 'tiktok_api', observedAt: observed,
              measuredAt: new Date(), submissionId: String(post.id), views: video.view_count,
              likes: video.like_count, comments: video.comment_count, shares: video.share_count }).onConflictDoNothing()
            // Only API-verified publication timestamps enter this field.
            await tx.update(schema.creatorSubmissions).set({ postedAt: new Date(video.create_time * 1000) })
              .where(and(eq(schema.creatorSubmissions.id, String(post.id)), sql`${schema.creatorSubmissions.postedAt} is null`))
          }
          cursor = batch.length === 20 ? cursor + batch.length : 0
          observations += videos.length
          status = !batch.length ? 'canonical_post_required' : videos.length < batch.length ? 'partial_video_access' : 'synced'
          if (videos.length) syncedAt = new Date()
        }
      } catch (error) {
        // Provider errors are actionable categories, never raw token-bearing responses.
        status = error instanceof TikTokVideoError ? error.reason : 'provider_unavailable'
      }
      const now = new Date()
      const next = new Date(now.getTime() + (['connection_required','video_scope_required','reconnect_required'].includes(status) ? 24 : ['provider_unavailable','rate_limited'].includes(status) || cursor > 0 ? .25 : 1) * 3600_000)
      await tx.insert(schema.creatorVideoSyncState).values({ accountId: String(account.id), status, checkedAt: now, syncedAt, cursor, nextAttemptAt: next })
        .onConflictDoUpdate({ target: schema.creatorVideoSyncState.accountId, set: { status, checkedAt: now, cursor, ...(syncedAt ? { syncedAt } : {}), nextAttemptAt: next } })
      checked++
    }
    return { status: 'complete', accounts: checked, observations }
  })
}
