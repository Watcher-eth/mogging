import { ApiError } from '@/lib/api/http'
import { getProductConfig } from './entitlements'
import { getStripe } from './stripe'

export async function validateCheckoutProduct(productId: string, product: ReturnType<typeof getProductConfig>) {
  if (!product.priceId && product.unitAmount < 50) {
    throw new ApiError(503, `${product.name} is missing a valid checkout price`)
  }

  if (product.mode === 'subscription' && !product.interval && !product.priceId) {
    throw new ApiError(503, `${product.name} is missing a subscription interval`)
  }

  if (process.env.NODE_ENV === 'production' && product.mode === 'subscription' && !product.priceId) {
    throw new ApiError(503, `${product.name} is missing its Stripe price ID (${productId})`)
  }

  if (!product.priceId) return

  const priceEnvName = getStripePriceEnvName(productId)
  if (!/^price_[A-Za-z0-9]+$/.test(product.priceId)) {
    throw new ApiError(503, `${product.name} has an invalid Stripe price ID in ${priceEnvName}`)
  }

  const price = await getStripe().prices.retrieve(product.priceId, { expand: ['currency_options'] }).catch((error: unknown) => {
    if (isMissingStripePriceError(error)) {
      throw new ApiError(
        503,
        `${product.name} uses a Stripe price ID that does not exist for the configured STRIPE_SECRET_KEY. Update ${priceEnvName}.`
      )
    }
    throw error
  })
  if (price.billing_scheme !== 'per_unit' || price.unit_amount === null) {
    throw new ApiError(503, `${product.name} must use a fixed Stripe price`)
  }
  if (!price.active) {
    throw new ApiError(503, `${product.name} uses an inactive Stripe price in ${priceEnvName}`)
  }

  if (product.mode === 'subscription') {
    if (!price.recurring || price.recurring.interval_count !== 1) {
      throw new ApiError(503, `${product.name} must use a recurring Stripe price`)
    }
    if (product.interval && price.recurring.interval !== product.interval) {
      throw new ApiError(503, `${product.name} Stripe price must recur every ${product.interval}, not ${price.recurring.interval}`)
    }
    return price
  }

  if (price.recurring) {
    throw new ApiError(503, `${product.name} must use a one-time Stripe price`)
  }
  return price
}

function getStripePriceEnvName(productId: string) {
  if (productId === 'evaluation') return 'STRIPE_EVALUATION_PRICE_ID'
  if (productId === 'evaluation_pack_3') return 'STRIPE_EVALUATION_PACK_3_PRICE_ID'
  if (productId === 'mobile_subscription_weekly') return 'STRIPE_MOBILE_WEEKLY_PRICE_ID'
  if (productId === 'mobile_subscription_monthly') return 'STRIPE_MOBILE_MONTHLY_PRICE_ID'
  if (productId === 'mobile_subscription_yearly') return 'STRIPE_MOBILE_YEARLY_PRICE_ID'
  if (productId === 'mobile_lifetime') return 'STRIPE_MOBILE_LIFETIME_PRICE_ID'
  if (productId === 'extra_potential_image') return 'STRIPE_EXTRA_POTENTIAL_IMAGE_PRICE_ID'
  return 'STRIPE_*_PRICE_ID'
}

function isMissingStripePriceError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { type?: unknown; code?: unknown; param?: unknown; statusCode?: unknown }
  return (
    record.type === 'StripeInvalidRequestError' &&
    record.code === 'resource_missing' &&
    record.param === 'price' &&
    record.statusCode === 404
  )
}

