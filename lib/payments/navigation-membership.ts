import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { fetchRevenueCatSubscriber, readRevenueCatPro } from './revenuecat'
import { webAnalysisProducts } from './web-analysis-plans'

const refreshAfterMs = 5 * 60_000
const expireAfterMs = 15 * 60_000
const pending = new Map<string, Promise<void>>()
const membership = schema.navigationMemberships
const webProducts = sql.join(webAnalysisProducts.map(product => sql`${product}`), sql`,`)

export function navigationMembershipEnabled() {
  return process.env.NAVIGATION_MEMBERSHIP_SNAPSHOT === '1'
}

function refresh(userId: string, identities: string[]) {
  const prior = pending.get(userId)
  if (prior) return prior
  const checkedAt = new Date()
  const request = (async () => {
    const values = await Promise.allSettled(identities.map(id => fetchRevenueCatSubscriber(id, true)))
    const active = values.flatMap(result => result.status === 'fulfilled' ? [readRevenueCatPro(result.value)] : [])
      .filter(item => item?.active)
    if (!active.length && values.some(result => result.status === 'rejected')) return
    const expiresAt = active.some(item => !item?.currentPeriodEnd)
      ? null : active.reduce<Date | null>((latest, item) => {
        const end = item?.currentPeriodEnd
        return end && (!latest || end > latest) ? end : latest
      }, null)
    await db.insert(membership).values({ userId, checkedAt, active: active.length > 0, expiresAt })
      .onConflictDoUpdate({
        target: membership.userId,
        set: { checkedAt, active: active.length > 0, expiresAt },
        setWhere: sql`${membership.checkedAt} < excluded.checked_at`,
      })
  })().finally(() => { pending.delete(userId) })
  pending.set(userId, request)
  return request
}

export async function readNavigationMembership(userId: string, defer: (work: Promise<void>) => void) {
  const [row] = await db.execute<{
    identities: string[]; stripe_pro: boolean; stripe_web: boolean;
    active: boolean | null; expires_ms: number | null; age_ms: number | null;
  }>(sql`with identities as materialized (
    select ${userId}::text as id union select user_id from mobile_guests where claimed_by_user_id = ${userId}
  ), paid_access as (
    select bool_or(product::text like 'mobile_subscription%' or product::text in ('mobile_lifetime','web_pro_monthly')) as pro,
      bool_or(product::text in (${webProducts})) as web
    from payment_entitlements where user_id in (select id from identities)
      and (product::text like 'mobile_subscription%' or product::text = 'mobile_lifetime' or product::text in (${webProducts}))
      and subscription_status in ('active','trialing','complete')
      and (product::text = 'mobile_lifetime' or current_period_end > now() at time zone 'UTC')
  )
  select array(select id from identities) as identities, coalesce(p.pro,false) as stripe_pro, coalesce(p.web,false) as stripe_web,
    m.active, extract(epoch from m.expires_at at time zone 'UTC')*1000 as expires_ms, extract(epoch from ((now() at time zone 'UTC') - m.checked_at))*1000 as age_ms
  from paid_access p left join navigation_memberships m on m.user_id = ${userId}`)
  const now = Date.now()
  let rcActive = Boolean(row.active && Number(row.age_ms) < expireAfterMs &&
    (row.expires_ms == null || Number(row.expires_ms) > now))
  if (env.REVENUECAT_SECRET_API_KEY && (row.active == null || Number(row.age_ms) >= refreshAfterMs)) {
    const work = refresh(userId, row.identities)
    if (!row.stripe_pro && (row.active == null || Number(row.age_ms) >= expireAfterMs)) {
      await work
      const snapshot = await db.query.navigationMemberships.findFirst({ where: eq(membership.userId, userId) })
      rcActive = Boolean(snapshot?.active && now - snapshot.checkedAt.getTime() < expireAfterMs &&
        (!snapshot.expiresAt || snapshot.expiresAt.getTime() > now))
    } else defer(work.catch(() => console.error('Navigation membership refresh failed')))
  }
  const active = row.stripe_pro || rcActive
  return { active, ...(row.stripe_web ? { tier: active ? 'pro' as const : 'basic' as const } : {}) }
}

// Fence all known owners and claimed guest aliases. An older in-flight
// provider read cannot overwrite the newer invalidation marker.
export async function invalidateNavigationMembership(identities: (string | null | undefined)[]) {
  if (!navigationMembershipEnabled()) return
  const ids = [...new Set(identities.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return
  const entries = sql.join(ids.map(id => sql`${id}`), sql`,`)
  await db.execute(sql`insert into navigation_memberships(user_id, checked_at, active)
    select u.id, now() at time zone 'UTC', null from users u
    where u.id in (${entries}) or u.id in (
      select claimed_by_user_id from mobile_guests where user_id in (${entries})
    )
    on conflict(user_id) do update set checked_at=excluded.checked_at, active=null, expires_at=null`)
}
