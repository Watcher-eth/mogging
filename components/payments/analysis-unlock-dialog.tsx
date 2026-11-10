import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { paywallExperimentProperties, type PaywallExposure } from '@/lib/payments/paywall-experiment'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, FileText, Loader2, LockKeyhole, ScanFace, ShieldCheck, Tag, Timer } from '@/components/ui/mogging-glyphs'
import { TextMorph } from 'torph/react'
import { ensureAnalysisWebInstallId } from '@/lib/client/analysis-install'
import { apiGet, apiPost } from '@/lib/api/client'
import { trackWebEvent } from '@/lib/analytics/client'
import { webJourneyContext } from '@/lib/analytics/web-journey'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { SkeletonAvatar } from '@/components/ui/skeleton-avatar'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatStripePrice, subscriptionProducts, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { AppAccessNote, CheckoutLegal, MembershipPlans, membershipPlans, MembershipTerms, MembershipValue, WebAnalysisPlanBenefits, WebAnalysisPlanOptions, type ReportPrice, type CheckoutQuote, type WebAnalysisPrices } from './membership-offer'
import { getWebAnalysisPrice, isWebAnalysisProduct, webAnalysisCheckoutLimit, webAnalysisProducts, webStarterIntro, type WebAnalysisProduct } from '@/lib/payments/web-analysis-plans'
import dynamic from 'next/dynamic'
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))
import styles from './analysis-unlock-dialog.module.css'
import planStyles from './membership-offer.module.css'

const walkthroughPrices: SubscriptionPrices = {
  currency: 'usd', availableCurrencies: ['usd'],
  amounts: { mobile_subscription_weekly: 499, mobile_subscription_monthly: 999, mobile_subscription_yearly: 4999 },
}

const walkthroughWebPrices = (mobile: boolean): WebAnalysisPrices => ({
  currency: 'usd', starterIntro: webStarterIntro.firstMonth,
  amounts: Object.fromEntries(webAnalysisProducts.map(id => [id, getWebAnalysisPrice(id, mobile).unitAmount])) as WebAnalysisPrices['amounts'],
})
const offerMotion = { duration: .24, ease: [.22, 1, .36, 1] as const }
const confetti = Array.from({ length: 24 }, (_, index) => ({
  start: index % 2 ? 82 : 18,
  x: (index % 2 ? -1 : 1) * (16 + index * 7 % 108),
  y: 45 + index * 29 % 130,
  spin: (index % 2 ? 1 : -1) * (70 + index * 19),
}))
const offerStorageKey = (flowId: string) => `mogging.starter-intro.${flowId}`

function StarterIntroTimer({ deadline }: { deadline: number }) {
  const reduce = useReducedMotion()
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const tick = () => {
      clearTimeout(timeout)
      const left = Math.max(0, deadline - Date.now())
      setSeconds(Math.ceil(left / 1000))
      if (left > 0) timeout = setTimeout(tick, left % 1000 || 1000)
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [deadline])
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return <div className={styles.offerTimer} role="timer" aria-label={`Offer ends in ${time}`} aria-live="off">
    <Timer size={15} aria-hidden="true" /> <span aria-hidden="true">{reduce ? time : <TextMorph>{time}</TextMorph>}</span>
  </div>
}

export type AnalysisPurchase = ReportPrice['product'] | SubscriptionProduct | WebAnalysisProduct
export function AnalysisUnlockDialog({ fullscreen, desktopAnalysis, webCatalog, onboardingExperiment, walkthrough, imageSrc, landmarks, imageCount, open, onOpenChange, onCheckout, loading, loadingLabel, error, returnOfferSessionId, initialProduct }: {
  fullscreen?: boolean; walkthrough?: boolean; imageSrc: string | null; landmarks: FaceLandmarksPayload | null; imageCount: number; open: boolean; onOpenChange: (open: boolean) => void;
  desktopAnalysis?: boolean;
  webCatalog?: boolean;
  onboardingExperiment?: PaywallExposure | null;
  initialProduct?: string;
  onCheckout: (product: AnalysisPurchase, quote: CheckoutQuote) => void; loading: boolean; error: string | null; returnOfferSessionId?: string | null
  loadingLabel?: string
}) {
  const { t, i18n } = useTranslation()
  const reduce = useReducedMotion()
  const feedback = useScanFeedback()
  const { status } = useSession()
  const guestCheckout = desktopAnalysis && status === 'unauthenticated'
  const loadPrices = !walkthrough && (open || desktopAnalysis)
  const [mode, setMode] = useState<'pro' | 'report'>(initialProduct === 'evaluation' || initialProduct === 'evaluation_pack_3' ? 'report' : 'pro')
  const [selected, setSelected] = useState<SubscriptionProduct>(() => subscriptionProducts.find(plan => plan === initialProduct) ?? 'mobile_subscription_monthly')
  const [selectedWeb, setSelectedWeb] = useState<WebAnalysisProduct>(() => isWebAnalysisProduct(initialProduct) ? initialProduct : 'web_basic_monthly')
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorCode, setCreatorCode] = useState('')
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'applying' | 'applied' | 'failed'>('idle')
  const [dismissedOffer, setDismissedOffer] = useState<string | null>(null)
  const [panel, setPanel] = useState<'plans' | 'starter-intro' | 'intro-reveal'>('plans')
  const [introWindow, setIntroWindow] = useState<{ flowId: string; deadline: number } | null>(null)
  const [startingIntro, setStartingIntro] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const paywallVersion = desktopAnalysis ? '3' : '2'
  const paywallEvent = { surface: 'web_analysis', provider: 'stripe', paywall_version: paywallVersion }
  const track = (event: Parameters<typeof trackWebEvent>[0], properties: Record<string, string> = {}) => {
    if (!walkthrough) trackWebEvent(event, { ...paywallEvent, ...paywallExperimentProperties(experiment), ...properties })
  }

  const { data: creatorOfferData, mutate: reloadCreatorOffer } = useSWR<{ offer: { name: string; avatarUrl: string | null; percent: number } | null }>(
    loadPrices && webCatalog && status !== 'loading' ? ['/api/payments/creator-offer', status] : null,
    ([url]) => {
      try { return apiGet(`${url}?installId=${encodeURIComponent(ensureAnalysisWebInstallId())}`) }
      catch { return apiGet(url) }
    },
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )

  async function applyCreatorCode() {
    if (!creatorCode.trim() || creatorStatus === 'applying') return
    setCreatorStatus('applying')
    track('attribution_diagnostic', { action: 'creator_code_submitted' })
    try {
      if (!walkthrough) await apiPost('/api/attribution/link?surface=web_analysis', { slug: creatorCode.trim(), source: 'creator_code' })
      await reloadCreatorOffer()
      setCreatorStatus('applied')
      track('attribution_resolved', { action: 'creator_code_applied' })
    } catch {
      setCreatorStatus('failed')
      track('attribution_diagnostic', { action: 'creator_code_rejected' })
    }
  }

  const selectedPlan = selected === 'mobile_subscription_weekly' && imageCount > 1 ? 'mobile_subscription_monthly' : selected
  const webPlan = webAnalysisCheckoutLimit(selectedWeb) >= imageCount ? selectedWeb : 'web_pro_monthly'
  const selectedProduct = webCatalog ? webPlan : selectedPlan
  const reportProduct = imageCount > 1 ? 'evaluation_pack_3' : 'evaluation'
  const reportChoice = !desktopAnalysis && (fullscreen || !webCatalog)
  const { data: fetchedSubscriptions, error: subscriptionError, isValidating: loadingSubscriptions, mutate: retrySubscriptions } = useSWR<SubscriptionPrices & { experiment?: PaywallExposure }>(loadPrices && !webCatalog ? `/api/payments/subscription-prices${fullscreen ? '?experiment=mobile' : ''}` : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const webCatalogUrl = fullscreen
    ? '/api/payments/subscription-prices?catalog=web-analysis-mobile&experiment=mobile'
    : '/api/payments/subscription-prices?catalog=web-analysis&experiment=desktop'
  const { data: fetchedWebPrices, error: webPriceError, isValidating: loadingWebPrices, mutate: retryWebPrices } = useSWR<WebAnalysisPrices>(loadPrices && webCatalog ? webCatalogUrl : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false })
  const webPrices = walkthrough ? walkthroughWebPrices(Boolean(fullscreen)) : fetchedWebPrices
  const intro = webCatalog && !fullscreen && webPrices?.starterIntro != null && imageCount <= webAnalysisCheckoutLimit(webStarterIntro.product)
    ? { currency: webPrices.currency, first: webPrices.starterIntro, renewal: webPrices.amounts[webStarterIntro.product] } : null
  const { data: fetchedReportQuote, error: reportError, isValidating: loadingReportPrice, mutate: retryReport } = useSWR<ReportPrice>(loadPrices && reportChoice ? `/api/payments/report-price?product=${reportProduct}` : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const experiment = !walkthrough ? onboardingExperiment ?? (webCatalog ? fetchedWebPrices?.experiment : fetchedSubscriptions?.experiment) : undefined
  const shortPaywall = experiment?.kind === 'length' && experiment.arm === 'treatment'
  const offerKey = experiment?.kind !== 'price' && open && !webCatalog && !walkthrough && status === 'authenticated' && returnOfferSessionId && imageCount <= 2 ? returnOfferSessionId : null
  const { data: returnOffer, error: returnOfferError } = useSWR(offerKey ? ['web-return-offer', offerKey] : null,
    ([, sessionId]) => apiPost<{ eligible: boolean }>('/api/payments/return-offer', { sessionId }), { shouldRetryOnError: false, revalidateOnFocus: false })
  const subscriptions = walkthrough ? walkthroughPrices : fetchedSubscriptions
  const reportQuote = walkthrough ? { product: reportProduct, currency: 'usd', amount: 599 } as const : fetchedReportQuote
  const report = reportQuote?.product === reportProduct ? reportQuote : undefined
  const pro = !reportChoice || mode === 'pro' && (webCatalog || imageCount <= 2)
  const showIntro = Boolean(pro && intro && introWindow && panel !== 'plans')
  const monthly = subscriptions?.amounts.mobile_subscription_monthly
  const showReturnOffer = Boolean(offerKey && dismissedOffer !== offerKey && returnOffer?.eligible && monthly != null)
  const seen = useRef(new Set<string>())
  const openedAt = useRef(Date.now())
  const defaultMembershipPlan = useRef(selectedProduct)
  const rememberDefaultPlan = useEffectEvent(() => { defaultMembershipPlan.current = selectedProduct })
  const restoreIntro = useEffectEvent(() => {
    if (!webCatalog) return
    const flowId = webJourneyContext().flow_id
    if (!flowId) return
    let deadline = introWindow?.flowId === flowId ? introWindow.deadline : 0
    if (!deadline) {
      try { deadline = Number(sessionStorage.getItem(offerStorageKey(flowId))) || 0 } catch { /* Storage is optional. */ }
    }
    setIntroWindow(deadline ? { flowId, deadline } : null)
    setPanel(deadline > Date.now() ? 'starter-intro' : 'plans')
  })
  function expireIntro() {
    track('paywall_offer_dismissed', { offering: 'starter_intro', reason_code: 'expired' })
    if (loading) setPanel('plans')
    else onOpenChange(false)
  }
  const onIntroExpiry = useEffectEvent(expireIntro)
  useEffect(() => {
    if (!open) return
    openedAt.current = Date.now()
    rememberDefaultPlan()
    restoreIntro()
  }, [open])
  useEffect(() => {
    if (!open || !showIntro) return
    scrollRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [open, showIntro])
  const deadline = introWindow?.deadline
  useEffect(() => {
    if (!open || !showIntro || !deadline) return
    let handled = false
    const check = () => {
      if (handled || deadline > Date.now()) return
      handled = true
      onIntroExpiry()
    }
    const timer = setTimeout(check, Math.max(0, deadline - Date.now()))
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [open, showIntro, deadline])
  useEffect(() => {
    if (!open || walkthrough) { seen.current.clear(); return }
    const log = (key: string, name: Parameters<typeof trackWebEvent>[0], properties: Record<string, string | number | boolean>) => {
      if (seen.current.has(key)) return
      seen.current.add(key)
      trackWebEvent(name, { surface: 'web_analysis', provider: 'stripe', paywall_version: paywallVersion, ...properties })
    }
    const plans = webCatalog ? webPrices : subscriptions
    if (plans) log('plans', 'paywall_products_loaded', { mode: 'pro', products_loaded: true, product_count: Object.keys(plans.amounts).length, duration_ms: Date.now() - openedAt.current })
    if (report) log(report.product, 'paywall_products_loaded', { mode: 'report', product: report.product, products_loaded: true, product_count: 1, duration_ms: Date.now() - openedAt.current })
    if (subscriptionError || webPriceError) log('plans-error', 'paywall_products_loaded', { mode: 'pro', products_loaded: false, product_count: 0, reason_code: 'price_request_failed', duration_ms: Date.now() - openedAt.current })
    if (reportError) log('report-error', 'paywall_products_loaded', { mode: 'report', products_loaded: false, product_count: 0, reason_code: 'price_request_failed', duration_ms: Date.now() - openedAt.current })
    if (offerKey && showReturnOffer) log(offerKey, 'paywall_offer_unlocked', { offering: 'stripe_return' })
    if (offerKey && returnOfferError) log(offerKey, 'paywall_offer_unavailable', { offering: 'stripe_return' })
  }, [webCatalog, offerKey, open, paywallVersion, report, returnOfferError, showReturnOffer, subscriptions, subscriptionError, reportError, walkthrough, webPrices, webPriceError])

  const membershipPrice = webCatalog
    ? webPrices && { currency: webPrices.currency, unitAmount: webPrices.amounts[webPlan] }
    : subscriptions && { currency: subscriptions.currency, unitAmount: subscriptions.amounts[selectedPlan] }
  const price = pro ? membershipPrice : report && { currency: report.currency, unitAmount: report.amount }
  const membershipPriceError = webCatalog ? webPriceError : subscriptionError
  const priceError = pro ? membershipPriceError : reportError
  const reloadMembershipPrices = webCatalog ? retryWebPrices : retrySubscriptions
  const retry = () => {
    track('onboarding_interaction', { action: 'price_reload', mode: pro ? 'pro' : 'report' })
    seen.current.delete(pro ? 'plans-error' : 'report-error')
    if (pro) void reloadMembershipPrices()
    else void retryReport()
  }
  const checkoutLabel = pro && webCatalog ? 'Unlock now' : pro ? t('membership.startPro') : t('membership.unlockReport')
  const validatingPrice = pro ? (webCatalog ? loadingWebPrices : loadingSubscriptions) : loadingReportPrice
  const pricePending = price?.unitAmount == null && validatingPrice
  const checkoutPending = loading || pricePending
  const actionLabel = loading ? loadingLabel ?? t('membership.opening')
    : pricePending ? t('plan.loading', { defaultValue: 'Loading prices…' }) : checkoutLabel
  const creatorOffer = webCatalog && pro && !showIntro ? creatorOfferData?.offer : null
  const shownPrice = showIntro && intro ? { currency: intro.currency, unitAmount: intro.first }
    : creatorOffer && price ? { ...price, unitAmount: price.unitAmount - Math.round(price.unitAmount * creatorOffer.percent / 100) }
      : price
  const logVisiblePlans = useEffectEvent(() => {
    const trackPlan = (product: AnalysisPurchase, amount: number, currency: string, firstPayment: number,
      offering: 'standard' | 'starter_intro' | 'stripe_return', defaultPlan: AnalysisPurchase, available: boolean) => {
      if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(firstPayment) || firstPayment < 0) return
      const creatorDiscount = offering === 'standard' && Boolean(creatorOffer)
      const key = JSON.stringify(['plan', experiment?.unit, product, amount, currency, firstPayment, offering, creatorDiscount, defaultPlan, available])
      if (seen.current.has(key)) return
      seen.current.add(key)
      trackWebEvent('paywall_plan_viewed', {
        ...paywallEvent, ...paywallExperimentProperties(experiment), product, currency, price: amount, first_payment_price: firstPayment,
        default_plan: defaultPlan, creator_discount: creatorDiscount, offering,
        status: available ? 'available' : 'unavailable',
      })
    }
    if (showReturnOffer && subscriptions && monthly != null) {
      trackPlan('mobile_subscription_monthly', monthly, subscriptions.currency, Math.round(monthly * .9),
        'stripe_return', 'mobile_subscription_monthly', true)
    }
    if (showIntro && intro) {
      trackPlan(webStarterIntro.product, intro.renewal, intro.currency, intro.first, 'starter_intro', webStarterIntro.product, true)
    } else if (pro && webCatalog && webPrices) {
      for (const product of webAnalysisProducts) {
        const amount = webPrices.amounts[product]
        const firstPayment = creatorOffer ? amount - Math.round(amount * creatorOffer.percent / 100) : amount
        trackPlan(product, amount, webPrices.currency, firstPayment, 'standard', defaultMembershipPlan.current,
          webAnalysisCheckoutLimit(product) >= imageCount)
      }
    } else if (pro && subscriptions) {
      for (const plan of membershipPlans) {
        const amount = subscriptions.amounts[plan.id]
        trackPlan(plan.id, amount, subscriptions.currency, amount, 'standard', defaultMembershipPlan.current, plan.credits >= imageCount)
      }
    } else if (!pro && report) {
      trackPlan(report.product, report.amount, report.currency, report.amount, 'standard', report.product, true)
    }
  })
  useEffect(() => {
    if (open && !walkthrough) logVisiblePlans()
  }, [open, walkthrough, showReturnOffer, monthly, showIntro, pro, webCatalog, webPrices, subscriptions, creatorOffer, imageCount, report])
  const selectMode = (next: 'pro' | 'report') => { if (fullscreen && mode !== next) feedback('selection'); setMode(next); track('plan_selected', { plan: next === 'pro' ? selectedProduct : reportProduct }) }
  const selectPlan = (plan: SubscriptionProduct) => { if (fullscreen && selectedPlan !== plan) feedback('selection'); setSelected(plan); track('plan_selected', { plan }) }

  const modes = reportChoice && imageCount <= 2 ? <div className={styles.modes} role="group" aria-label={t('membership.purchaseType')}>{(['pro', 'report'] as const).map(item => <button key={item} type="button" disabled={loading} aria-pressed={pro === (item === 'pro')} onClick={() => selectMode(item)}>{fullscreen ? (item === 'pro' ? webCatalog ? 'Membership' : 'Pro' : 'Report') : (item === 'pro' ? t('membership.pro') : t('membership.reportOnly'))}</button>)}</div> : null

  const title = showIntro ? 'See your full face map for less' : desktopAnalysis || fullscreen ? t('paywall.title') : t('membership.unlock')
  const planOverlay = showIntro || webPlan === 'web_basic_monthly' ? 'overall' : webPlan === 'web_pro_monthly' ? 'symmetry' : 'eyes'
  const planHook = showIntro ? 'Get the full picture today. Use your next scans to see what changes.'
    : webPlan === 'web_pro_monthly' ? 'Get a plan tailored to your goals and see what changes over time.'
      : webPlan === 'web_basic_weekly' ? 'Start with one scan and see where to focus first.'
        : fullscreen ? 'Find your starting point and check in as you make changes.'
          : 'See what your front and side photos reveal, then check in as you make changes.'
  const close = async () => {
    if (loading || startingIntro) return
    if (intro && panel === 'plans' && pro && !introWindow) {
      const flowId = webJourneyContext().flow_id
      if (flowId) {
        setStartingIntro(true)
        try {
          const serverNow = Date.now()
          const offer = walkthrough ? { deadline: serverNow + webStarterIntro.durationMs, serverNow }
            : await apiPost<{ deadline: number; serverNow: number }>('/api/payments/starter-intro', { flowId }, { signal: AbortSignal.timeout(4000) })
          const deadline = Date.now() + offer.deadline - offer.serverNow
          setIntroWindow({ flowId, deadline })
          try { sessionStorage.setItem(offerStorageKey(flowId), String(deadline)) } catch { /* Storage is optional. */ }
          if (offer.deadline > offer.serverNow) {
            setPanel('intro-reveal')
            track('paywall_offer_unlocked', { offering: 'starter_intro' })
            return
          }
        } catch {
          track('paywall_offer_unavailable', { offering: 'starter_intro' })
        } finally {
          setStartingIntro(false)
        }
      }
    }
    if (showIntro) track('paywall_offer_dismissed', { offering: 'starter_intro' })
    track('paywall_dismissed')
    onOpenChange(false)
  }
  const morph = (value: string) => reduce ? value : <TextMorph>{value}</TextMorph>
  const portrait = <>
    <ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} fit="cover" showLabel={false} focusCategory={webCatalog && pro ? planOverlay : undefined} />
    <ProgressiveBlur className={styles.artBlur} blurLayers={6} intensity={10} />
    {creatorOffer && <div className={styles.creatorBadge}>
      <SkeletonAvatar src={creatorOffer.avatarUrl} size={26} className={styles.creatorAvatar}
        alt="" referrerPolicy="no-referrer" fallback={<span aria-hidden="true">{Array.from(creatorOffer.name)[0]?.toUpperCase()}</span>} />
      <span><b>{creatorOffer.name} got you {creatorOffer.percent}% off</b><small>First payment</small></span>
    </div>}
    {showIntro && deadline && <StarterIntroTimer deadline={deadline} />}
    {showIntro && panel === 'intro-reveal' && !reduce && <div aria-hidden="true" className={styles.offerSparks}>
      {confetti.map(({ start, x, y, spin }, index) => <motion.i key={index} style={{ left: `${start}%`, top: '12%' }}
        initial={{ opacity: 0, x: 0, y: 0, rotate: 0 }}
        animate={{ opacity: [0, 1, 1, 0], x, y: [0, -24, y], rotate: spin }}
        transition={{ ...offerMotion, duration: .96, delay: index * .012 }} />)}
    </div>}
  </>
  const content = <>
    {!desktopAnalysis && <motion.div className={styles.art} layout={fullscreen ? 'position' : undefined} layoutId={fullscreen ? 'analysis-portrait' : undefined}>
      {portrait}
    </motion.div>}
    <div className={styles.content}><div ref={scrollRef} className={styles.scroll}>
      {desktopAnalysis && imageSrc && <div className={`${styles.art} ${styles.desktopArt}`} style={{ '--paywall-photo': `url(${JSON.stringify(imageSrc)})` } as CSSProperties}>
        {portrait}
      </div>}
      {fullscreen && modes}
      <header><DialogTitle ref={titleRef} tabIndex={-1} className={styles.title}>{morph(title)}</DialogTitle>
        {(desktopAnalysis || fullscreen) && <p className={styles.subtitle}>{webCatalog && pro ? planHook : t('paywall.description')}</p>}
      </header>
      {!fullscreen && modes}
      {showReturnOffer && subscriptions && monthly != null && offerKey && <section className={styles.returnOffer} aria-label="Return offer">
        <small>First-month offer</small>
        <strong>Finish your evaluation with 10% off Pro</strong>
        <p>{formatStripePrice(Math.round(monthly * .9), subscriptions.currency, i18n.language)} for your first month, then {formatStripePrice(monthly, subscriptions.currency, i18n.language)}/month. Renews until canceled.</p>
        <button type="button" className={styles.cta} disabled={loading || creatorStatus === 'applying'} onClick={() => {
          track('plan_selected', { plan: 'mobile_subscription_monthly', offering: 'stripe_return' })
          onCheckout('mobile_subscription_monthly', { currency: subscriptions.currency, unitAmount: monthly, returnOfferSessionId: offerKey, experiment })
        }}>Finish with 10% off <ArrowRight size={16} /></button>
        <button type="button" disabled={loading} onClick={() => { setDismissedOffer(offerKey); track('paywall_offer_dismissed', { offering: 'stripe_return' }) }}>Back to plans</button>
      </section>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={showIntro ? 'intro' : pro ? 'pro' : 'report'} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : offerMotion} className={`${styles.offer} ${pro && !webCatalog ? styles.pro : ''}`}>
        {showIntro && intro ? <section className={styles.starterIntro} aria-label="Starter first-month offer">
          <div className={`${planStyles.plan} ${styles.offerPrice}`}>
            <span className={planStyles.selection} aria-hidden="true" />
            <span className={planStyles.planBadge} data-tone="savings">{Math.round((1 - intro.first / intro.renewal) * 100)}% off</span>
            <span className={planStyles.planTop}><strong>Starter</strong></span>
            <span className={`${planStyles.planPrice} ${styles.offerAmount}`}>{morph(formatStripePrice(intro.first, intro.currency, i18n.language))}</span>
            <span className={planStyles.cadence}>First month</span>
          </div>
          <p>Then {formatStripePrice(intro.renewal, intro.currency, i18n.language)}/month from month two.</p>
          <WebAnalysisPlanBenefits product={webStarterIntro.product} />
        </section> : pro ? webCatalog ? <WebAnalysisPlanOptions compact={shortPaywall} prices={webPrices} selected={webPlan} imageCount={imageCount} disabled={loading || startingIntro}
          onSelect={plan => { if (fullscreen && webPlan !== plan) feedback('selection'); setSelectedWeb(plan); track('plan_selected', { plan }) }} /> : <>{shortPaywall ? <details className={planStyles.planDetails}><summary>What’s included</summary><MembershipValue scan={fullscreen} /></details> : <MembershipValue scan={fullscreen} />}{!fullscreen && <AppAccessNote />}<MembershipPlans prices={subscriptions} selected={selectedPlan} onSelect={selectPlan} minimumCredits={imageCount} disabled={loading} /></> : <><div className={styles.reportOffer}><span>{imageCount > 1 ? t('membership.threeReports') : t('membership.oneReport')}</span><strong>{report ? formatStripePrice(report.amount, report.currency, i18n.language) : '—'}<small>{t('membership.once')}</small></strong><p>{t('membership.reportDetail')}</p></div><p className={styles.reportNote}>{imageCount > 2 ? t('membership.batch') : t('membership.proDifference')}</p></>}
      </motion.div></AnimatePresence>
      {priceError && !pricePending ? <p role="alert" className={styles.error}>{t('plan.unavailable')} <button type="button" onClick={retry}>{t('plan.retry')}</button></p> : null}
      {error ? <p role="alert" className={styles.error}>{error}{!loading ? <button type="button" onClick={retry}>{t('plan.retry')}</button> : null}</p> : null}
      </div><footer className={styles.footer}>
      {pro ? !webCatalog && <MembershipTerms prices={subscriptions} selected={selectedPlan} compactOnMobile /> : <p className={styles.oneTime}>{t('membership.reportDetail')}</p>}
      {webCatalog && pro && <p className={styles.commitment}>No commitment. Cancel anytime.</p>}
      <button className={styles.cta} disabled={loading || startingIntro || creatorStatus === 'applying' || shownPrice?.unitAmount == null}
        type="button" onClick={() => {
          if (showIntro && intro) {
            if (!deadline || deadline <= Date.now()) { expireIntro(); return }
            track('plan_selected', { plan: webStarterIntro.product, offering: 'starter_intro' })
            onCheckout(webStarterIntro.product, { currency: intro.currency, unitAmount: intro.renewal, starterIntro: true, experiment })
            return
          }
          if (price?.unitAmount == null) return
          track('onboarding_interaction', { action: 'checkout_tapped', product: pro ? selectedProduct : reportProduct })
          if (fullscreen) feedback('action')
          onCheckout(pro ? selectedProduct : reportProduct, { ...price, experiment, ...(creatorOffer ? { creatorDiscount: true } : {}) })
        }}>
        {checkoutPending && <Loader2 size={17} className="motion-safe:animate-spin" aria-hidden="true" />}
        {!checkoutPending && desktopAnalysis && <ScanFace size={17} aria-hidden="true" />}
        <span aria-live="polite"><TextMorph>{actionLabel}</TextMorph></span>
        {!checkoutPending && <>
          {shownPrice?.unitAmount != null && <span className={styles.ctaPrice}>{morph(formatStripePrice(shownPrice.unitAmount, shownPrice.currency, i18n.language))}</span>}
          {!desktopAnalysis && <ArrowRight size={17} aria-hidden="true" />}
        </>}
      </button>
      {showIntro ? <div className={styles.offerActions}>
        <button type="button" disabled={loading} onClick={() => setPanel('plans')}>Back to plans</button>
        <button type="button" disabled={loading} onClick={close}>No thanks</button>
      </div> : <><div className={styles.checkoutLinks}>
        <button type="button" className={styles.creatorToggle} aria-expanded={creatorOpen} onClick={() => {
          if (!creatorOpen) track('attribution_diagnostic', { action: 'creator_code_opened' })
          setCreatorOpen(!creatorOpen)
        }}><Tag size={14} aria-hidden="true" /> {t('paywall.creator')}</button>
        {desktopAnalysis && <>
          <Link className={styles.creatorToggle} href="/tos"><FileText size={14} aria-hidden="true" />{t('footer.terms', { defaultValue: 'Terms' })}</Link>
          <Link className={styles.creatorToggle} href="/privacy"><LockKeyhole size={14} aria-hidden="true" />{t('footer.privacy', { defaultValue: 'Privacy' })}</Link>
        </>}
      </div>
      {creatorOpen && <div className={styles.creatorForm}>
        <label><span className="sr-only">Creator code</span><input value={creatorCode} placeholder="Enter creator code" autoCapitalize="none" maxLength={200} disabled={creatorStatus === 'applying' || loading} onChange={event => { setCreatorCode(event.target.value); setCreatorStatus('idle') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void applyCreatorCode() } }} /></label>
        <button type="button" disabled={!creatorCode.trim() || creatorStatus === 'applying' || loading} onClick={() => void applyCreatorCode()} aria-live="polite"><TextMorph>{creatorStatus === 'applying' ? 'Applying…' : 'Apply'}</TextMorph></button>
        {creatorStatus === 'applied' && <p role="status">Creator code applied.{webCatalog ? ' Eligible first-time subscribers get 10% off their first payment.' : !guestCheckout && ' Eligible first-time Pro subscribers receive 10% off their first month on the monthly plan.'}</p>}
        {creatorStatus === 'failed' && <p role="alert">Couldn’t apply that code. Check it and try again.</p>}
      </div>}</>}
      {!desktopAnalysis && <CheckoutLegal />}</footer>
    </div>
  </>
  return <Dialog open={open} onOpenChange={next => next ? onOpenChange(true) : void close()}><DialogContent aria-describedby={undefined} className={styles.dialog} overlayClassName={desktopAnalysis ? 'bg-black/25 backdrop-blur-md' : undefined} data-desktop-analysis={desktopAnalysis || undefined} data-scan-fullscreen={fullscreen || undefined} data-paywall-length={shortPaywall && pro && !showIntro && !showReturnOffer ? 'short' : undefined} data-offer={showIntro ? 'starter-intro' : pro ? 'pro' : 'report'}>
    {content}
    {desktopAnalysis && <div className={styles.stripeBadge}>
      <ShieldCheck size={13} aria-hidden="true" /> Secure checkout with <Image src="/courses/stripe-wordmark-white.svg" alt="Stripe" width={39} height={16} />
    </div>}
  </DialogContent></Dialog>
}
