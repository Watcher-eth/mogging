import { getStripe } from '../../lib/payments/stripe'
import { getWebAnalysisPrice, getWebStarterIntro, WEB_ANALYSIS_CREATOR_COUPON, WEB_ANALYSIS_CREATOR_PERCENT, webAnalysisProducts, webAnalysisStripeProducts as products } from '../../lib/payments/web-analysis-plans'
import { isWebStarterIntroCoupon } from '../../lib/payments/checkout-price'
import type Stripe from 'stripe'

const live = process.argv.includes('--live')
const mobile = process.argv.includes('--mobile')
const key = process.env.STRIPE_SECRET_KEY ?? ''
if (!key.startsWith(live ? 'sk_live_' : 'sk_test_')) throw new Error('Set the Stripe key for the requested mode.')
const stripe = getStripe()
const mode = live ? 'Live' : 'Test'
const starterIntro = getWebStarterIntro(mobile)

async function ensureStarterIntro(price: Stripe.Price) {
  const plan = getWebAnalysisPrice(starterIntro.product, mobile)
  const product = products[starterIntro.product]
  if (!price.active || price.livemode !== live || price.product !== product || price.currency !== starterIntro.currency
    || price.unit_amount !== plan.unitAmount || price.recurring?.interval !== plan.interval || price.recurring.interval_count !== 1) {
    throw new Error('Unexpected Stripe Starter monthly price')
  }
  const intro = await stripe.coupons.retrieve(starterIntro.coupon, { expand: ['applies_to'] }).catch(async (error: unknown) => {
    if ((error as { code?: string }).code !== 'resource_missing') throw error
    await stripe.coupons.create({
      id: starterIntro.coupon, name: `Mogging Starter · $${starterIntro.discount / 100} off first month`,
      currency: starterIntro.currency, amount_off: starterIntro.discount, duration: 'once', applies_to: { products: [product] },
    }, { idempotencyKey: starterIntro.coupon })
    return stripe.coupons.retrieve(starterIntro.coupon, { expand: ['applies_to'] })
  })
  if (!isWebStarterIntroCoupon(intro, price, mobile)) throw new Error('Unexpected Stripe Starter intro coupon')
  console.log(`${mode} coupon ${intro.id} verified`)
}

if (process.argv.includes('--starter-intro-only')) {
  const [price] = (await stripe.prices.list({ lookup_keys: [getWebAnalysisPrice(starterIntro.product, mobile).lookupKey], limit: 1 })).data
  if (!price) throw new Error('Stripe Starter monthly price is missing')
  await ensureStarterIntro(price)
} else {
  for (const id of webAnalysisProducts) {
    const plan = getWebAnalysisPrice(id, mobile)
    const productId = products[id]
    const product = await stripe.products.retrieve(productId).catch((error: unknown) => {
      if ((error as { code?: string }).code !== 'resource_missing') throw error
      return stripe.products.create({ id: productId, name: plan.name, metadata: { surface: 'web_analysis', tier: plan.tier } }, { idempotencyKey: productId })
    })
    if (!product.active || product.metadata.surface !== 'web_analysis' || product.metadata.tier !== plan.tier) throw new Error(`Unexpected Stripe product ${productId}`)
    if (!mobile && product.name !== plan.name) await stripe.products.update(productId, { name: plan.name })

    const [existing] = (await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 })).data
    // Move the new lookup key off the shared Starter product if it was staged there.
    const moveWeekly = !mobile && id === 'web_basic_weekly' && existing?.product === products.web_basic_monthly
      && existing.unit_amount === plan.unitAmount && existing.currency === 'usd' && existing.recurring?.interval === 'week'
    const price = existing && !moveWeekly ? existing : await stripe.prices.create({
      product: productId, currency: 'usd', unit_amount: plan.unitAmount,
      recurring: { interval: plan.interval }, lookup_key: plan.lookupKey,
      ...(moveWeekly ? { transfer_lookup_key: true } : {}),
      metadata: { moggingProduct: id },
    }, { idempotencyKey: `${plan.lookupKey}:${productId}` })
    if (!price.active || price.livemode !== live || price.product !== productId || price.currency !== 'usd'
      || price.unit_amount !== plan.unitAmount || price.recurring?.interval !== plan.interval || price.recurring.interval_count !== 1) {
      throw new Error(`Unexpected Stripe price for ${id}`)
    }
    console.log(`${id} ${price.id} USD ${(plan.unitAmount / 100).toFixed(2)}/${plan.interval}`)
    if (id === starterIntro.product) await ensureStarterIntro(price)
  }

  const coupon = await stripe.coupons.retrieve(WEB_ANALYSIS_CREATOR_COUPON, { expand: ['applies_to'] }).catch(async (error: unknown) => {
    if ((error as { code?: string }).code !== 'resource_missing') throw error
    await stripe.coupons.create({
      id: WEB_ANALYSIS_CREATOR_COUPON, name: 'Mogging creator · 10% off first payment', percent_off: WEB_ANALYSIS_CREATOR_PERCENT, duration: 'once', applies_to: { products: Object.values(products) },
    }, { idempotencyKey: WEB_ANALYSIS_CREATOR_COUPON })
    return stripe.coupons.retrieve(WEB_ANALYSIS_CREATOR_COUPON, { expand: ['applies_to'] })
  })
  if (!coupon.valid || coupon.livemode !== live || coupon.percent_off !== WEB_ANALYSIS_CREATOR_PERCENT || coupon.duration !== 'once'
    || !Object.values(products).every(product => coupon.applies_to?.products.includes(product))) throw new Error('Unexpected Stripe web creator coupon')
  console.log(`${mode} coupon ${coupon.id} verified`)
}
