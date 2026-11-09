import { beforeEach, expect, mock, test } from 'bun:test'
import * as React from 'react'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import type { CreatorSprint } from '@/lib/creator/sprints'
import type { AdminSubmission } from './creator-types'

let context: any
mock.module('react', () => ({ ...React, useContext: () => context, useState: () => [false, () => {}] }))
const { CampaignReviewQueue } = await import('./campaign-submission-move')
const campaigns = LAUNCH_CAMPAIGNS.map((campaign, index) => ({ id: String(index), name: campaign.name, terms: launchCampaignTerms(campaign) } as CreatorSprint))
const submission = { id: 'post', sprintId: 'source' } as AdminSubmission
let opened: unknown[][] = []
let prevented = 0
const event = (id = submission.id) => ({
  preventDefault: () => { prevented++ },
  dataTransfer: { types: ['application/x-mogging-submission'], getData: () => id, dropEffect: '' },
})
beforeEach(() => {
  opened = []; prevented = 0
  context = { dragged: submission, destinationsFor: () => campaigns, setDragged: (value: unknown) => { context.dragged = value }, open: (...args: unknown[]) => opened.push(args) }
})
function queue() {
  return CampaignReviewQueue({ queueId: 'feature-comparison', label: 'Face Feature Comparison', children: 'Queue content' })
}
test('the whole queue accepts a matching campaign drop and opens the existing confirmation', () => {
  const section = queue()
  expect(section.type).toBe('section')
  section.props.onDragOver(event() as any)
  section.props.onDrop(event() as any)
  const target = campaigns.find(campaign => campaign.terms.formats[0].id.includes('feature-comparison'))!
  expect(prevented).toBe(2)
  expect(opened).toEqual([[submission, target.id, [target.id]]])
  expect(context.dragged).toBeNull()
})
test('a queue without eligible destinations does not accept a drop', () => {
  context.destinationsFor = () => []
  queue().props.onDragOver(event() as any)
  queue().props.onDrop(event() as any)
  expect(prevented).toBe(0)
  expect(opened).toHaveLength(0)
})
test('unrelated payloads cannot open a move confirmation', () => {
  queue().props.onDrop(event('another-post') as any)
  expect(opened).toHaveLength(0)
})
test('multiple eligible campaigns in one queue require choosing among those campaigns', () => {
  const target = campaigns.find(campaign => campaign.terms.formats[0].id.includes('feature-comparison'))!
  context.destinationsFor = () => [target, { ...target, id: 'second-comparison' }]
  queue().props.onDrop(event() as any)
  expect(opened).toEqual([[submission, '', [target.id, 'second-comparison']]])
})
