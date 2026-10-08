export const CELEBRITY_EDIT_POLICY = 'Smallville and Tom Welling posts are not allowed. Other celebrity edits are unlikely to be approved: they must use exclusively looksmaxxing hashtags (no celebrity or show hashtags) and have a clear looksmaxxing focus, such as a transformation, glow-up, or clear looksmaxxing CTA. Even when these conditions are met, approval is subject to review.'

export function creatorContentRestriction(rule: string) {
  if (rule.startsWith('Unrelated song,')) return rule.replace('Unrelated song,', 'Unrelated movie edits or song,')
  return /smallville|tom welling|celebrity fan/i.test(rule) ? CELEBRITY_EDIT_POLICY : rule
}

export function creatorRestrictionGroups(rules: readonly string[]) {
  const penalties: string[] = []
  const forbidden: string[] = []
  for (const original of rules) {
    const rule = creatorContentRestriction(original)
    const target = /anime|cartoons|animation|sports edits|animal edits|smallville|botted views|fabricated engagement|altered analytics/i.test(rule) ? forbidden : penalties
    target.push(rule)
  }
  return { penalties, forbidden }
}
