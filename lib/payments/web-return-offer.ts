import { ApiError } from '@/lib/api/http'
import { CREATOR_MONTHLY_COUPON, isFirstSubscriptionEligible } from './creator-discount'
import { getStripe } from './stripe'

export async function validateWebReturnOffer(accountId: string, sessionId: string, customerId: string) {
  const stripe = getStripe()
  const previous = await stripe.checkout.sessions.retrieve(sessionId)
  if (previous.client_reference_id !== accountId || previous.metadata?.source !== 'web_analysis'
    || previous.payment_status !== 'unpaid' || previous.status !== 'open' || previous.metadata?.returnOffer === '1') {
    throw new ApiError(409, 'This return offer is no longer available')
  }
  if (!await isFirstSubscriptionEligible(accountId) || (await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 })).data.length) {
    throw new ApiError(409, 'This offer is for eligible new subscribers')
  }
  const coupon = await stripe.coupons.retrieve(CREATOR_MONTHLY_COUPON)
  if (!coupon.valid || coupon.percent_off !== 10 || coupon.duration !== 'once') {
    throw new ApiError(503, 'The return offer is temporarily unavailable')
  }
  return previous
}
