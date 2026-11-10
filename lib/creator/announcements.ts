export const creatorNotificationsPath = '/api/creator/announcements'

export type CreatorAnnouncement = {
  id: string
  title: string
  description: string
  publishedAt: string
  href: string
}

export type CreatorSubmissionNotification = CreatorAnnouncement & { unread: boolean }

export type CreatorNotificationsFeed = {
  announcements: CreatorAnnouncement[]
  messages: CreatorSubmissionNotification[]
}

export const creatorProgramLaunch: CreatorAnnouncement = {
  id: 'creator-program-launch-2026-10-23',
  title: '3 new campaigns and bonuses are live',
  description: 'Find your format. Create your next post. Earn more.',
  publishedAt: '2026-10-23T19:00:00Z',
  href: '/creator/sprints',
}
