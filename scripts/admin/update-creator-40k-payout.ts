import postgres from 'postgres'
import { sprintTermsSchema } from '../../lib/creator/sprints'
import { campaignAudienceRates } from '../../lib/creator/sprint-defaults'

const apply = process.argv.includes('--apply')
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
try {
  await sql.begin(apply ? '' : 'read only', async tx => {
    const campaigns = apply
      ? await tx`select id, name, terms from creator_sprints order by id for update`
      : await tx`select id, name, terms from creator_sprints order by id`
    const changes = campaigns.flatMap(campaign => {
      const terms = sprintTermsSchema.parse(campaign.terms)
      const current = terms.milestones.find(m => m.views === 40_000)
      if (!current) return []
      const updated = sprintTermsSchema.parse({ ...terms, milestones: terms.milestones.map(m => m.views === 40_000
        ? { ...m, amountCents: 3500, ...(m.audienceRates ? { audienceRates: campaignAudienceRates(3500).map((rate, i) => ({
          ...rate, audiencePercent: i === 0 ? terms.minimumTier1Percent : rate.audiencePercent,
        })) } : {}) }
        : m) })
      if (JSON.stringify(terms) === JSON.stringify(updated)) return []
      return [{ id: campaign.id, name: campaign.name, before: campaign.terms, after: updated }]
    })
    if (apply && changes.length) {
      const backup = `/private/tmp/mogging-40k-campaign-backup-${Date.now()}.json`
      await Bun.write(backup, JSON.stringify(changes, null, 2))
      console.log(`Backup: ${backup}`)
      for (const change of changes) await tx`update creator_sprints set terms=${tx.json(change.after)}, updated_at=now() where id=${change.id}`
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', campaigns: changes.map(c => ({ id: c.id, name: c.name,
      before: c.before.milestones.find((m: any) => m.views === 40_000), after: c.after.milestones.find(m => m.views === 40_000) })) }, null, 2))
    // Submission snapshots and approved/paid amounts are intentionally never updated.
  })
} finally { await sql.end() }
