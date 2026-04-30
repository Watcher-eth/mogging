import Stripe from 'stripe'
import { env } from '@/lib/env'

let stripeClient: Stripe | null = null

export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required for checkout')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }

  return stripeClient
}
