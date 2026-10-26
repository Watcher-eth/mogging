import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const native = resolve(import.meta.dir, '../../MoggingMobile/src/components/report-v2/ui-contract.ts')
const destination = resolve(import.meta.dir, '../lib/creator/mobile-report-ui.ts')
const source = readFileSync(native, 'utf8')
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== source) throw new Error('Mobile report UI contract drifted. Run bun scripts/sync-report-ui.ts.')
  console.log('Mobile and Creator Studio UI contracts match.')
} else {
  writeFileSync(destination, source)
  console.log('Copied the mobile report UI contract to Creator Studio.')
}
