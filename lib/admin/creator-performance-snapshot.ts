import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { buildCreatorPerformance, type CreatorPerformanceReport, type PerformanceInput } from './creator-performance'

export type CreatorPerformanceSnapshot = {
  reports: Record<'all' | 'tiktok' | 'instagram', CreatorPerformanceReport>
  latestSubmission: string | null; latestSubmissionUpdate: string | null; latestPaymentUpdate: string | null
}

// Allowlisted numeric/accounting fields only. The raw rows never leave this server module.
export function creatorPerformanceInputQuery(now: Date) {
  return sql`with posts as (
    select s.id,s.creator_profile_id as "creatorProfileId",p.display_name as "creatorName",
      s.platform,dates.submitted_at as "createdAt",s.sprint_id as "sprintId",s.status,
      s.approved_amount_cents as "approvedAmountCents",s.view_count_threshold as "viewCountThreshold",
      s.admin_view_count_threshold as "adminViewCountThreshold",s.admin_us_audience_percent as "adminUsAudiencePercent"
    from creator_submissions s join creator_profiles p on p.id = s.creator_profile_id
    cross join lateral (select coalesce((select min(u.created_at) from creator_submission_updates u
      where u.submission_id = s.id and u.type = 'submitted'),s.created_at) as submitted_at) dates
    where not s.is_draft and dates.submitted_at < ${now.toISOString()}::timestamp
  ), payments as (
    select id,submission_id as "submissionId",creator_profile_id as "creatorProfileId",amount_cents as "amountCents",
      currency,status,paid_at as "paidAt" from creator_payments
    where status = 'paid' and created_at < ${now.toISOString()}::timestamp
      and (paid_at is null or paid_at < ${now.toISOString()}::timestamp)
  ) select json_build_object(
    'submissions',coalesce((select json_agg(p) from posts p),'[]'::json),
    'payments',coalesce((select json_agg(p) from payments p),'[]'::json),
    'creators','[]'::json,
    'latestSubmission',(select max("createdAt") from posts),
    'latestSubmissionUpdate',(select max(s.updated_at) from creator_submissions s where s.id in (select id from posts)),
    'latestPaymentUpdate',(select max(p.updated_at) from creator_payments p where p.id in (select id from payments))
  ) as input`
}

export async function getCreatorPerformanceSnapshot(days: number, now: Date): Promise<CreatorPerformanceSnapshot> {
  return db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '12s'`)
    const [result] = await tx.execute(creatorPerformanceInputQuery(now))
    const input = result.input as PerformanceInput & Omit<CreatorPerformanceSnapshot, 'reports'>
    return {
      reports: {
        all: buildCreatorPerformance(input, { days, platform: 'all', now }),
        tiktok: buildCreatorPerformance(input, { days, platform: 'tiktok', now }),
        instagram: buildCreatorPerformance(input, { days, platform: 'instagram', now }),
      },
      latestSubmission: input.latestSubmission, latestSubmissionUpdate: input.latestSubmissionUpdate, latestPaymentUpdate: input.latestPaymentUpdate,
    }
  })
}
