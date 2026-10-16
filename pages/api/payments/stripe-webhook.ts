import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'
import { processStripeEvent } from '@/lib/payments/stripe-events'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } })
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: { code: 'internal_error', message: 'Stripe webhook is not configured' } })
  }

  let event: Stripe.Event
  try {
    const signature = req.headers['stripe-signature']
    const body = await readRawBody(req)
    event = await getStripe().webhooks.constructEventAsync(
      body,
      Array.isArray(signature) ? signature[0] : signature ?? '',
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error)
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid Stripe webhook signature' } })
  }

  try {
    await processStripeEvent(event)
  } catch (error) {
    console.error('Stripe webhook handling failed', event.id, event.type, error)
    return res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handling failed' } })
  }

  return res.status(200).json({ received: true })
}

async function readRawBody(req: NextApiRequest) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default monitorBackend('payments/stripe-webhook',handler)
