import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { LoginDialog } from '@/components/app/login-dialog'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { formatStripePrice, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { useRouter } from 'next/router'
import { Loader2, ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { membershipPlans, MembershipPlans, MembershipValue, MembershipTerms, AppAccessNote, CheckoutLegal, AppContinueLink } from '@/components/payments/membership-offer'
import styles from './web-checkout.module.css'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'

type CheckoutResponse = {
  url: string
}

const CheckoutReport = dynamic(() => import('./checkout-report'))
const webInstallStorageKey = 'mogging:web2app:web-install-id'

export function WebCheckout({ embedded = false, preview = false, intro, showReport = !embedded }: { embedded?: boolean; preview?: boolean; intro?: ReactNode; showReport?: boolean }) {
  const router = useRouter()
  const { status } = useSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const offerRef = useRef<HTMLElement>(null)
  const { t, i18n } = useTranslation()
  const [currency, setCurrency] = useState<string>()
  const [nearOffer, setNearOffer] = useState(!embedded)
  useEffect(() => {
    const node = offerRef.current
    if (nearOffer || !node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNearOffer(true)
    }, { rootMargin: '500px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [nearOffer])
  const { data: prices, error: priceError, mutate: reloadPrices } = useSWR<SubscriptionPrices>(
    nearOffer ? `/api/payments/subscription-prices${currency ? `?currency=${currency}` : ''}` : null,
    apiGet,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )
  const [selectedProduct, setSelectedProduct] = useState<SubscriptionProduct>(
    'mobile_subscription_monthly',
  )
  const selectedTier = membershipPlans.find(tier => tier.id === selectedProduct)!
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [webInstallId, setWebInstallId] = useState<string | null>(null)
  const source = useMemo(
    () => embedded ? 'homepage' : getSource(router.query.source, router.query.utm_source),
    [embedded, router.query.source, router.query.utm_source],
  )
  const installId = useMemo(
    () => firstQueryValue(router.query.install_id) || null,
    [router.query.install_id],
  )
  const checkoutInstallId = installId ?? webInstallId
  const sessionId = useMemo(
    () => firstQueryValue(router.query.session_id) || null,
    [router.query.session_id],
  )
  useEffect(() => {
    if (!router.isReady) return
    setWebInstallId(ensureWebInstallId())
    const product = readProduct(router.query.product)
    if (product) setSelectedProduct(product)
    // Older receipts used the homepage. Keep one verified activation flow.
    if (router.query.checkout === 'success' && sessionId) {
      void router.replace(
        `/app/handoff?session_id=${encodeURIComponent(sessionId)}`,
      )
    } else if (router.query.checkout === 'cancelled') {
      toast.error(t('plan.cancelled'))
    }
  }, [
    router,
    router.isReady,
    router.query.checkout,
    router.query.product,
    sessionId,
    t,
  ])

  useEffect(() => {
    const node = offerRef.current
    if (!node || preview) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      trackWebEvent('paywall_viewed', { surface: 'landing', paywall_id: 'web_membership', paywall_version: '2' })
      observer.disconnect()
    }, { threshold: .25 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [preview])

  async function startWebCheckout() {
    if (!prices || checkoutLoading) return
    if (preview) { toast.info('Design preview — no checkout or payment is created.'); return }
    if (status !== 'authenticated') { setLoginOpen(true); return }
    const attemptId = crypto.randomUUID()
    const purchaseContext = { surface: 'landing', product: selectedProduct, paywall_id: 'web_membership', paywall_version: '2', attempt_id: attemptId }
    trackWebEvent('purchase_started', purchaseContext)
    trackWebEvent('landing_cta_clicked', {
      destination: 'web_checkout',
      plan: selectedProduct,
      placement: embedded ? 'web_section' : 'web_checkout',
    })
    void flushWebAnalytics()
    const nextInstallId = checkoutInstallId ?? ensureWebInstallId()
    if (!checkoutInstallId) setWebInstallId(nextInstallId)

    setCheckoutLoading(true)
    try {
      const response = await apiPost<CheckoutResponse>(
        '/api/payments/web-checkout',
        {
          product: selectedProduct,
          attemptId,
          mobileInstallId: nextInstallId,
          source,
          returnLocale: router.locale ?? 'en',
          currency: prices.availableCurrencies.length > 1 ? prices.currency : undefined,
          unitAmount: prices.amounts[selectedProduct],
          locale: i18n.language.startsWith('zh') ? 'zh' : i18n.language.split('-')[0],
        },
      )
      window.location.href = response.url
    } catch (error) {
      if (!preview) trackWebEvent('purchase_failed', { ...purchaseContext, purchase_stage: 'checkout_create', reason_code: error instanceof ApiClientError ? error.code : 'request_failed' })
      toast.error(
        t(error instanceof ApiClientError && error.status === 401 ? 'plan.signIn'
          : error instanceof ApiClientError && error.status === 409 ? 'plan.changed' : 'plan.checkoutError'),
      )
      void reloadPrices()
      setCheckoutLoading(false)
    }
  }

  const loginParams = new URLSearchParams({ product: selectedProduct, source })
  if (installId) loginParams.set('install_id', installId)

  return <><section ref={offerRef} className={embedded ? showReport ? styles.embedded : styles.offerOnly : styles.standalone}>
    {showReport && <div className={styles.preview}>{nearOffer ? <CheckoutReport /> : null}</div>}
    {intro && <header className={styles.intro}>{intro}</header>}
    <div className={styles.offer}>
      {!embedded ? <header><p className={styles.eyebrow}>Mogging Pro</p><h1 className={styles.title}>{t('plan.checkoutTitle')}</h1><p className={styles.description}>{t('plan.checkoutDescription')}</p></header> : null}
      <MembershipValue />
      <AppAccessNote />
      {prices && prices.availableCurrencies.length > 1 ? <label className={styles.currency}>{t('plan.currency')}<select value={prices.currency} onChange={event => setCurrency(event.target.value)} disabled={checkoutLoading}>{prices.availableCurrencies.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select></label> : null}
      <MembershipPlans disabled={checkoutLoading} prices={prices} selected={selectedProduct} onSelect={product => {
        if (checkoutLoading) return
        if (!preview) trackWebEvent('plan_selected', { plan: product, surface: 'landing', paywall_version: '2' })
        setSelectedProduct(product)
      }} />
      <MembershipTerms prices={prices} selected={selectedProduct} showRenewal={!embedded} />
      {!prices ? <p role="status" className={styles.status}>{t(priceError ? 'plan.unavailable' : 'plan.loading')}{priceError ? <button type="button" onClick={() => void reloadPrices()}>{t('plan.retry')}</button> : null}</p> : null}
      <button type="button" onClick={startWebCheckout} disabled={checkoutLoading || !prices} className={styles.cta}>{checkoutLoading ? <Loader2 size={17} className="animate-spin" /> : null}{checkoutLoading ? t('membership.opening') : t('plan.continue', { plan: t(selectedTier.label) })}{!checkoutLoading && prices ? <span>{formatStripePrice(prices.amounts[selectedProduct], prices.currency, i18n.language)}</span> : null}{!checkoutLoading ? <ArrowRight size={17} /> : null}</button>
      <CheckoutLegal />
      {!embedded && <AppContinueLink />}
    </div>
  </section><LoginDialog open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={`/app?${loginParams}`} /></>
}

function getSource(
  source: string | string[] | undefined,
  utmSource: string | string[] | undefined,
) {
  const value = firstQueryValue(source) || firstQueryValue(utmSource)
  if (!value) return 'web2app'

  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 80) || 'web2app'
  )
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function ensureWebInstallId() {
  try {
    const existing = window.localStorage.getItem(webInstallStorageKey)
    if (existing && existing.length >= 8) return existing
    const next = `web_${crypto.randomUUID()}`
    window.localStorage.setItem(webInstallStorageKey, next)
    return next
  } catch { return `web_${crypto.randomUUID()}` }
}

function readProduct(
  value: string | string[] | undefined,
): SubscriptionProduct | null {
  const product = firstQueryValue(value)
  return product === 'mobile_subscription_weekly' ||
    product === 'mobile_subscription_monthly' ||
    product === 'mobile_subscription_yearly'
    ? product
    : null
}
