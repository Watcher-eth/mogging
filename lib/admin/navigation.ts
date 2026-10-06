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
    { href: '/admin/analytics', title: 'Product overview', description: 'Understand daily activity and the path to value.', section: 'Overview', icon: 'overview' },
    { href: '/admin/analytics/acquisition', title: 'Acquisition', description: 'Where visitors come from and what happens next.', section: 'Acquisition', icon: 'accounts' },
    { href: '/admin/analytics/experiments', title: 'A/B tests', description: 'Compare homepage designs and inspect every experiment.', section: 'Experiments', icon: 'overview' },
    { href: '/admin/analytics/onboarding', title: 'Onboarding', description: 'Find where users continue, hesitate, or leave.', section: 'Onboarding', icon: 'video-submissions' },
    { href: '/admin/analytics/revenue', title: 'Revenue', description: 'Verified purchases, refunds, and subscription events.', section: 'Revenue', icon: 'payouts' },
    { href: '/admin/analytics/retention', title: 'Retention', description: 'See whether users return and build lasting value.', section: 'Retention', icon: 'overview' },
    { href: '/admin/attribution', title: 'Creator attribution', description: 'Understand the customers and revenue each creator brings.', section: 'attribution', icon: 'accounts' },
    { href: '/admin/economics', title: 'Creator economics', description: 'Measure creator performance against sustainable compensation.', section: 'metrics', icon: 'payouts' },
    { href: '/admin/analytics/authentication', title: 'Authentication', description: 'Sign-in outcomes and verified identity linking.', section: 'Authentication', icon: 'accounts' },
    { href: '/admin/analytics/purchases', title: 'Purchase flow', description: 'Paywall choices, purchase outcomes, restores, and handoffs.', section: 'Purchases', icon: 'payouts' },
    { href: '/admin/analytics/scans', title: 'Scans', description: 'Attempts, completions, failures, and scan latency.', section: 'Scans', icon: 'overview' },
    { href: '/admin/analytics/engagement', title: 'Engagement', description: 'Reports, protocols, sharing, battles, and app activity.', section: 'Engagement', icon: 'overview' },
    { href: '/admin/analytics/referrals', title: 'Referrals', description: 'Referral milestones, credited signups, and reward progress.', section: 'Referrals', icon: 'accounts' },
    { href: '/admin/analytics/notifications', title: 'Notifications', description: 'Push opens, registered devices, and reminder records.', section: 'Notifications', icon: 'overview' },
    { href: '/admin/analytics/attribution', title: 'Attribution ledger', description: 'Creator link credit, lifecycle events, and currency-separated revenue.', section: 'AttributionLedger', icon: 'accounts' },
    { href: '/admin/analytics/quality', title: 'Data health', description: 'Monitor delivery, failures, and release quality.', section: 'Quality', icon: 'overview' },
    { href: '/admin/analytics/reliability', title: 'Backend reliability', description: 'Catch outages, broken features, and failed evaluations.', section: 'Reliability', icon: 'overview' },
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
