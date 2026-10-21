import { creatorContentRestriction } from '@/lib/creator/content-policy'
import { z } from 'zod'
import { ACTIVE_CREATOR_SUBMISSION_FORMATS, getCreatorSubmissionFormat } from '@/lib/creator/formats'

export type CreatorSubmissionReviewItem = {
  id: string
  label: string
  detail: string
}

export type CreatorSubmissionReviewResult = {
  id: string
  met: boolean
  note: string | null
}

export const creatorSubmissionReviewResultsSchema = z.array(z.object({
  id: z.string().min(1).max(120),
  met: z.boolean(),
  note: z.string().trim().max(500).optional().nullable(),
})).max(64)

export function getCreatorSubmissionReviewItems(formatId: string | null) {
  const format = formatId ? getCreatorSubmissionFormat(formatId) : ACTIVE_CREATOR_SUBMISSION_FORMATS[0]
  if (!format) return []

  return [
    ...format.elements.map((item, index) => ({
      id: `element-${index + 1}`,
      label: item.title,
      detail: item.detail,
    })),
    ...format.requirements.map((requirement, index) => ({
      id: `requirement-${index + 1}`,
      label: requirement,
      detail: 'Required by the selected creator-guide format.',
    })),
    ...format.notAllowed.map((restriction, index) => ({
      id: `restriction-${index + 1}`,
      label: `Avoided: ${creatorContentRestriction(restriction)}`,
      detail: 'The submitted video does not contain this disallowed element.',
    })),
  ] satisfies CreatorSubmissionReviewItem[]
}

export function mergeCreatorSubmissionReviewResults(
  formatId: string | null,
  stored: CreatorSubmissionReviewResult[] | null | undefined
) {
  const storedById = new Map((stored || []).map((item) => [item.id, item]))
  return getCreatorSubmissionReviewItems(formatId).map((item) => ({
    ...item,
    met: storedById.get(item.id)?.met ?? false,
    note: storedById.get(item.id)?.note ?? null,
  }))
}

export function validateCreatorSubmissionReviewResults(
  formatId: string | null,
  results: CreatorSubmissionReviewResult[]
) {
  const expectedIds = getCreatorSubmissionReviewItems(formatId).map((item) => item.id)
  const submittedIds = results.map((item) => item.id)
  return expectedIds.length > 0
    && expectedIds.length === submittedIds.length
    && expectedIds.every((id) => submittedIds.includes(id))
    && new Set(submittedIds).size === submittedIds.length
}

// Store one meaning in every review: false is a requirement that was not met.
export function resetSubmissionReview<T extends CreatorSubmissionReviewResult>(items: T[], status: string): T[] {
  return items.map(item => ({ ...item, met: status === 'rejected', note: null }))
}

export function submissionRejectionLabel(item: CreatorSubmissionReviewItem) {
  return item.label.startsWith('Avoided: ')
    ? `Includes: ${item.label.slice('Avoided: '.length)}`
    : `Not met: ${item.label}`
}

export function submissionReviewError(status: string, items: ReadonlyArray<Pick<CreatorSubmissionReviewResult, 'met'>>) {
  if (status === 'rejected' && !items.some(item => !item.met))
    return 'Select at least one rejection reason so the creator knows what to fix.'
  return null
}
