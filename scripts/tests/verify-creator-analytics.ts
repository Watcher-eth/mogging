import { existsSync } from 'node:fs'
import { join } from 'node:path'
import journal from '../../drizzle/meta/_journal.json'
import vercel from '../../vercel.json'

const root = join(import.meta.dir, '../..')
const requiredFiles = [
  'components/admin/submission-audience-check.tsx',
  'pages/api/admin/creator/submissions/[id]/audience.ts',
  'pages/api/cron/creator-audience.ts',
  'lib/creator/audience-check-worker.ts',
]

for (const migration of ['creator_audience_checks', 'creator_submission_analytics']) {
  const entry = journal.entries.find(({ tag }) => tag.endsWith(`_${migration}`))
  if (!entry) throw new Error(`Creator analytics migration missing from journal: ${migration}`)
  requiredFiles.push(`drizzle/${entry.tag}.sql`)
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Creator analytics release is missing ${file}`)
}

if (!vercel.crons.some(({ path }) => path === '/api/cron/creator-audience')) {
  throw new Error('Creator audience check cron is missing')
}

console.log('Creator analytics release files and cron verified')
