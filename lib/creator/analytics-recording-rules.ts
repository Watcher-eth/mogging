import type { SprintTerms } from './sprints'

export const TIKTOK_ANALYTICS_RECORDING_RULES = [
  'In TikTok’s Overview tab, clearly show the post summary and all five Key metrics. Include video views, total play time, average watch time, watched full video percentage, and new followers.',
  'Scroll through TikTok’s entire Viewers tab from top to bottom. Pause so every label, count, and percentage is readable. Show Total viewers, both Viewer types breakdowns (new vs. returning and non-followers vs. followers), every Gender category, every Age range, and every row in Locations.',
] as const

export function campaignAnalyticsRecordingRules({ platforms, submitOnPublish }: Pick<SprintTerms, 'platforms' | 'submitOnPublish'>) {
  return [
    submitOnPublish
      ? 'Submit the link when you publish. At each view milestone, upload a fresh, continuous analytics recording filmed with a second device.'
      : 'Upload a continuous analytics recording filmed with a second device.',
    ...(platforms.includes('tiktok') ? TIKTOK_ANALYTICS_RECORDING_RULES : []),
  ]
}
