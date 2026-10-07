import { describe, expect, test } from 'bun:test'
import { CREATOR_CTA_GUIDANCE } from './post-guidance'
import {
  getCreatorSubmissionReviewItems,
  mergeCreatorSubmissionReviewResults,
  validateCreatorSubmissionReviewResults,
  creatorSubmissionReviewResultsSchema,
} from './submission-review'

describe('creator submission review checklist', () => {
  test('custom submissions require the early CTA and seven shared requirements', () => {
    const items = getCreatorSubmissionReviewItems('custom-video-v1')
    const generalItems = getCreatorSubmissionReviewItems('general-creator-video-v1')
    expect(items).toHaveLength(8)
    expect(items[0]).toEqual({
      id: 'element-1',
      label: 'Early CTA · 2–3 seconds',
      detail: CREATOR_CTA_GUIDANCE,
    })
    expect(items.slice(1)).toEqual(generalItems.filter((item) => item.id.startsWith('requirement-')))
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
