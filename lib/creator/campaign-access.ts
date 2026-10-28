import { z } from 'zod'

export const campaignAudienceSchema = z.object({
  mode: z.enum(['all', 'selected', 'except']),
  creatorIds: z.array(z.string().uuid()).max(10000),
}).strict().refine(value => new Set(value.creatorIds).size === value.creatorIds.length, 'Choose each creator only once')
export type CampaignAudience = z.infer<typeof campaignAudienceSchema>
export const DEFAULT_CAMPAIGN_AUDIENCE: CampaignAudience = { mode: 'all', creatorIds: [] }

export function canSeeCampaign(audience: CampaignAudience | undefined, creatorId?: string | null) {
  if (!audience || audience.mode === 'all') return true
  const selected = Boolean(creatorId && audience.creatorIds.includes(creatorId))
  return audience.mode === 'selected' ? selected : !selected
}

