import { CELEBRITY_EDIT_POLICY } from './content-policy'
import { CREATOR_CTA_GUIDANCE } from './post-guidance'
export type CreatorSubmissionFormat = {
  id: string
  name: string
  shortDescription: string
  active: boolean
  elements: ReadonlyArray<{ title: string; detail: string }>
  requirements: ReadonlyArray<string>
  notAllowed: ReadonlyArray<string>
}

const SHARED_REQUIREMENTS = [
  'Tag @moggingcom in the post caption',
  'Keep the post public and the content original',
  'Use a connected account when one is available',
  'Make the entire video or slideshow, on-screen text, and caption clearly looksmaxxing, ascension, or transformation focused: emphasize appearance, attractiveness, facial features, improvement, or potential',
  'Make the looks focus obvious without a reviewer having to infer it; a celebrity or attractive person alone does not qualify',
  'Use genuine views and engagement, provide accurate analytics, and comply with moderator account reviews',
  'Provide one continuous physical recording of this post’s analytics filmed with a second device; show the screen, username, post, views, traffic sources, and audience locations without cuts or edits',
] as const

const EARLY_CTA = { title: 'Early CTA · 2–3 seconds', detail: CREATOR_CTA_GUIDANCE } as const

export const CREATOR_SUBMISSION_FORMATS = [
  {
    id: 'general-creator-video-v1',
    name: 'General Mogging Face Scan',
    shortDescription: 'An original looksmaxxing or ascension-focused video or slideshow that shows Mogging and invites viewers to try it. Choose the format that historically works best for your audience; you have creative freedom over the approach.',
    active: true,
    elements: [
      { title: 'Opening hook', detail: 'Introduce the problem, result, or transformation in the first few seconds of a video or the opening slide of a slideshow.' },
      { title: 'Product moment', detail: 'Show Mogging clearly enough for viewers to understand what the app does.' },
      EARLY_CTA,
    ],
    requirements: SHARED_REQUIREMENTS,
    notAllowed: [
      'False or misleading claims about results',
      'Reused content that was not created for Mogging',
      'Obscured app footage, unclear app images, or unreadable on-screen text',
      'Engagement farms: promising looks, confidence, a glow-up, or romantic success in exchange for likes, comments, notifications, shares, or sound use',
      'Unrelated movie edits or song, summer, school, friendship, dating, or mood captions, even over footage of an attractive person',
      'Anime, cartoons, animation, MMA, NBA, other sports edits, or animal edits',
      CELEBRITY_EDIT_POLICY,
      'Botted views, purchased or fabricated engagement, or altered analytics evidence',
    ],
  },
  {
    id: 'custom-video-v1',
    name: 'Custom format',
    shortDescription: 'Create your own looksmaxxing or ascension-focused video or slideshow. Use the approach that works best for your audience and include a clear invitation to try Mogging.',
    active: true,
    elements: [EARLY_CTA],
    requirements: SHARED_REQUIREMENTS,
    notAllowed: [],
  },
] as const satisfies ReadonlyArray<CreatorSubmissionFormat>

export const ACTIVE_CREATOR_SUBMISSION_FORMATS = CREATOR_SUBMISSION_FORMATS.filter((format) => format.active)

export function getCreatorSubmissionFormat(formatId: string) {
  return ACTIVE_CREATOR_SUBMISSION_FORMATS.find((format) => format.id === formatId)
}
