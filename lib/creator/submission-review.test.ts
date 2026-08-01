import { describe, expect, test } from 'bun:test'
import {
  getCreatorSubmissionReviewItems,
  mergeCreatorSubmissionReviewResults,
  validateCreatorSubmissionReviewResults,
} from './submission-review'

describe('creator submission review checklist', () => {
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
