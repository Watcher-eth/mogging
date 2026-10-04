import { sprintPhase, type CreatorSprint } from './sprints'

export type CampaignPreview = Pick<CreatorSprint, 'id' | 'name' | 'description' | 'status' | 'budgetCents' | 'startsAt' | 'endsAt'>

export function campaignTimeLabel(campaign: CampaignPreview, now = Date.now()) {
  const phase = sprintPhase(campaign, now)
  if (phase === 'past') return 'Ended'
  const days = Math.ceil((Date.parse(phase === 'scheduled' ? campaign.startsAt : campaign.endsAt) - now) / 86_400_000)
  const duration = `${days} ${days === 1 ? 'day' : 'days'}`
  return phase === 'scheduled' ? `Starts in ${duration}` : `${duration} left`
}
