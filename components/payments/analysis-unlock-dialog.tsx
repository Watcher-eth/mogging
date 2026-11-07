import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Loader2, Tag } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api/client'
import { trackWebEvent } from '@/lib/analytics/client'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatStripePrice, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { AppAccessNote, CheckoutLegal, MembershipPlans, MembershipTerms, MembershipValue, type ReportPrice, type CheckoutQuote } from './membership-offer'
import dynamic from 'next/dynamic'
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))
import styles from './analysis-unlock-dialog.module.css'

const walkthroughPrices: SubscriptionPrices = {
  currency: 'usd', availableCurrencies: ['usd'],
  amounts: { mobile_subscription_weekly: 499, mobile_subscription_monthly: 999, mobile_subscription_yearly: 4999 },
}

export type AnalysisPurchase = ReportPrice['product'] | SubscriptionProduct
export function AnalysisUnlockDialog({ fullscreen, walkthrough, imageSrc, landmarks, imageCount, open, onOpenChange, onCheckout, loading, error, returnOfferSessionId }: {
  fullscreen?: boolean; walkthrough?: boolean; imageSrc: string | null; landmarks: FaceLandmarksPayload | null; imageCount: number; open: boolean; onOpenChange: (open: boolean) => void;
  onCheckout: (product: AnalysisPurchase, quote: CheckoutQuote) => void; loading: boolean; error: string | null; returnOfferSessionId?: string | null
}) {
  const { t, i18n } = useTranslation()
  const reduce = useReducedMotion()
  const feedback = useScanFeedback()
  const [mode, setMode] = useState<'pro' | 'report'>('pro')
  const [selected, setSelected] = useState<SubscriptionProduct>('mobile_subscription_monthly')
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorCode, setCreatorCode] = useState('')
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'applying' | 'applied' | 'failed'>('idle')
  const [dismissedOffer, setDismissedOffer] = useState<string | null>(null)
  const paywallEvent = { surface: 'web_analysis', provider: 'stripe', paywall_version: '2' }
  const track = (event: Parameters<typeof trackWebEvent>[0], properties: Record<string, string> = {}) => {
    if (!walkthrough) trackWebEvent(event, { ...paywallEvent, ...properties })
  }

  async function applyCreatorCode() {
    if (!creatorCode.trim() || creatorStatus === 'applying') return
    setCreatorStatus('applying')
    track('attribution_diagnostic', { action: 'creator_code_submitted' })
    try {
      if (!walkthrough) await apiPost('/api/attribution/link?surface=web_analysis', { slug: creatorCode.trim(), source: 'creator_code' })
      setCreatorStatus('applied')
      track('attribution_resolved', { action: 'creator_code_applied' })
    } catch {
      setCreatorStatus('failed')
      track('attribution_diagnostic', { action: 'creator_code_rejected' })
    }
  }

  const selectedPlan = selected === 'mobile_subscription_weekly' && imageCount > 1 ? 'mobile_subscription_monthly' : selected
  const reportProduct = imageCount > 1 ? 'evaluation_pack_3' : 'evaluation'
  const { data: fetchedSubscriptions, error: subscriptionError, mutate: retrySubscriptions } = useSWR<SubscriptionPrices>(open && !walkthrough ? '/api/payments/subscription-prices' : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const { data: fetchedReportQuote, error: reportError, mutate: retryReport } = useSWR<ReportPrice>(open && !walkthrough ? `/api/payments/report-price?product=${reportProduct}` : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const offerKey = open && !walkthrough && returnOfferSessionId && imageCount <= 2 ? returnOfferSessionId : null
  const { data: returnOffer, error: returnOfferError } = useSWR(offerKey ? ['web-return-offer', offerKey] : null,
    ([, sessionId]) => apiPost<{ eligible: boolean }>('/api/payments/return-offer', { sessionId }), { shouldRetryOnError: false, revalidateOnFocus: false })
  const subscriptions = walkthrough ? walkthroughPrices : fetchedSubscriptions
  const reportQuote = walkthrough ? { product: reportProduct, currency: 'usd', amount: 599 } as const : fetchedReportQuote
  const report = reportQuote?.product === reportProduct ? reportQuote : undefined
  const pro = mode === 'pro' && imageCount <= 2
  const monthly = subscriptions?.amounts.mobile_subscription_monthly
  const showReturnOffer = Boolean(offerKey && dismissedOffer !== offerKey && returnOffer?.eligible && monthly != null)
  const seen = useRef(new Set<string>())
  const openedAt = useRef(Date.now())
  useEffect(() => { if (open) openedAt.current = Date.now() }, [open])
  useEffect(() => {
    if (!open || walkthrough) { seen.current.clear(); return }
    const log = (key: string, name: Parameters<typeof trackWebEvent>[0], properties: Record<string, string | number | boolean>) => {
      if (seen.current.has(key)) return
      seen.current.add(key)
      trackWebEvent(name, { surface: 'web_analysis', provider: 'stripe', paywall_version: '2', ...properties })
    }
    if (subscriptions) log('plans', 'paywall_products_loaded', { mode: 'pro', products_loaded: true, product_count: Object.keys(subscriptions.amounts).length, duration_ms: Date.now() - openedAt.current })
    if (report) log(report.product, 'paywall_products_loaded', { mode: 'report', product: report.product, products_loaded: true, product_count: 1, duration_ms: Date.now() - openedAt.current })
    if (subscriptionError) log('plans-error', 'paywall_products_loaded', { mode: 'pro', products_loaded: false, product_count: 0, reason_code: 'price_request_failed', duration_ms: Date.now() - openedAt.current })
    if (reportError) log('report-error', 'paywall_products_loaded', { mode: 'report', products_loaded: false, product_count: 0, reason_code: 'price_request_failed', duration_ms: Date.now() - openedAt.current })
    if (offerKey && showReturnOffer) log(offerKey, 'paywall_offer_unlocked', { offering: 'stripe_return' })
    if (offerKey && returnOfferError) log(offerKey, 'paywall_offer_unavailable', { offering: 'stripe_return' })
  }, [offerKey, open, report, returnOfferError, showReturnOffer, subscriptions, subscriptionError, reportError, walkthrough])

  const price = pro ? subscriptions && { currency: subscriptions.currency, unitAmount: subscriptions.amounts[selectedPlan] } : report && { currency: report.currency, unitAmount: report.amount }
  const priceError = pro ? subscriptionError : reportError
  const retry = () => { track('onboarding_interaction', { action: 'price_reload', mode: pro ? 'pro' : 'report' }); seen.current.delete(pro ? 'plans-error' : 'report-error'); void (pro ? retrySubscriptions() : retryReport()) }
  const selectMode = (next: 'pro' | 'report') => { if (fullscreen && mode !== next) feedback('selection'); setMode(next); if (!walkthrough) trackWebEvent('plan_selected', { surface: 'web_analysis', plan: next === 'pro' ? selectedPlan : reportProduct, paywall_version: '2' }) }
  const selectPlan = (plan: SubscriptionProduct) => { if (fullscreen && selectedPlan !== plan) feedback('selection'); setSelected(plan); if (!walkthrough) trackWebEvent('plan_selected', { surface: 'web_analysis', plan, paywall_version: '2' }) }

  const modes = imageCount <= 2 ? <div className={styles.modes} role="group" aria-label={t('membership.purchaseType')}>{(['pro', 'report'] as const).map(item => <button key={item} type="button" disabled={loading} aria-pressed={pro === (item === 'pro')} onClick={() => selectMode(item)}>{fullscreen ? (item === 'pro' ? 'Pro' : 'Report') : (item === 'pro' ? t('membership.pro') : t('membership.reportOnly'))}</button>)}</div> : null

  return <Dialog open={open} onOpenChange={next => { if (!next) track('paywall_dismissed'); onOpenChange(next) }}><DialogContent aria-describedby={undefined} className={styles.dialog} data-scan-fullscreen={fullscreen || undefined} data-offer={pro ? 'pro' : 'report'}>
    <motion.div className={styles.art} layout={fullscreen ? "position" : undefined} layoutId={fullscreen ? "analysis-portrait" : undefined}><ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} fit="cover" showLabel={false} /><ProgressiveBlur className={styles.artBlur} blurLayers={6} intensity={10} /></motion.div>
    <div className={styles.content}><div className={styles.scroll}>
      {fullscreen && modes}
      <header><DialogTitle className={styles.title}>{fullscreen ? 'Unlock your full analysis' : t('membership.unlock')}</DialogTitle>
        {fullscreen && <p className={styles.subtitle}>Get your science-based face evaluation and achieve your true potential in 60 days.</p>}
      </header>
      {!fullscreen && modes}
      {showReturnOffer && subscriptions && monthly != null && offerKey && <section className={styles.returnOffer} aria-label="Return offer">
        <small>First-month offer</small>
        <strong>Finish your evaluation with 10% off Pro</strong>
        <p>{formatStripePrice(Math.round(monthly * .9), subscriptions.currency, i18n.language)} for your first month, then {formatStripePrice(monthly, subscriptions.currency, i18n.language)}/month. Renews until canceled.</p>
        <button type="button" className={styles.cta} disabled={loading || creatorStatus === 'applying'} onClick={() => {
          track('plan_selected', { plan: 'mobile_subscription_monthly', offering: 'stripe_return' })
          onCheckout('mobile_subscription_monthly', { currency: subscriptions.currency, unitAmount: monthly, returnOfferSessionId: offerKey })
        }}>Finish with 10% off <ArrowRight size={16} /></button>
        <button type="button" disabled={loading} onClick={() => { setDismissedOffer(offerKey); track('paywall_offer_dismissed', { offering: 'stripe_return' }) }}>Back to plans</button>
      </section>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={pro ? 'pro' : 'report'} initial={{ opacity: 0, y: reduce ? 0 : 5, filter: reduce ? 'none' : 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }} className={`${styles.offer} ${pro ? styles.pro : ''}`}>
        {pro ? <><MembershipValue scan={fullscreen} />{!fullscreen && <AppAccessNote />}<MembershipPlans prices={subscriptions} selected={selectedPlan} onSelect={selectPlan} minimumCredits={imageCount} disabled={loading} /></> : <><div className={styles.reportOffer}><span>{imageCount > 1 ? t('membership.threeReports') : t('membership.oneReport')}</span><strong>{report ? formatStripePrice(report.amount, report.currency, i18n.language) : '—'}<small>{t('membership.once')}</small></strong><p>{t('membership.reportDetail')}</p></div><p className={styles.reportNote}>{imageCount > 2 ? t('membership.batch') : t('membership.proDifference')}</p></>}
      </motion.div></AnimatePresence>
      {priceError ? <p role="alert" className={styles.error}>{t('plan.unavailable')} <button type="button" onClick={retry}>{t('plan.retry')}</button></p> : null}
      {error ? <p role="alert" className={styles.error}>{error}{!loading ? <button type="button" onClick={retry}>{t('plan.retry')}</button> : null}</p> : null}
      </div><footer className={styles.footer}>{pro ? <MembershipTerms prices={subscriptions} selected={selectedPlan} compactOnMobile /> : <p className={styles.oneTime}>{t('membership.reportDetail')}</p>}<button className={styles.cta} disabled={loading || creatorStatus === 'applying' || !price} type="button" onClick={() => { if (!price) return; track('onboarding_interaction', { action: 'checkout_tapped', product: pro ? selectedPlan : reportProduct }); if (fullscreen) feedback(); onCheckout(pro ? selectedPlan : reportProduct, price) }}>{loading ? <><Loader2 size={17} className="animate-spin" />{t('membership.opening')}</> : <>{pro ? t('membership.startPro') : t('membership.unlockReport')}{price ? <span>{formatStripePrice(price.unitAmount, price.currency, i18n.language)}</span> : null}<ArrowRight size={17} /></>}</button>
      <button type="button" className={styles.creatorToggle} aria-expanded={creatorOpen} onClick={() => {
        if (!creatorOpen) track('attribution_diagnostic', { action: 'creator_code_opened' })
        setCreatorOpen(!creatorOpen)
      }}><Tag size={14} /> {t('paywall.creator')}</button>
      {creatorOpen && <div className={styles.creatorForm}>
        <label><span className="sr-only">Creator code</span><input value={creatorCode} placeholder="Enter creator code" autoCapitalize="none" maxLength={200} disabled={creatorStatus === 'applying' || loading} onChange={event => { setCreatorCode(event.target.value); setCreatorStatus('idle') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void applyCreatorCode() } }} /></label>
        <button type="button" disabled={!creatorCode.trim() || creatorStatus === 'applying' || loading} onClick={() => void applyCreatorCode()}>{creatorStatus === 'applying' ? 'Applying…' : 'Apply'}</button>
        {creatorStatus === 'applied' && <p role="status">Creator code applied. Eligible first-time Pro subscribers receive 10% off their first month on the monthly plan.</p>}
        {creatorStatus === 'failed' && <p role="alert">Couldn’t apply that code. Check it and try again.</p>}
      </div>}
      <CheckoutLegal /></footer>
    </div>
  </DialogContent></Dialog>
}
