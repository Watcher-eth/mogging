import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { toast } from 'sonner'
import { AppContinueLink, CheckoutLegal, WebAnalysisPlanOptions, type WebAnalysisPrices } from '@/components/payments/membership-offer'
import { flushWebAnalytics, trackWebEvent } from '@/lib/analytics/client'
import { apiGet } from '@/lib/api/client'
import { stripeAttemptProperties, takeStripeAttempt } from '@/lib/client/stripe-attempt'
import { isWebAnalysisProduct, type WebAnalysisProduct } from '@/lib/payments/web-analysis-plans'
import styles from './web-checkout.module.css'

const CheckoutReport = dynamic(() => import('./checkout-report'))

export function WebCheckout({ embedded = false, preview = false, intro, showReport = !embedded }: { embedded?: boolean; preview?: boolean; intro?: ReactNode; showReport?: boolean }) {
  const router = useRouter()
  const { t } = useTranslation()
  const offerRef = useRef<HTMLElement>(null)
  const [nearOffer, setNearOffer] = useState(!embedded)
  const [selected, setSelected] = useState<WebAnalysisProduct>()
  const plan = selected ?? (isWebAnalysisProduct(router.query.plan) ? router.query.plan : 'web_basic_monthly')
  const { data: prices, error, mutate } = useSWR<WebAnalysisPrices>(
    nearOffer ? '/api/payments/subscription-prices?catalog=web-analysis' : null,
    apiGet,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )
  useEffect(() => {
    const node = offerRef.current
    if (nearOffer || !node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNearOffer(true)
    }, { rootMargin: '500px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [nearOffer])

  useEffect(() => {
    if (!router.isReady || preview) return
    const { checkout, session_id: sessionId, ...query } = router.query
    if (checkout === 'success' && typeof sessionId === 'string') {
      void router.replace(`/app/handoff?session_id=${encodeURIComponent(sessionId)}`)
    } else if (checkout === 'cancelled') {
      const attempt = takeStripeAttempt('landing')
      if (attempt) trackWebEvent('purchase_cancelled', { surface: 'landing', provider: 'stripe', reason_code: 'checkout_return', ...stripeAttemptProperties(attempt) })
      toast.error(t('plan.cancelled'))
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    }
  }, [router, preview, t])

  return <section ref={offerRef} className={embedded ? showReport ? styles.embedded : styles.offerOnly : styles.standalone}>
    {showReport && <div className={styles.preview}>{nearOffer ? <CheckoutReport /> : null}</div>}
    {intro && <header className={styles.intro}>{intro}</header>}
    <div className={styles.offer}>
      {!embedded && <header><p className={styles.eyebrow}>Mogging</p><h1 className={styles.title}>Choose your analysis plan</h1><p className={styles.description}>Start with your photos, then unlock your full report.</p></header>}
      <WebAnalysisPlanOptions prices={prices} selected={plan} imageCount={1} disabled={false} onSelect={product => {
        setSelected(product)
        if (!preview) trackWebEvent('plan_selected', { plan: product, surface: 'landing', paywall_version: '3' })
      }} />
      {!prices && <p role="status" className={styles.status}>{t(error ? 'plan.unavailable' : 'plan.loading')}{error && <button type="button" onClick={() => void mutate()}>{t('plan.retry')}</button>}</p>}
      <Link href={{ pathname: '/analysis', query: { plan } }} prefetch={false} className={styles.cta} onClick={() => {
        if (preview) return
        trackWebEvent('landing_cta_clicked', { destination: 'web_analysis', plan, placement: embedded ? 'web_section' : 'web_checkout' })
        void flushWebAnalytics()
      }}>{t('plan.start')}<ArrowRight size={17} aria-hidden="true" /></Link>
      <CheckoutLegal />
      {!embedded && <AppContinueLink />}
    </div>
  </section>
}
