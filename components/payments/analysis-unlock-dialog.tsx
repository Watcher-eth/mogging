import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import { trackWebEvent } from '@/lib/analytics/client'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatStripePrice, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { AppAccessNote, CheckoutLegal, MembershipPlans, MembershipTerms, MembershipValue, type ReportPrice, type CheckoutQuote } from './membership-offer'
import dynamic from 'next/dynamic'
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))
import styles from './analysis-unlock-dialog.module.css'

export type AnalysisPurchase = ReportPrice['product'] | SubscriptionProduct
export function AnalysisUnlockDialog({ imageSrc, landmarks, imageCount, open, onOpenChange, onCheckout, loading, error }: {
  imageSrc: string | null; landmarks: FaceLandmarksPayload | null; imageCount: number; open: boolean; onOpenChange: (open: boolean) => void;
  onCheckout: (product: AnalysisPurchase, quote: CheckoutQuote) => void; loading: boolean; error: string | null
}) {
  const { t, i18n } = useTranslation()
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<'pro' | 'report'>('pro')
  const [selected, setSelected] = useState<SubscriptionProduct>('mobile_subscription_monthly')
  const selectedPlan = selected === 'mobile_subscription_weekly' && imageCount > 1 ? 'mobile_subscription_monthly' : selected
  const reportProduct = imageCount > 1 ? 'evaluation_pack_3' : 'evaluation'
  const { data: subscriptions, error: subscriptionError, mutate: retrySubscriptions } = useSWR<SubscriptionPrices>(open ? '/api/payments/subscription-prices' : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const { data: reportQuote, error: reportError, mutate: retryReport } = useSWR<ReportPrice>(open ? `/api/payments/report-price?product=${reportProduct}` : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const report = reportQuote?.product === reportProduct ? reportQuote : undefined
  const pro = mode === 'pro' && imageCount <= 2
  const price = pro ? subscriptions && { currency: subscriptions.currency, unitAmount: subscriptions.amounts[selectedPlan] } : report && { currency: report.currency, unitAmount: report.amount }
  const priceError = pro ? subscriptionError : reportError
  const retry = () => { void (pro ? retrySubscriptions() : retryReport()) }
  const selectMode = (next: 'pro' | 'report') => { setMode(next); trackWebEvent('plan_selected', { surface: 'web_analysis', plan: next === 'pro' ? selectedPlan : reportProduct, paywall_version: '2' }) }
  const selectPlan = (plan: SubscriptionProduct) => { setSelected(plan); trackWebEvent('plan_selected', { surface: 'web_analysis', plan, paywall_version: '2' }) }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined} className={styles.dialog} data-offer={pro ? 'pro' : 'report'}>
    <div className={styles.art}><ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} fit="cover" showLabel={false} /><ProgressiveBlur className={styles.artBlur} blurLayers={6} intensity={10} /></div>
    <div className={styles.content}><div className={styles.scroll}>
      <header><DialogTitle className={styles.title}>{t('membership.unlock')}</DialogTitle></header>
      {imageCount <= 2 ? <div className={styles.modes} role="group" aria-label={t('membership.purchaseType')}>{(['pro', 'report'] as const).map(item => <button key={item} type="button" disabled={loading} aria-pressed={pro === (item === 'pro')} onClick={() => selectMode(item)}>{item === 'pro' ? t('membership.pro') : t('membership.reportOnly')}</button>)}</div> : null}
      <AnimatePresence mode="wait" initial={false}><motion.div key={pro ? 'pro' : 'report'} initial={{ opacity: 0, y: reduce ? 0 : 5, filter: reduce ? 'none' : 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }} className={`${styles.offer} ${pro ? styles.pro : ''}`}>
        {pro ? <><MembershipValue /><AppAccessNote /><MembershipPlans prices={subscriptions} selected={selectedPlan} onSelect={selectPlan} minimumCredits={imageCount} disabled={loading} /></> : <><div className={styles.reportOffer}><span>{imageCount > 1 ? t('membership.threeReports') : t('membership.oneReport')}</span><strong>{report ? formatStripePrice(report.amount, report.currency, i18n.language) : '—'}<small>{t('membership.once')}</small></strong><p>{t('membership.reportDetail')}</p></div><p className={styles.reportNote}>{imageCount > 2 ? t('membership.batch') : t('membership.proDifference')}</p></>}
      </motion.div></AnimatePresence>
      {priceError ? <p role="alert" className={styles.error}>{t('plan.unavailable')} <button type="button" onClick={retry}>{t('plan.retry')}</button></p> : null}
      {error ? <p role="alert" className={styles.error}>{error}{!loading ? <button type="button" onClick={retry}>{t('plan.retry')}</button> : null}</p> : null}
      </div><footer className={styles.footer}>{pro ? <MembershipTerms prices={subscriptions} selected={selectedPlan} compactOnMobile /> : <p className={styles.oneTime}>{t('membership.reportDetail')}</p>}<button className={styles.cta} disabled={loading || !price} type="button" onClick={() => price && onCheckout(pro ? selectedPlan : reportProduct, price)}>{loading ? <><Loader2 size={17} className="animate-spin" />{t('membership.opening')}</> : <>{pro ? t('membership.startPro') : t('membership.unlockReport')}{price ? <span>{formatStripePrice(price.unitAmount, price.currency, i18n.language)}</span> : null}<ArrowRight size={17} /></>}</button>
      <CheckoutLegal /></footer>
    </div>
  </DialogContent></Dialog>
}
