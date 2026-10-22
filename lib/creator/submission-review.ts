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

export const TIER_D_AUDIENCE_REJECTION = {
  id: 'audience-tier-d-minimum',
  label: 'Tier D audience minimum',
  detail: 'Tier D requires 10–14.99% Tier 1 audience. The verified Tier 1 audience is below the 10% minimum.',
} satisfies CreatorSubmissionReviewItem

export function withAudienceRejectionReason(
  items: (CreatorSubmissionReviewItem & CreatorSubmissionReviewResult)[],
  status: string,
  stored: CreatorSubmissionReviewResult[] | null | undefined = items,
) {
  const requirements = items.filter(item => item.id !== TIER_D_AUDIENCE_REJECTION.id)
  if (status !== 'rejected') return requirements
  const saved = stored?.find(item => item.id === TIER_D_AUDIENCE_REJECTION.id)
  return [...requirements, { ...TIER_D_AUDIENCE_REJECTION, met: saved?.met ?? true, note: saved?.note ?? null }]
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
  if (expectedIds.length && results.some(item => item.id === TIER_D_AUDIENCE_REJECTION.id)) expectedIds.push(TIER_D_AUDIENCE_REJECTION.id)
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
  if (item.id === TIER_D_AUDIENCE_REJECTION.id) return 'Tier D audience (10–14.99% Tier 1) not met — below 10%'
  return item.label.startsWith('Avoided: ')
    ? `Includes: ${item.label.slice('Avoided: '.length)}`
    : `Not met: ${item.label}`
}

export function submissionReviewError(status: string, items: ReadonlyArray<Pick<CreatorSubmissionReviewResult, 'met'>>) {
  if (status === 'rejected' && !items.some(item => !item.met))
    return 'Select at least one rejection reason so the creator knows what to fix.'
  return null
}
