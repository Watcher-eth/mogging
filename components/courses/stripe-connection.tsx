import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import { toast } from 'sonner'
import { courseRequest, type CourseSeller } from '@/lib/courses/client'

export function StripeConnection({ seller, changed }: { seller: CourseSeller; changed: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false)
  const connect = async (existing: boolean) => {
    setBusy(true)
    try {
      const result = await courseRequest<{ url: string }>(`/api/creator/courses/connect${existing ? '' : '/onboarding'}`, 'POST', {})
      window.location.assign(result.url)
    } catch (error) { toast.error((error as Error).message); setBusy(false) }
  }
  const refresh = async () => {
    setBusy(true)
    try { await courseRequest('/api/creator/courses/connect/status'); changed() }
    catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (router.query.connect === 'returned') void refresh()
    if (router.query.connect === 'refresh') void connect(false)
    // Read provider state only when returning from onboarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.connect])
  return <section className="c-stripe-banner">
    <Image src="/courses/stripe-wordmark-white.svg" alt="Stripe" width={72} height={30} />
    <h3>Payments directly to your account.</h3>
    <p>Free hosting. No platform commission. Stripe processing fees apply.</p>
    <div className="c-stripe-banner-bottom"><div>
      {seller.chargesEnabled ? <span>Payments enabled · {seller.payoutsEnabled ? 'payouts enabled' : 'payout setup required'}</span> : <button disabled={busy} onClick={() => void connect(false)}>{busy ? 'Opening…' : seller.stripeAccountId ? 'Finish Stripe setup' : 'Set up Stripe'}</button>}
      {!seller.stripeAccountId && <button disabled={busy} onClick={() => void connect(true)}>Connect existing account ↗</button>}
      {seller.stripeAccountId && <button disabled={busy} onClick={() => void refresh()}>Refresh status</button>}
    </div><div><a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer">Stripe terms ↗</a><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Privacy ↗</a></div></div>
    {!!seller.requirements?.length && <p>Stripe needs: {seller.requirements.join(', ')}</p>}
  </section>
}
