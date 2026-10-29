import type { SupportCampaign } from './contracts'

/** Time and published status both matter; an old published record need not still be current. */
export function campaignPhase(campaign: SupportCampaign, now = Date.now()): 'current' | 'upcoming' | 'ended' {
  if (campaign.status === 'ended' || Date.parse(campaign.endsAt) <= now) return 'ended'
  return Date.parse(campaign.startsAt) > now ? 'upcoming' : 'current'
}
