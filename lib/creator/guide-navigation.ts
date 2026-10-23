import type { CreatorIconName } from '@/components/creator/creator-icon'

export const creatorGuideTopics = [
  { id: 'start', label: 'Start here', icon: 'guide' },
  { id: 'video', label: 'Create content', icon: 'video-submissions' },
  { id: 'improve', label: 'Improve your content', icon: 'cta' },
  { id: 'rules', label: 'Content rules', icon: 'lock' },
  { id: 'examples', label: 'Examples & references', icon: 'formats' },
  { id: 'referrals', label: 'Referral links & codes', icon: 'link' },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: CreatorIconName }>

export type CreatorGuideTopic = (typeof creatorGuideTopics)[number]['id']

export function creatorGuideTopic(query: string | string[] | undefined, path: string): CreatorGuideTopic {
  const hash = path.split('#')[1]
  if (hash === 'video-requirements') return 'rules'
  if (hash === 'referral-links') return 'referrals'
  return creatorGuideTopics.find((topic) => topic.id === query)?.id ?? 'start'
}

export function creatorGuideHref(topic: CreatorGuideTopic) {
  return topic === 'start' ? '/creator/guide' : `/creator/guide?topic=${topic}`
}
