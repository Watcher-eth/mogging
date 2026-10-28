import {expect,test} from 'bun:test'
import {PgDialect} from 'drizzle-orm/pg-core'
import {analyticsQuery} from './analytics'
const dialect=new PgDialect(),now=new Date('2026-10-27T22:00:00Z')
test('referrals selects full all-platform cohorts and consolidates inviter aliases without serializing identities',()=>{
 const query=dialect.sqlToQuery(analyticsQuery({days:'30',platform:'ios',section:'Referrals'},now))
 const selected=query.sql.split(') select json_build_object(').at(-1)!
 expect(selected).toContain('(select report from referrals)')
 for(const redundant of ['from "daily"','from "event_metrics"','from "feature_retention"'])expect(selected).not.toContain(redundant)
 expect(query.params).not.toContain('ios')
 expect(query.params).toContain('2026-09-27T22:00:00.000Z')
 expect(query.sql).toContain('coalesce(g.claimed_by_user_id,r.inviter_user_id)')
 expect(query.sql).toContain('r.referred_user_id<>coalesce(g.claimed_by_user_id,r.inviter_user_id)')
 expect(query.sql).toContain("credited_at+interval '7 days'<=")
 const report=query.sql.split('customer_referral_history as materialized (')[1].split('), "onboarding_events0"')[0]
 expect(report).not.toMatch(/limit\s+\d/i)
 expect(report).toContain('count(*) filter(where mature and paid7)')
 const serialized=query.sql.split('), referrals as (')[1].split('), "onboarding_events0"')[0]
 for(const field of ['inviter','referred_user_id','code','actor','account_id','token'])expect(serialized).not.toContain(`'${field}'`)
})
test('own-report views and positive production charges require account matching within exact seven-day windows',()=>{
 const query=dialect.sqlToQuery(analyticsQuery({days:'1',platform:'all',section:'Referrals'},now)).sql
 expect(query).toContain("b.amount>0")
 expect(query).toContain("b.provider='stripe' and b.event_name in ('one_time_purchase','invoice_paid','subscription_renewed')")
 expect(query).toContain('b.account_id=c.referred_user_id and b.occurred_at>=c.credited_at')
 expect(query).toContain("b.occurred_at<c.credited_at+interval '7 days'")
 expect(query).toContain("a.occurred_at<c.credited_at+interval '7 days'")
 expect(query).toContain("p.source='user' and p.user_id=c.referred_user_id")
 expect(query).toContain("v.status='complete'")
 expect(query).toContain('v.id not in (select id from excluded_reports)')
 expect(query).toContain("date_trunc('hour', credited_at)")
})
test('reward balances exclude revoked, expired and refunded records while retaining distinct period and lifetime counts',()=>{
 const query=dialect.sqlToQuery(analyticsQuery({days:'30',platform:'all',section:'Referrals'},now)).sql
 expect(query).toContain("p.source='referral_self_signup_revoked' then 'revoked'")
 expect(query).toContain("p.stripe_checkout_session_id like 'referral_signup:%' then 'legacy_signup'")
 expect(query).toContain("p.credit_expires_at is null or p.credit_expires_at>")
 expect(query).toContain("not in ('refunded','disputed') then greatest(p.credit_balance,0) else 0")
 expect(query).toContain('p.id not in (select id from excluded_entitlements)')
 expect(query).toContain('join customer_referral_rewards p on p.entitlement_id=r.entitlement_id')
 expect(query).toContain("count(*) filter(where r.status='complete') as completed_scans")
 expect(query).toContain('generate_series(')
 expect(query).toContain('coalesce(r.signups,0)')
})
