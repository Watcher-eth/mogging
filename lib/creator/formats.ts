export type CreatorSubmissionFormat = {
  id: string
  name: string
  shortDescription: string
  active: boolean
  elements: ReadonlyArray<{ title: string; detail: string }>
  requirements: ReadonlyArray<string>
  notAllowed: ReadonlyArray<string>
}

export const CREATOR_SUBMISSION_FORMATS = [
  {
    id: 'general-creator-video-v1',
    name: 'General creator video',
    shortDescription: 'An original short-form video that clearly demonstrates Mogging and ends with a direct call to action.',
    active: true,
    elements: [
      { title: 'Opening hook', detail: 'Introduce the problem, result, or transformation within the first 3 seconds.' },
      { title: 'Product moment', detail: 'Show Mogging clearly enough for viewers to understand what the app does.' },
      { title: 'Closing CTA', detail: 'End with a clear invitation for viewers to try Mogging.' },
    ],
    requirements: [
      'Tag @mogging in the post or caption',
      'Keep the post public and the content original',
      'Submit within 30 days of publishing',
      'Use a connected account when one is available',
    ],
    notAllowed: [
      'False or misleading claims about results',
      'Reused content that was not created for Mogging',
      'Obscured app footage or unreadable on-screen text',
    ],
  },
] as const satisfies ReadonlyArray<CreatorSubmissionFormat>

export const ACTIVE_CREATOR_SUBMISSION_FORMATS = CREATOR_SUBMISSION_FORMATS.filter((format) => format.active)

export function getCreatorSubmissionFormat(formatId: string) {
  return ACTIVE_CREATOR_SUBMISSION_FORMATS.find((format) => format.id === formatId)
}
