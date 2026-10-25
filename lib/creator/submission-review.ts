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

export const AUDIENCE_MINIMUM_REJECTION = {
  // Preserve the stored ID so existing reviews and open dialogs remain valid.
  id: 'audience-tier-d-minimum',
  label: 'Tier C audience minimum',
  detail: 'Tier C requires at least 15% Tier 1 audience. The verified Tier 1 audience is below the 15% minimum.',
} satisfies CreatorSubmissionReviewItem

export function withAudienceRejectionReason(
  items: (CreatorSubmissionReviewItem & CreatorSubmissionReviewResult)[],
  status: string,
  stored: CreatorSubmissionReviewResult[] | null | undefined = items,
) {
  const requirements = items.filter(item => item.id !== AUDIENCE_MINIMUM_REJECTION.id)
  if (status !== 'rejected') return requirements
  const saved = stored?.find(item => item.id === AUDIENCE_MINIMUM_REJECTION.id)
  return [...requirements, { ...AUDIENCE_MINIMUM_REJECTION, met: saved?.met ?? true, note: saved?.note ?? null }]
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
  if (expectedIds.length && results.some(item => item.id === AUDIENCE_MINIMUM_REJECTION.id)) expectedIds.push(AUDIENCE_MINIMUM_REJECTION.id)
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
  if (item.id === AUDIENCE_MINIMUM_REJECTION.id) return 'Tier C audience not met — below 15% Tier 1'
  return item.label.startsWith('Avoided: ')
    ? `Includes: ${item.label.slice('Avoided: '.length)}`
    : `Not met: ${item.label}`
}

export function submissionReviewError(status: string, items: ReadonlyArray<Pick<CreatorSubmissionReviewResult, 'met'>>) {
  if (status === 'rejected' && !items.some(item => !item.met))
    return 'Select at least one rejection reason so the creator knows what to fix.'
  return null
}

// Approval checks and rejection reasons are independent choices, not inverses.
export function createSubmissionReviewDrafts(
  items: (CreatorSubmissionReviewItem & CreatorSubmissionReviewResult)[],
  status: string,
  stored: CreatorSubmissionReviewResult[] | null | undefined,
) {
  const requirements = withAudienceRejectionReason(items, 'approved')
  const approval = status === 'rejected' ? resetSubmissionReview(requirements, 'approved') : requirements
  const rejection = withAudienceRejectionReason(resetSubmissionReview(requirements, 'rejected'), 'rejected')
    .map(item => {
      const saved = status === 'rejected' ? stored?.find(row => row.id === item.id) : undefined
      return saved ? { ...item, met: saved.met, note: saved.note } : item
    })
  return { approval, rejection }
}
