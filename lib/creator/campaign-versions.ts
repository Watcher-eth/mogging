import type { CreatorSprint } from './sprints'

// Only combine pairs already returned by the server's audience filter.
export function campaignVersionGroups(campaigns: CreatorSprint[]): CreatorSprint[][] {
  const byId = new Map(campaigns.map(campaign => [campaign.id, campaign]))
  const paired = new Set<string>()
  const groups: CreatorSprint[][] = []
  for (const campaign of campaigns) {
    if (paired.has(campaign.id)) continue
    const source = campaign.terms.mgcSourceCampaignId ? byId.get(campaign.terms.mgcSourceCampaignId) : campaign
    const mgc = source && campaigns.find(item => item.terms.mgcSourceCampaignId === source.id)
    const group = source && mgc ? [source, mgc] : [campaign]
    group.forEach(item => paired.add(item.id))
    groups.push(group)
  }
  return groups
}
