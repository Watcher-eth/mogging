import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../..')
const publicFrames = [
  'components/app/app-header.tsx',
  'pages/analysis.tsx',
  'pages/battle.tsx',
  'pages/leaderboard.tsx',
]

const requiredSources = [
  ...publicFrames.map(file => [file, 'public-frame']),
  ['pages/battle.tsx', 'SkeletonImage'],
  ['pages/leaderboard.tsx', 'SkeletonImage'],
  ['components/creator/account-link.tsx', 'SkeletonAvatar'],
  ['components/admin/creator-workspace.tsx', 'SkeletonAvatar'],
  ['components/landing/web-checkout.tsx', './checkout-report'],
  ['components/landing/legacy-homepage.tsx', '<WebCheckout embedded showReport'],
  ['pages/index.tsx', '<WebCheckout embedded showReport'],
]

for (const [file, reference] of requiredSources) {
  if (!readFileSync(join(root, file), 'utf8').includes(reference)) {
    throw new Error(`Public release check failed: ${file} is missing ${reference}`)
  }
}

console.log('Public release layout, loading states and checkout report verified')
