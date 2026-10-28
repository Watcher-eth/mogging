import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { detailedAnalysisVariantTerms } from './detailed-analysis-variant'
import { sprintPayoutCents, type SprintTerms } from './sprints'
import { campaignCommittedCents, campaignPendingCents, campaignContentBudgetCents, campaignBonusCommittedCents, campaignPaidCents } from './campaign-accounting'
import { requireSubmissionBudget } from './campaign-budget-service'

// Intentionally never falls back to DATABASE_URL: these tests create isolated fixtures.
const url = process.env.CAMPAIGN_BUDGET_TEST_DATABASE_URL
const enabled = !!url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname) && new URL(url).pathname === '/campaign_budget_test'
const integration = enabled ? test : test.skip
const client = enabled ? postgres(url!, { max: 4, prepare: false }) : null
const db = client ? drizzle(client) : null
const originalId = 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'
const mgcId = 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11'
const original = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(c => c.key === 'detailed-analysis')!)
const mgc = detailedAnalysisVariantTerms(original, originalId)
const termsFor = (amountCents: number): SprintTerms => ({...original, milestones:[{views:100,amountCents}]})

beforeAll(async () => {
  if (!client) return
  await client.unsafe('drop table if exists creator_submissions, creator_campaign_transfers, creator_payments, creator_sprints cascade; drop function if exists creator_campaign_expected_payout(jsonb,integer,real); drop function if exists guard_creator_bonus_budget();')
  await client.unsafe(`
    create table creator_sprints (id text primary key, name text, budget_cents int not null, terms jsonb not null, updated_at timestamp default now());
    create table creator_submissions (id text primary key, sprint_id text, sprint_terms jsonb, view_count_threshold int, us_audience_percent real, approved_amount_cents int, status text, is_draft boolean default false);
    create table creator_campaign_transfers (submission_id text primary key, from_sprint_id text, to_sprint_id text, amount_cents int);
    create table creator_payments (id text primary key, submission_id text, creator_profile_id text, bonus_sprint_id text, bonus_key text, bonus_note text, amount_cents int, currency text default 'USD', status text);
  `)
  const migration = await readFile(new URL('../../drizzle/0065_creator_budget_reservations.sql', import.meta.url), 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await client.unsafe(statement)
  await client.unsafe(`create trigger creator_bonus_budget_payment before insert or update on creator_payments for each row execute function guard_creator_bonus_budget(); create trigger creator_bonus_budget_campaign before update of terms on creator_sprints for each row execute function guard_creator_bonus_budget();`)
})
beforeEach(async () => {
  if (!client) return
  await client.unsafe('truncate creator_submissions, creator_campaign_transfers, creator_payments, creator_sprints cascade')
  await client`insert into creator_sprints (id,name,budget_cents,terms) values (${originalId},'Original',5000,${JSON.stringify(original)}), ('other','Other',9000,${JSON.stringify(original)})`
  await client`insert into creator_sprints (id,name,budget_cents,terms,budget_pool_id) values (${mgcId},'MGC',999999,${JSON.stringify(mgc)},${originalId})`
})
afterAll(async () => { if (client) await client.end() })

async function balances(id: string) {
  const [row] = await db!.execute<{committed:number;pending:number;budget:number;bonus:number;paid:number}>(sql`select ${campaignCommittedCents(id)} as committed, ${campaignPendingCents(id)} as pending, ${campaignContentBudgetCents(id)} as budget, ${campaignBonusCommittedCents(id)} as bonus, ${campaignPaidCents(id)} as paid`)
  return row
}
async function request(id: string, campaignId: string, cents: number) {
  await db!.transaction(async tx => {
    await requireSubmissionBudget(tx, campaignId, cents)
    await tx.execute(sql`insert into creator_submissions (id,sprint_id,sprint_terms,view_count_threshold,us_audience_percent,status) values (${id},${campaignId},${JSON.stringify(termsFor(cents))}::jsonb,100,40,'pending')`)
  })
}
integration('SQL estimated payouts exactly match saved campaign milestone and audience calculations', async () => {
  for (const terms of [original,mgc,termsFor(1234)]) for (const views of [0,5000,50000,100000,300000,500000,1000000]) for (const audience of [null,14.9,15,22.5,31.99,32,40,100]) {
    const [row] = await client!`select creator_campaign_expected_payout(${JSON.stringify(terms)},${views},${audience}::real) as cents`
    expect(row.cents).toBe(sprintPayoutCents(terms, views, audience))
  }
})
integration('$50 shared balance accepts $40 on original and rejects a $20 MGC request', async () => {
  await request('first',originalId,4000)
  await expect(request('second',mgcId,2000)).rejects.toThrow('Not enough campaign budget')
  expect(await balances(originalId)).toMatchObject({budget:5000,committed:0,pending:4000})
  expect(await balances(mgcId)).toEqual(await balances(originalId))
  expect(await balances('other')).toMatchObject({budget:9000,pending:0})
  await request('exact-fit',mgcId,1000)
  await expect(request('over-full',originalId,1)).rejects.toThrow('Not enough campaign budget')
  expect(await balances(mgcId)).toMatchObject({pending:5000})
})
integration('concurrent requests across both versions serialize on one owner and cannot overbook', async () => {
  const results = await Promise.allSettled([request('a',originalId,4000), request('b',mgcId,2000)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const balance = await balances(originalId)
  expect(balance.pending).toBeLessThanOrEqual(balance.budget)
})
integration('approval replaces a reservation; rejection releases it; drafts never reserve', async () => {
  await request('first',mgcId,4000)
  await client!`update creator_submissions set status='approved',approved_amount_cents=3000 where id='first'`
  expect(await balances(originalId)).toMatchObject({committed:3000,pending:0})
  await request('second',originalId,2000)
  await client!`update creator_submissions set status='rejected' where id='second'`
  await client!`insert into creator_submissions (id,sprint_id,sprint_terms,view_count_threshold,us_audience_percent,status,is_draft) values ('draft',${mgcId},${JSON.stringify(termsFor(99999))},100,40,'pending',true)`
  expect(await balances(mgcId)).toMatchObject({committed:3000,pending:0})
  await client!`update creator_submissions set status='in_review',sprint_terms=${JSON.stringify(termsFor(4500))} where id='first'`
  expect(await balances(originalId)).toMatchObject({committed:3000,pending:1500})
})
integration('shared bonus budget and paid usage include both versions without adding a second budget', async () => {
  await client!`insert into creator_payments(id,creator_profile_id,bonus_sprint_id,bonus_key,bonus_note,amount_cents,status) values ('one','creator',${originalId},'one','Bonus',30000,'pending')`
  await client!`insert into creator_payments(id,creator_profile_id,bonus_sprint_id,bonus_key,bonus_note,amount_cents,status) values ('two','creator',${mgcId},'two','Bonus',20000,'pending')`
  await expect(Promise.resolve(client!`insert into creator_payments(id,creator_profile_id,bonus_sprint_id,bonus_key,bonus_note,amount_cents,status) values ('three','creator',${mgcId},'three','Bonus',1,'pending')`)).rejects.toThrow('fully committed')
  expect(await balances(mgcId)).toMatchObject({bonus:50000})
  await client!`update creator_payments set status='cancelled' where id='two'`
  expect(await balances(originalId)).toMatchObject({bonus:30000})
})
integration('campaign transfers preserve prior approved money and do not double count within a shared pool', async () => {
  await client!`insert into creator_submissions(id,sprint_id,status,approved_amount_cents) values ('moved',${mgcId},'approved',4000)`
  await client!`insert into creator_campaign_transfers values ('moved',${originalId},${mgcId},3000)`
  await client!`insert into creator_payments(id,submission_id,amount_cents,status) values ('paid','moved',3000,'paid')`
  expect(await balances(originalId)).toMatchObject({committed:4000,paid:3000})
  await client!`update creator_campaign_transfers set from_sprint_id='other' where submission_id='moved'`
  expect(await balances(mgcId)).toMatchObject({committed:1000,paid:0})
  expect(await balances('other')).toMatchObject({committed:3000,paid:3000})
})


integration('updating a pending request replaces its own reservation instead of counting it twice', async () => {
  await request('first',originalId,4000)
  await db!.transaction(async tx => {
    await requireSubmissionBudget(tx,originalId,4500,{rereview:true,excludeSubmissionId:'first'})
    await tx.execute(sql`update creator_submissions set sprint_terms=${JSON.stringify(termsFor(4500))}::jsonb where id='first'`)
  })
  expect(await balances(mgcId)).toMatchObject({pending:4500})
})
