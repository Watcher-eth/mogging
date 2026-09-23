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
    name: 'General Creator Video',
    shortDescription: 'An original, unmistakably looks-focused video that demonstrates Mogging and ends with a direct call to action.',
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
      'Make the entire video, on-screen text, and caption clearly looksmaxxing, BP, or transformation related: emphasize appearance, attractiveness, facial features, improvement, or potential',
      'Make the looks focus obvious without a reviewer having to infer it; a celebrity or attractive person alone does not qualify',
      'Use genuine views and engagement, provide accurate analytics, and comply with moderator account reviews',
    ],
    notAllowed: [
      'False or misleading claims about results',
      'Reused content that was not created for Mogging',
      'Obscured app footage or unreadable on-screen text',
      'Engagement farms: promising looks, confidence, a glow-up, or romantic success in exchange for likes, comments, notifications, shares, or sound use',
      'Unrelated song, summer, school, friendship, dating, or mood captions, even over footage of an attractive person',
      'Anime, cartoons, animation, MMA, NBA, other sports edits, or animal edits',
      'Smallville story clips or celebrity fan compilations without an explicit looks focus; solo Tom Welling looks edits may qualify',
      'Botted views, purchased or fabricated engagement, or altered analytics evidence',
    ],
  },
] as const satisfies ReadonlyArray<CreatorSubmissionFormat>

export const ACTIVE_CREATOR_SUBMISSION_FORMATS = CREATOR_SUBMISSION_FORMATS.filter((format) => format.active)

export function getCreatorSubmissionFormat(formatId: string) {
  return ACTIVE_CREATOR_SUBMISSION_FORMATS.find((format) => format.id === formatId)
}
