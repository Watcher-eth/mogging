// Opt-in real provider smoke test. Never creates live accounts or accepts identity/terms.
import assert from 'node:assert/strict'
import { env } from '../../lib/env'
import { getStripe } from '../../lib/payments/stripe'
import { courseStripeOptions } from '../../lib/courses/stripe'

assert.ok(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Sandbox credentials required')
const stripe = getStripe(), fixtureFile = Bun.file('.local/stripe-v2-provider-check.json')
const params = { include: ['configuration.merchant', 'defaults', 'identity', 'requirements'] as const }
const fixture = await fixtureFile.exists() ? await fixtureFile.json() : null
const account = fixture ? await stripe.v2.core.accounts.retrieve(fixture.accountId, { include: [...params.include] }, courseStripeOptions) : await stripe.v2.core.accounts.create({
  contact_email: 'stripe-integration@mogging.test', display_name: 'Mogging sandbox integration check', dashboard: 'full',
  identity: { country: 'de' }, defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
  configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
  include: [...params.include], metadata: { moggingIntegrationCheck: 'free-course-accounts-v2' },
}, { ...courseStripeOptions, idempotencyKey: 'mogging-course-v2-provider-check' })
assert.equal(account.livemode, false)
assert.equal(account.metadata?.moggingIntegrationCheck, 'free-course-accounts-v2')
assert.equal(account.dashboard, 'full')
assert.equal(account.defaults?.responsibilities?.fees_collector, 'stripe')
assert.equal(account.defaults?.responsibilities?.losses_collector, 'stripe')
assert.ok(account.applied_configurations.includes('merchant'))
assert.ok(!account.applied_configurations.includes('customer'))
await Bun.write(fixtureFile, JSON.stringify({ accountId: account.id, livemode: account.livemode }))
const link = await stripe.v2.core.accountLinks.create({ account: account.id, use_case: { type: 'account_onboarding', account_onboarding: { configurations: ['merchant'], refresh_url: 'http://127.0.0.1:3003/creator/courses?connect=refresh', return_url: 'http://127.0.0.1:3003/creator/courses?connect=returned' } } }, courseStripeOptions)
assert.ok(link.url.startsWith('https://connect.stripe.com/'))
assert.ok(new Date(link.expires_at).getTime() > Date.now())
console.log('PASS: real Accounts v2 merchant and hosted onboarding link at the blueprint API version, with Stripe collecting fees/losses and no customer subscription configuration. KYC and paid checkout remain separate checks.')
