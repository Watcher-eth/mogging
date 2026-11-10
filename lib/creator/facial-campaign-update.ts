import { sprintTermsSchema, type SprintTerms } from './sprints'
import { CAMPAIGN_ANCHOR_REQUIREMENT, TIKTOK_CAMPAIGN_ANCHOR_URL, withCampaignPublishingRules } from './campaign-publishing-policy'

export const LEGACY_FACIAL_CAMPAIGN_ID = 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'
export const GENERATED_FACIAL_CAMPAIGN_ID = 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11'
export const CREATOR_VIDEO_STUDIO_URL = 'https://www.mogging.com/creator/video-studio'
export const TIKTOK_ANCHOR_URL = TIKTOK_CAMPAIGN_ANCHOR_URL
export const ANCHOR_REQUIREMENT = CAMPAIGN_ANCHOR_REQUIREMENT
export const IMMEDIATE_SUBMISSION_REQUIREMENT = 'I am submitting this video as soon as it is uploaded to the social media platform. I will upload fresh video analytics at every view milestone.'
export const IMMEDIATE_SUBMISSION_GUIDANCE = 'Submit this video as soon as you upload it to the social media platform. Do not wait for views or analytics. This lets us start tracking your video immediately. Upload a fresh analytics recording at each view milestone to claim earnings.'
export const FACIAL_CAMPAIGN_DESCRIPTION = 'Open the new Creator Studio, select a format and model, and generate a detailed facial analysis video. Download the generated video, upload it to your social media platform using the required TikTok anchor, then submit the published video link to this campaign immediately. Upload fresh video analytics at each view milestone.'
export const FACIAL_TIER_A_OVERRIDES: Record<number, number> = { 50_000: 2000, 500_000: 10_500, 1_000_000: 20_000 }
export const FACIAL_CAMPAIGN_EXAMPLES = [
  { url: 'https://www.tiktok.com/@moggingcom/video/7706306978384989471', label: '@moggingcom · 1' },
  { url: 'https://www.tiktok.com/@moggingcom/video/7704053149606153503', label: '@moggingcom · 2' },
  { url: 'https://www.tiktok.com/@moggingcom/video/7703834896812281118', label: '@moggingcom · 3' },
  { url: 'https://www.tiktok.com/@matheomaxxing/video/7703824463263042847', label: '@matheomaxxing · 4' },
  { url: 'https://www.tiktok.com/@matheomaxxing/video/7704057443764030750', label: '@matheomaxxing · 5' },
  { url: 'https://www.tiktok.com/@matheomaxxing/video/7704854290615143710', label: '@matheomaxxing · 6' },
]

export function withAnchorRequirement(terms: SprintTerms): SprintTerms {
  return withCampaignPublishingRules(terms)
}

/** Apply once to the original generated campaign; never recalculate a saved submission's terms. */
export function replacementFacialTerms(original: SprintTerms): SprintTerms {
  if (original.submitOnPublish) throw new Error('Replacement rates have already been applied')
  const terms = structuredClone(original)
  delete terms.mgcSourceCampaignId
  terms.submitOnPublish = true
  terms.milestones = terms.milestones.map(item => ({
    ...item,
    amountCents: FACIAL_TIER_A_OVERRIDES[item.views] ?? Math.round(item.amountCents * 0.65),
    audienceRates: item.audienceRates?.map(rate => ({ ...rate, amountCents: rate.audiencePercent >= 32
      ? FACIAL_TIER_A_OVERRIDES[item.views] ?? Math.round(rate.amountCents * 0.65)
      : Math.round(rate.amountCents * 0.65) })),
  }))
  terms.formats = terms.formats.map(format => ({
    ...format,
    name: 'Detailed Facial Analysis',
    shortDescription: FACIAL_CAMPAIGN_DESCRIPTION,
    elements: [
      { title: 'Open the new Creator Studio', detail: 'Go to the new Creator Studio and choose a format and model for your detailed facial analysis.' },
      { title: 'Generate and upload your video', detail: 'Generate the detailed facial analysis video, download it, and upload it to your social media platform using the required Mogging TikTok anchor link.' },
      { title: 'Submit immediately, then add analytics', detail: IMMEDIATE_SUBMISSION_GUIDANCE },
    ],
    requirements: [...format.requirements.map(rule => rule.startsWith('Provide one continuous physical recording') ? 'At every view milestone, provide one continuous physical recording of this post’s analytics filmed with a second device; show the username, post, views, traffic sources and audience locations without cuts or edits.' : rule), IMMEDIATE_SUBMISSION_REQUIREMENT],
  }))
  return sprintTermsSchema.parse(withAnchorRequirement(terms))
}
