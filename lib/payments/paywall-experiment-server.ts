import { createHmac, randomUUID } from 'node:crypto'
import type { NextApiRequest } from 'next'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import type Stripe from 'stripe'
import { ApiError } from '@/lib/api/http'
import { getStripe } from './stripe'
import { validateCheckoutProduct } from './checkout-price'
import { getProductConfig } from './entitlements'
import type { PaywallExposure, PaywallSurface } from './paywall-experiment'

const day = 86_400_000
const cookieName = 'mogging_paywall_visitor'
const visitorId = z.string().uuid()
const fields = {
  id: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minimumPerArm: z.number().int().min(100).max(100_000).default(500),
}
const surfaces = z.enum(['mobile', 'desktop', 'both'])
const configSchema = z.discriminatedUnion('kind', [
  z.object({ ...fields, kind: z.literal('length'), surface: surfaces }).strict(),
  z.object({ ...fields, kind: z.literal('onboarding'), surface: surfaces, focus: z.literal('entry').optional() }).strict(),
  z.object({
    ...fields, kind: z.literal('price'), surface: z.enum(['mobile', 'desktop']),
    stripePriceId: z.string().regex(/^price_[A-Za-z0-9]+$/), unitAmount: z.number().int().min(50).max(100_000),
  }).strict(),
])

export function parsePaywallExperiment(raw?: string) {
  if (!raw) return null
  const config = configSchema.parse(JSON.parse(raw))
  const duration = Date.parse(config.endsAt) - Date.parse(config.startsAt)
  if (duration < 4 * day || duration > 5 * day) throw new Error('Web analysis experiments must run for four to five days')
  return config
}

type Config = NonNullable<ReturnType<typeof parsePaywallExperiment>>
type PriceConfig = Extract<Config, { kind: 'price' }>
type Assignment = { config: Config; exposure: PaywallExposure }

export function assignPaywallExperiment(config: Config, visitor: string, surface: PaywallSurface, secret: string): PaywallExposure {
  const digest = createHmac('sha256', secret).update(`mogging:paywall:${config.id}:${surface}:${visitor}`).digest()
  return {
    id: config.id, unit: digest.subarray(1, 17).toString('hex'),
    arm: digest[0] % 2 === 0 ? 'control' : 'treatment',
    surface, kind: config.kind, ...(config.kind === 'onboarding' && config.focus ? { focus: config.focus } : {}), endsAt: Date.parse(config.endsAt), minimumPerArm: config.minimumPerArm,
  }
}

function configuration() {
  try { return parsePaywallExperiment(process.env.WEB_PAYWALL_EXPERIMENT) }
  catch (error) {
    console.error('Invalid WEB_PAYWALL_EXPERIMENT configuration', error instanceof Error ? error.name : 'invalid')
    return null
  }
}

function setVisitor(res: ServerResponse, id: string) {
  const previous = res.getHeader('Set-Cookie')
  const cookies = Array.isArray(previous) ? previous : previous ? [String(previous)] : []
  res.setHeader('Set-Cookie', [...cookies, `${cookieName}=${id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`])
}

export function quotePaywallExperiment(req: Pick<NextApiRequest, 'cookies'>, res: ServerResponse, surface: PaywallSurface, secret: string, placement: 'paywall' | 'onboarding' = 'paywall', manualScanEntry = false): Assignment | null {
  const config = configuration()
  const now = Date.now()
  if (!config || (placement === 'onboarding') !== (config.kind === 'onboarding') || (config.surface !== 'both' && config.surface !== surface) || now < Date.parse(config.startsAt) || now >= Date.parse(config.endsAt)) return null
  if (config.kind === 'onboarding' && config.focus === 'entry' && (surface !== 'mobile' || !manualScanEntry)) return null
  const existing = visitorId.safeParse(req.cookies[cookieName])
  const id = existing.success ? existing.data : randomUUID()
  if (!existing.success) setVisitor(res, id)
  return { config, exposure: assignPaywallExperiment(config, id, surface, secret) }
}

export function checkoutPaywallExperiment(req: NextApiRequest, id: string, surface: PaywallSurface, secret: string): Assignment {
  const config = configuration()
  const visitor = visitorId.safeParse(req.cookies[cookieName])
  const now = Date.now()
  // Honor a previously opened paywall for up to one day after enrollment closes.
  if (!config || config.id !== id || (config.surface !== 'both' && config.surface !== surface)
    || now < Date.parse(config.startsAt) || now >= Date.parse(config.endsAt) + day || !visitor.success) {
    throw new ApiError(409, 'This offer has changed. Reopen the paywall to refresh your plans.')
  }
  return { config, exposure: assignPaywallExperiment(config, visitor.data, surface, secret) }
}

export function paywallPriceProduct() {
  return 'web_basic_monthly' as const
}

function stripeProduct(price: Stripe.Price) {
  return typeof price.product === 'string' ? price.product : price.product.id
}

export function validatePaywallTreatmentPrice(config: PriceConfig, control: Stripe.Price | undefined, treatment: Stripe.Price) {
  if (!control || !treatment.active || treatment.currency !== 'usd' || treatment.billing_scheme !== 'per_unit'
    || treatment.unit_amount !== config.unitAmount || treatment.type !== 'recurring'
    || treatment.recurring?.interval !== 'month' || treatment.recurring.interval_count !== 1
    || treatment.recurring.usage_type !== 'licensed' || treatment.livemode !== control.livemode
    || treatment.transform_quantity || treatment.tax_behavior !== control.tax_behavior
    || stripeProduct(treatment) !== stripeProduct(control)) {
    throw new ApiError(503, 'The experimental price is temporarily unavailable')
  }
  return treatment
}

export async function getPaywallTreatmentPrice(config: PriceConfig, control?: Stripe.Price) {
  const product = paywallPriceProduct()
  const [standard, treatment] = await Promise.all([
    control ?? validateCheckoutProduct(product, getProductConfig(product), config.surface === 'mobile'),
    getStripe().prices.retrieve(config.stripePriceId),
  ])
  return validatePaywallTreatmentPrice(config, standard, treatment)
}
