import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { PERFORMANCE_EXCLUDED_CREATOR_IDS, PERFORMANCE_TIME_ZONE } from './creator-performance'

export type PerformanceRevenue = {
  daily: { day: string; appRevenue: number; attributedRevenue: number }[]
  otherCurrencies: { currency: string; amount: number }[]
}

export async function getPerformanceRevenue(start: string, end: string, platform: string): Promise<PerformanceRevenue> {
  const excluded = sql.join(PERFORMANCE_EXCLUDED_CREATOR_IDS.map(id => sql`${id}`), sql`, `)
  const result = await db.execute(sql`
    with internal_accounts as (select id from users where analytics_internal),
    experiment_links as (select l.id from creator_tracking_links l join creator_social_accounts a on a.id=l.social_account_id where a.creator_profile_id in (${excluded})),
    billing as (
      select to_char((b.occurred_at at time zone 'UTC') at time zone ${PERFORMANCE_TIME_ZONE}, 'YYYY-MM-DD') as day,
        upper(coalesce(b.currency,'UNKNOWN')) as currency, b.amount
      from subscription_events b
      where b.environment = 'production' and b.amount is not null
        and (coalesce(b.account_id,b.external_user_id) is null or coalesce(b.account_id,b.external_user_id) not in (select id from internal_accounts))
        and not exists (select 1 from creator_attribution_events e where e.tracking_link_id in (select id from experiment_links) and e.metadata->>'billingEventId' = b.id)
        and b.occurred_at >= (${start}::date::timestamp at time zone ${PERFORMANCE_TIME_ZONE}) at time zone 'UTC'
        and b.occurred_at < ((${end}::date + 1)::timestamp at time zone ${PERFORMANCE_TIME_ZONE}) at time zone 'UTC'
    ), attributed as (
      select to_char((e.created_at at time zone 'UTC') at time zone ${PERFORMANCE_TIME_ZONE}, 'YYYY-MM-DD') as day,
        e.amount_cents::numeric / 100 as amount
      from creator_attribution_events e
      join creator_tracking_links l on l.id=e.tracking_link_id
      join creator_social_accounts a on a.id=l.social_account_id
      where a.creator_profile_id not in (${excluded}) and upper(e.currency)='USD'
        and e.event_type in ('payment','refund','dispute')
        and (e.user_id is null or e.user_id not in (select id from internal_accounts))
        and (${platform}='all' or a.platform::text=${platform})
        and e.created_at >= (${start}::date::timestamp at time zone ${PERFORMANCE_TIME_ZONE}) at time zone 'UTC'
        and e.created_at < ((${end}::date + 1)::timestamp at time zone ${PERFORMANCE_TIME_ZONE}) at time zone 'UTC'
    ), daily as (
      select day, sum(app_revenue) as app_revenue, sum(attributed_revenue) as attributed_revenue from (
        select day,sum(amount) as app_revenue,0::numeric as attributed_revenue from billing where currency='USD' group by day
        union all select day,0::numeric,sum(amount) from attributed group by day
      ) entries group by day
    )
    select json_build_object(
      'daily',coalesce((select json_agg(json_build_object('day',day,'appRevenue',app_revenue,'attributedRevenue',attributed_revenue) order by day) from daily),'[]'::json),
      'otherCurrencies',coalesce((select json_agg(json_build_object('currency',currency,'amount',amount)) from (select currency,sum(amount) as amount from billing where currency<>'USD' and amount<>0 group by currency) c),'[]'::json)
    ) as report
  `)
  return result[0].report as PerformanceRevenue
}
