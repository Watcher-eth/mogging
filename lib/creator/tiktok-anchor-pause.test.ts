import { expect, test } from 'bun:test'
import { TIKTOK_ANCHOR_REQUIREMENT, TIKTOK_ANCHOR_REQUIREMENTS_ENABLED } from './tiktok-anchor'
import { creatorCampaignRules } from './post-guidance'
import { sprintReviewItems, type SprintTerms } from './sprints'

test('the anchor requirement is paused without hiding other campaign rules', () => {
  expect(TIKTOK_ANCHOR_REQUIREMENTS_ENABLED).toBe(false)
  expect(creatorCampaignRules(['Show Mogging', TIKTOK_ANCHOR_REQUIREMENT, 'Keep public'])).toEqual(['Show Mogging','Keep public'])
})
test('old submission snapshots no longer require anchors and keep stable review IDs', () => {
  const terms: SprintTerms = { milestones:[{views:20000,amountCents:1000}],minimumTier1Percent:20,maximumTier1Percent:40,platforms:['tiktok'],rules:['Keep public'],formats:[{id:'f',name:'Video',shortDescription:'Show Mogging',active:true,elements:[{title:'Hook',detail:'Introduce the app'}],requirements:['Show Mogging',TIKTOK_ANCHOR_REQUIREMENT,'Keep public'],notAllowed:[]}] }
  const before = JSON.stringify(terms)
  const items = sprintReviewItems(terms,'f')
  expect(items.some(item=>item.label===TIKTOK_ANCHOR_REQUIREMENT)).toBe(false)
  expect(items.find(item=>item.label==='Keep public'&&item.id.startsWith('requirement'))?.id).toBe('requirement-3')
  expect(JSON.stringify(terms)).toBe(before)
})
