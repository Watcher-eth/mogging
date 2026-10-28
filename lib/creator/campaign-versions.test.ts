import { expect, test } from 'bun:test'
import { campaignVersionGroups } from './campaign-versions'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { detailedAnalysisVariantTerms } from './detailed-analysis-variant'
import type { CreatorSprint } from './sprints'

const id = 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'
const terms = launchCampaignTerms(LAUNCH_CAMPAIGNS[0])
const source = { id, name: 'Mogging Detailed Analysis', terms } as CreatorSprint
const mgc = { id: 'mgc', name: 'Mogging Detailed Analysis MGC', terms: detailedAnalysisVariantTerms(terms, id) } as CreatorSprint
const unrelated = { id: 'other', terms } as CreatorSprint

test('groups the exact linked versions regardless of server ordering', () => {
  expect(campaignVersionGroups([source, unrelated, mgc])).toEqual([[source, mgc], [unrelated]])
  expect(campaignVersionGroups([mgc, unrelated, source])).toEqual([[source, mgc], [unrelated]])
})
test('never creates toggle options for a campaign absent from the authorized response', () => {
  expect(campaignVersionGroups([source, unrelated])).toEqual([[source], [unrelated]])
  expect(campaignVersionGroups([mgc, unrelated])).toEqual([[mgc], [unrelated]])
  expect(campaignVersionGroups([])).toEqual([])
})
