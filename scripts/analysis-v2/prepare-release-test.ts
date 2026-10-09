import { registerUser } from '../../lib/auth/register'
import { db, schema } from '../../lib/db'
import { writeFile } from 'node:fs/promises'

const tag = `web-v2-release-${crypto.randomUUID()}`
const email = `${tag}@mogging.local`
const password = crypto.randomUUID() + crypto.randomUUID()
const user = await registerUser({ email, password, name: 'Web report release verification' })
await db.insert(schema.paymentEntitlements).values({
  userId: user.id, mobileInstallId: tag, stripeCheckoutSessionId: tag,
  product: 'evaluation', creditBalance: 1, source: 'release_verification',
  creditExpiresAt: new Date(Date.now() + 86400000), metadata: { test: true, release: 'web-v2' },
})
await writeFile('/private/tmp/mogging-web-v2-test-account.json', JSON.stringify({ userId: user.id, email, password, tag }), { mode: 0o600 })
console.log('Prepared isolated release-test account with one test credit. Credentials remain in the private temporary file.')
process.exit(0)
