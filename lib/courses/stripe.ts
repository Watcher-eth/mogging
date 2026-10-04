import Stripe from 'stripe'
import { env } from '@/lib/env'

// Course integration blueprint version; existing main-app payments retain their SDK default.
export const courseStripeOptions = { apiVersion: '2026-08-26.dahlia' }

let client: Stripe | undefined

export function getCourseStripe() {
  if (!env.COURSE_STRIPE_SECRET_KEY) throw new Error('COURSE_STRIPE_SECRET_KEY is required for course payments')
  return client ??= new Stripe(env.COURSE_STRIPE_SECRET_KEY, {
    typescript: true,
    timeout: 10_000,
    maxNetworkRetries: 2,
  })
}
