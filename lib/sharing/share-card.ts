export const shareCardLayout = {
  width: 1080, height: 1920, inset: 78, headerTop: 104, footerBottom: 92,
  headingSize: 28, subheadingSize: 24, scoreLabelSize: 25, scoreSize: 176,
  gradients: [
    'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.08) 36%, rgba(0,0,0,0.82) 100%)',
    'linear-gradient(90deg, rgba(0,0,0,0.4) 0%, rgba(12,34,28,0.12) 42%, rgba(0,0,0,0.28) 100%)',
    'linear-gradient(140deg, rgba(226,205,164,0.12) 0%, rgba(20,42,34,0.14) 42%, rgba(0,0,0,0.24) 100%)',
  ],
} as const

export function getLooksmaxRank(score: number | null, gender: 'male' | 'female' | 'other') {
  const value = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : null
  if (value === null) return 'Unranked'

  if (gender === 'female') {
    if (value >= 9.2) return 'God Tier'
    if (value >= 8) return 'Stacy'
    if (value >= 7.55) return 'Stacy Lite'
    if (value >= 7) return 'HTB'
    if (value >= 6.15) return 'MTB'
    if (value >= 5.35) return 'LTB'
    if (value > 4) return 'Normie'
    return 'Gooner'
  }

  if (gender === 'male') {
    if (value >= 9.95) return 'True Adam'
    if (value >= 9.2) return 'God Tier'
    if (value >= 8.5) return 'Chad'
    if (value >= 8) return 'Chadlite'
    if (value >= 7.35) return 'Mogging'
    if (value >= 6.6) return 'Ascending'
    if (value >= 5.6) return 'Normie+'
    if (value > 4) return 'Normie'
    return 'Gooner'
  }

  if (value >= 8) return 'Elite'
  if (value >= 7.35) return 'Mogging'
  if (value >= 6.6) return 'Ascending'
  if (value >= 5.6) return 'Normie+'
  if (value > 4) return 'Normie'
  return 'Gooner'
}

