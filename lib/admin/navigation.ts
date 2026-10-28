export const adminNavigation = [
  { label: 'Creator program', items: [
    { href: '/admin/creators', title: 'Review queue', description: 'The next approvals that need your attention.', section: 'overview', icon: 'overview' },
    { href: '/admin/directory', title: 'Creators', description: 'Registrations, setup progress, and creator profiles.', section: 'creators', icon: 'accounts' },
    { href: '/admin/accounts', title: 'Social accounts', description: 'Verify account ownership and audience recordings.', section: 'accounts', icon: 'accounts' },
    { href: '/admin/submissions', title: 'Video submissions', description: 'Review uploads, published posts, and creator feedback.', section: 'submissions', icon: 'video-submissions' },
    { href: '/admin/campaigns', title: 'Campaigns', description: 'Budgets, schedules, and creative briefs.', section: 'sprints', icon: 'submissions' },
    { href: '/admin/payments', title: 'Payments', description: 'Track and manage creator payouts.', section: 'payments', icon: 'payouts' },
    { href: '/admin/invitations', title: 'Invitations', description: 'Prepare personalized accounts and invite creators.', section: 'invites', icon: 'accounts' },
    { href: '/admin/cta-library', title: 'CTA library', description: 'Moderate samples for the creator content library.', section: 'cta-library', icon: 'cta' },
  ] },
  { label: 'Analytics', items: [
    { href: '/admin/analytics', title: 'Product overview', description: 'Customer activity, completed scans, and paid report delivery.', section: 'Overview', icon: 'overview' },
    { href: '/admin/analytics/acquisition', title: 'Acquisition', description: 'Traffic sources, store interest, and first app opens.', section: 'Acquisition', icon: 'accounts' },
    { href: '/admin/analytics/experiments', title: 'A/B tests', description: 'Compare homepage designs and inspect every experiment.', section: 'Experiments', icon: 'overview' },
    { href: '/admin/analytics/onboarding', title: 'Onboarding', description: 'Completion, screen progression, and drop-off across mobile onboarding.', section: 'Onboarding', icon: 'video-submissions' },
    { href: '/admin/analytics/revenue', title: 'Revenue', description: 'Revenue, customer payments, and subscription activity.', section: 'Revenue', icon: 'payouts' },
    { href: '/admin/analytics/retention', title: 'Retention', description: 'Customer return rates, cohort trends, and subscriber engagement.', section: 'Retention', icon: 'overview' },
    { href: '/admin/attribution', title: 'Creator attribution', description: 'Creator-driven traffic, paying customers, and attributed revenue.', section: 'CreatorAttribution', icon: 'accounts' },
    { href: '/admin/creator-performance', title: 'Creator performance', description: 'Content reach, earned creator costs, and post payouts.', section: 'CreatorPerformance', icon: 'overview' },
    { href: '/admin/economics', title: 'Creator economics', description: 'Attributed revenue, creator compensation, and acquisition measurement.', section: 'CreatorEconomics', icon: 'payouts' },
    { href: '/admin/analytics/authentication', title: 'Authentication', description: 'Sign-in activity, authentication issues, and account continuity.', section: 'Authentication', icon: 'accounts' },
    { href: '/admin/analytics/purchases', title: 'Purchase flow', description: 'Purchase attempts, billing confirmation, and access activation.', section: 'Purchases', icon: 'payouts' },
    { href: '/admin/analytics/scans', title: 'Scans', description: 'Completed evaluations, request reliability, and report availability.', section: 'Scans', icon: 'overview' },
    { href: '/admin/analytics/engagement', title: 'Engagement', description: 'Meaningful product use, feature adoption, and completed actions.', section: 'Engagement', icon: 'overview' },
    { href: '/admin/analytics/referrals', title: 'Referrals', description: 'Credited signups, referred customer outcomes, and scan rewards.', section: 'Referrals', icon: 'accounts' },
    { href: '/admin/analytics/notifications', title: 'Notifications', description: 'Notification registrations, reminder activity, and customer engagement.', section: 'Notifications', icon: 'overview' },
    { href: '/admin/analytics/attribution', title: 'Attribution ledger', description: 'Audit creator credit records by attribution model and currency.', section: 'AttributionLedger', icon: 'accounts' },
    { href: '/admin/analytics/quality', title: 'Data health', description: 'Data ingestion, processing queues, and reporting coverage.', section: 'Quality', icon: 'overview' },
    { href: '/admin/analytics/reliability', title: 'Backend reliability', description: 'Recorded backend operations, technical issues, and evaluation follow-up.', section: 'Reliability', icon: 'overview' },
  ] },
  { label: 'Manage', items: [
    { href: '/admin/program-settings', title: 'Program settings', description: 'Set the assumptions used in creator profitability calculations.', section: 'settings', icon: 'payouts' },
    { href: '/admin/invites', title: 'Access codes', description: 'Create and manage scoped app access grants.', section: 'codes', icon: 'cta' },
    { href: '/admin/courses', title: 'Courses', description: 'Review lessons and manage published courses.', section: 'courses', icon: 'video-submissions' },
    { href: '/admin/sellers', title: 'Course sellers', description: 'Review and approve seller registrations.', section: 'sellers', icon: 'accounts' },
  ] },
] as const

export function adminPage(path: string) {
  return adminNavigation.flatMap(group => [...group.items]).find(item => item.href === path)
}

export const analyticsPreviewPages: Record<string, string> = { '/admin/analytics': 'overview', '/admin/analytics/acquisition': 'acquisition', '/admin/analytics/experiments': 'experiments', '/admin/analytics/onboarding': 'onboarding', '/admin/analytics/revenue': 'revenue', '/admin/analytics/retention': 'retention', '/admin/attribution': 'creator-attribution', '/admin/creator-performance': 'creator-performance', '/admin/economics': 'creator-economics', '/admin/analytics/authentication': 'authentication', '/admin/analytics/purchases': 'purchases', '/admin/analytics/scans': 'scans', '/admin/analytics/engagement': 'engagement', '/admin/analytics/referrals': 'referrals', '/admin/analytics/notifications': 'notifications', '/admin/analytics/attribution': 'attribution-ledger', '/admin/analytics/quality': 'data-health', '/admin/analytics/reliability': 'backend-reliability' }
