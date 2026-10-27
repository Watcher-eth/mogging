const unsupportedClaims = /\b(free|no[- ]cost|guarantee(?:d|s)?|discount|scientifically proven|100% accurate|instant results)\b|[$€£]\s*\d/i
/** Creator CTA drafts have no pricing/claims authority. Always render a safe, usable draft. */
export function safeSupportCta(text: string) {
  const changed = unsupportedClaims.test(text) || text.trim().split(/\s+/).length > 12
  return { text: changed ? 'Try a face scan in Mogging. Link in bio.' : text, changed }
}
