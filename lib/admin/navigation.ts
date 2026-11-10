import type { MoggingWebIconName } from '@/lib/design/mogging-web-glyphs'

export const adminNavigation = [
  { label: 'Creator program', items: [
    { href: '/admin/creators', title: 'Review queue', description: 'The next approvals that need your attention.', section: 'overview', icon: 'review-queue' },
    { href: '/admin/directory', title: 'Creators', description: 'Registrations, setup progress, and creator profiles.', section: 'creators', icon: 'people' },
    { href: '/admin/accounts', title: 'Social accounts', description: 'Verify account ownership and audience recordings.', section: 'accounts', icon: 'social-accounts' },
    { href: '/admin/submissions', title: 'Video submissions', description: 'Review uploads, published posts, and creator feedback.', section: 'submissions', icon: 'submitted-video' },
    { href: '/admin/campaigns', title: 'Campaigns', description: 'Budgets, schedules, and creative briefs.', section: 'sprints', icon: 'campaign' },
    { href: '/admin/payments', title: 'Payments', description: 'Track and manage creator payouts.', section: 'payments', icon: 'payout' },
  ] },
  { label: 'Analytics', items: [
    { href: '/admin/analytics', title: 'Product overview', description: 'Customer activity, completed scans, and paid report delivery.', section: 'Overview', icon: 'product-overview' },
    { href: '/admin/analytics/acquisition', title: 'Acquisition', description: 'Traffic sources, store interest, and first app opens.', section: 'Acquisition', icon: 'acquisition' },
    { href: '/admin/analytics/experiments', title: 'Experiments', description: 'Compare homepage designs and web analysis flows.', section: 'Experiments', icon: 'experiments' },
    { href: '/admin/analytics/onboarding', title: 'Onboarding', description: 'Screen progression and drop-off across native apps, mobile web and desktop web.', section: 'Onboarding', icon: 'onboarding' },
    { href: '/admin/analytics/revenue', title: 'Revenue', description: 'Revenue, customer payments, and subscription activity.', section: 'Revenue', icon: 'revenue' },
    { href: '/admin/analytics/retention', title: 'Retention', description: 'Customer return rates, cohort trends, and subscriber engagement.', section: 'Retention', icon: 'retention' },
    { href: '/admin/attribution', title: 'Creator performance', description: 'Compare content reach and creator costs with attributed traffic, customers and revenue.', section: 'CreatorAttribution', icon: 'creator-performance' },
    { href: '/admin/economics', title: 'Creator economics', description: 'Attributed revenue, creator compensation, and acquisition measurement.', section: 'CreatorEconomics', icon: 'creator-economics' },
    { href: '/admin/analytics/web', title: 'Web journeys', description: 'Follow web onboarding, paywall, Stripe payments and report delivery.', section: 'WebJourney', icon: 'web-journey' },
    { href: '/admin/analytics/purchases', title: 'Purchases', description: 'All-source purchases, repeat buyers, purchase timing and mobile attempt diagnostics.', section: 'Purchases', icon: 'purchase-bag' },
    { href: '/admin/analytics/engagement', title: 'Engagement', description: 'Product usage, referral outcomes and notification engagement.', section: 'Engagement', icon: 'engagement' },
    { href: '/admin/analytics/quality', title: 'Data health', description: 'Data ingestion, processing queues, and reporting coverage.', section: 'Quality', icon: 'data-health' },
    { href: '/admin/analytics/reliability', title: 'Backend health', description: 'Backend operations, sign-in errors and evaluation health.', section: 'Reliability', icon: 'backend-health' },
  ] },
  { label: 'Manage', items: [
    { href: '/admin/program-settings', title: 'Program settings', description: 'Set the assumptions used in creator profitability calculations.', section: 'settings', icon: 'program-settings' },
    { href: '/admin/courses', title: 'Courses', description: 'Review lessons and manage published courses.', section: 'courses', icon: 'courses' },
    { href: '/admin/sellers', title: 'Course sellers', description: 'Review and approve seller registrations.', section: 'sellers', icon: 'course-seller' },
  ] },
] as const satisfies ReadonlyArray<{
  label: string
  items: ReadonlyArray<{ href: string; title: string; description: string; section: string; icon: MoggingWebIconName }>
}>

export function adminPage(path: string) {
  return adminNavigation.flatMap(group => [...group.items]).find(item => item.href === path)
}

export const analyticsPreviewPages: Record<string, string> = { '/admin/analytics/web': 'web-journeys', '/admin/analytics': 'overview', '/admin/analytics/acquisition': 'acquisition', '/admin/analytics/experiments': 'experiments', '/admin/analytics/onboarding': 'onboarding', '/admin/analytics/revenue': 'revenue', '/admin/analytics/retention': 'retention', '/admin/attribution': 'creator-attribution', '/admin/creator-performance': 'creator-performance', '/admin/economics': 'creator-economics', '/admin/analytics/authentication': 'authentication', '/admin/analytics/purchases': 'purchases', '/admin/analytics/scans': 'scans', '/admin/analytics/engagement': 'engagement', '/admin/analytics/referrals': 'referrals', '/admin/analytics/notifications': 'notifications', '/admin/analytics/attribution': 'attribution-ledger', '/admin/analytics/quality': 'data-health', '/admin/analytics/reliability': 'backend-reliability' }
