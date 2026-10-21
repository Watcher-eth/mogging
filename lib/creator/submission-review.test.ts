import { getCreatorSubmissionFormat } from './formats'
import { creatorRestrictionGroups } from './content-policy'
import { describe, expect, test } from 'bun:test'
import { CREATOR_CTA_GUIDANCE } from './post-guidance'
import {
  getCreatorSubmissionReviewItems,
  mergeCreatorSubmissionReviewResults,
  validateCreatorSubmissionReviewResults,
  creatorSubmissionReviewResultsSchema,
  resetSubmissionReview, submissionReviewError, submissionRejectionLabel,
} from './submission-review'

describe('creator submission review checklist', () => {
  test('custom submissions share all General restrictions and requirements', () => {
    const items = getCreatorSubmissionReviewItems('custom-video-v1')
    const generalItems = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items).toHaveLength(generalItems.length - 2)
    expect(items[0]).toEqual({
      id: 'element-1',
      label: 'Early CTA · 2–3 seconds',
      detail: CREATOR_CTA_GUIDANCE,
    })
    expect(items.slice(1)).toEqual(generalItems.filter(item => !item.id.startsWith('element-')))
    const results = items.map(({ id }) => ({ id, met: true, note: null }))
    expect(validateCreatorSubmissionReviewResults('custom-video-v1', results)).toBe(true)
    expect(validateCreatorSubmissionReviewResults('custom-video-v1', results.slice(1))).toBe(false)
    expect(validateCreatorSubmissionReviewResults('general-creator-video-v1', results)).toBe(false)
  })

  test('the expanded content policy fits review submission limits and includes all current requirements', () => {
    const items = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items.find((item) => item.id === 'requirement-1')?.label).toBe('Tag @moggingcom in the post caption')
    expect(items.find((item) => item.id === 'requirement-3')?.label).toBe('Use a connected account when one is available')
    expect(items.find((item) => item.id === 'restriction-3')?.label).toBe('Avoided: Obscured app footage, unclear app images, or unreadable on-screen text')
    expect(items.some((item) => item.label.includes('entire video'))).toBe(true)
    expect(items.some((item) => item.label.includes('Engagement farms'))).toBe(true)
    expect(items.some((item) => item.label.includes('Botted views'))).toBe(true)
    expect(items.find(item => item.id === 'requirement-7')?.label).toContain('second device')
    expect(creatorSubmissionReviewResultsSchema.safeParse(items.map(({ id }) => ({ id, met: true, note: null }))).success).toBe(true)
  })
  test('builds the checklist from the creator guide format', () => {
    const items = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items.map((item) => item.label)).toContain('Opening hook')
    expect(items.map((item) => item.label)).toContain('Tag @moggingcom in the post caption')
    expect(items.some((item) => item.label.startsWith('Avoided: False or misleading claims'))).toBe(true)
  })

  test('merges stored review results and validates a complete checklist', () => {
    const initial = mergeCreatorSubmissionReviewResults('general-creator-video-v1', [
      { id: 'element-1', met: true, note: null },
    ])
    expect(initial[0]?.met).toBe(true)
    expect(initial[1]?.met).toBe(false)
    expect(validateCreatorSubmissionReviewResults(
      'general-creator-video-v1',
      initial.map(({ id, met, note }) => ({ id, met, note }))
    )).toBe(true)
  })

  test('rejects partial or unknown checklists', () => {
    expect(validateCreatorSubmissionReviewResults('general-creator-video-v1', [
      { id: 'element-1', met: true, note: null },
    ])).toBe(false)
    expect(validateCreatorSubmissionReviewResults('unknown-format', [])).toBe(false)
  })
})


test('switching to rejection starts with no selected failures and clears stale feedback', () => {
  const items = mergeCreatorSubmissionReviewResults('custom-video-v1', [{ id: 'element-1', met: false, note: 'Old feedback' }])
  const rejection = resetSubmissionReview(items, 'rejected')
  expect(rejection.every(item => item.met && item.note === null)).toBe(true)
  expect(submissionReviewError('rejected', rejection)).toContain('Select at least one')
  const selected = rejection.map((item, i) => i === 0 ? { ...item, met: false, note: 'CTA is missing.' } : item)
  expect(submissionReviewError('rejected', selected)).toBeNull()
  expect(selected.filter(item => !item.met).map(item => item.id)).toEqual(['element-1'])
  expect(items[0].note).toBe('Old feedback')
})

test('leaving rejection does not falsely mark requirements fulfilled or block approval', () => {
  const items = resetSubmissionReview(mergeCreatorSubmissionReviewResults('custom-video-v1', []), 'rejected')
  const approval = resetSubmissionReview(items, 'approved')
  expect(approval.every(item => !item.met)).toBe(true)
  expect(submissionReviewError('approved', approval)).toBeNull()
  expect(submissionReviewError('approved', items)).toBeNull()
  expect(submissionReviewError('pending', approval)).toBeNull()
  expect(submissionReviewError('rejected', [])).not.toBeNull()
})

test('rejection labels describe the failure without saying a restriction was avoided', () => {
  expect(submissionRejectionLabel({id:'restriction-1',label:'Avoided: Botted views',detail:''})).toBe('Includes: Botted views')
  expect(submissionRejectionLabel({id:'element-1',label:'Early CTA',detail:''})).toBe('Not met: Early CTA')
})


test('approval does not require every checklist item to be fulfilled', () => {
  expect(submissionReviewError('approved', [{ met: true }, { met: false }])).toBeNull()
  expect(submissionReviewError('approved', [{ met: false }])).toBeNull()
})


test('Custom and General expose identical penalty and forbidden-content groups', () => {
  const general = getCreatorSubmissionFormat('general-creator-video-v1')!
  const custom = getCreatorSubmissionFormat('custom-video-v1')!
  expect(custom.notAllowed).toBe(general.notAllowed)
  const groups = creatorRestrictionGroups(custom.notAllowed)
  expect(groups).toEqual(creatorRestrictionGroups(general.notAllowed))
  expect(groups.forbidden.some(rule => rule.includes('Tom Welling'))).toBe(true)
  expect(groups.penalties.some(rule => rule.includes('movie edits'))).toBe(true)
})
