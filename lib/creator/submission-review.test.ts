import { describe, expect, test } from 'bun:test'
import {
  getCreatorSubmissionReviewItems,
  mergeCreatorSubmissionReviewResults,
  validateCreatorSubmissionReviewResults,
  creatorSubmissionReviewResultsSchema,
} from './submission-review'

describe('creator submission review checklist', () => {
  test('the expanded content policy fits review submission limits and preserves existing review IDs', () => {
    const items = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items.find((item) => item.id === 'requirement-1')?.label).toBe('Tag @mogging in the post or caption')
    expect(items.find((item) => item.id === 'requirement-4')?.label).toBe('Use a connected account when one is available')
    expect(items.find((item) => item.id === 'restriction-3')?.label).toBe('Avoided: Obscured app footage or unreadable on-screen text')
    expect(items.some((item) => item.label.includes('entire video'))).toBe(true)
    expect(items.some((item) => item.label.includes('Engagement farms'))).toBe(true)
    expect(items.some((item) => item.label.includes('Botted views'))).toBe(true)
    expect(creatorSubmissionReviewResultsSchema.safeParse(items.map(({ id }) => ({ id, met: true, note: null }))).success).toBe(true)
  })
  test('builds the checklist from the creator guide format', () => {
    const items = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items.map((item) => item.label)).toContain('Opening hook')
    expect(items.map((item) => item.label)).toContain('Tag @mogging in the post or caption')
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
