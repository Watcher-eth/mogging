/** Standalone, guild-scoped commands; no parent command is required. */
export const supportCommandNames = ['ask', 'connect', 'submissions', 'performance', 'campaigns', 'allowance', 'reset', 'help'] as const
export const supportCommands = [
    { name: 'ask', description: 'Ask about your campaigns, submissions, earnings, or creator account', type: 1, options: [{ name: 'question', description: 'What can we help with?', type: 3, required: true, max_length: 1500 }] },
    { name: 'connect', description: 'Securely connect your Creator Studio account', type: 1 },
    { name: 'submissions', description: 'See your submission statuses privately', type: 1 },
    { name: 'performance', description: 'See how your videos converted', type: 1, options: [{ name: 'period', description: 'Reporting period (UTC)', type: 3, required: false, choices: [{ name: 'This week', value: 'this-week' }, { name: 'Last week', value: 'last-week' }, { name: 'Last 30 days', value: 'last-30-days' }] }] },
    { name: 'campaigns', description: 'Find your accessible campaigns and their current terms', type: 1 },
    { name: 'allowance', description: 'Check your shared portal and Discord daily allowance', type: 1 },
    { name: 'reset', description: 'Start a fresh private support conversation', type: 1 },
    { name: 'help', description: 'Learn how private creator support works', type: 1 },
].map(command => ({ ...command, default_member_permissions: null }))
