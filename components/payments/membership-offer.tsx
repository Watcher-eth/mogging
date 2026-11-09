import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useId } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Bell, BookOpen, Check, ChartNoAxesCombined, ScanFace, ListChecks, ShieldCheck, ScanLine, View } from 'lucide-react'
import { formatStripePrice, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { cn } from '@/lib/utils'
import { webAnalysisCheckoutLimit, webAnalysisPlans, webAnalysisProducts, type WebAnalysisProduct } from '@/lib/payments/web-analysis-plans'
import styles from './membership-offer.module.css'
const EvaluationPreview = dynamic(() => import('@/components/landing/mobile-preview').then(module => module.EvaluationPreview), { ssr: false })

export type ReportPrice = { product: 'evaluation' | 'evaluation_pack_3'; currency: string; amount: number }
export type CheckoutQuote = { currency: string; unitAmount: number; returnOfferSessionId?: string; starterIntro?: true; creatorDiscount?: true }
export type WebAnalysisPrices = { currency: string; amounts: Record<WebAnalysisProduct, number>; starterIntro?: number }
export const membershipPlans = [
  { id: 'mobile_subscription_weekly', label: 'plan.weekly', cadence: 'plan.weekCadence', credits: 1 },
  { id: 'mobile_subscription_monthly', label: 'plan.monthly', cadence: 'plan.monthCadence', credits: 2 },
  { id: 'mobile_subscription_yearly', label: 'plan.yearly', cadence: 'plan.yearCadence', credits: 2 },
] as const

export function MembershipValue({ scan = false }: { scan?: boolean }) {
  const { t } = useTranslation()
  return <div className={styles.benefits}>
    {[
      { Icon: ScanFace, title: t('membership.evaluation'), detail: t('membership.evaluationDetail') },
      { Icon: ListChecks, title: t('membership.protocol'), detail: t('membership.protocolDetail') },
      { Icon: ChartNoAxesCombined, title: scan ? 'Track progress over time' : t('membership.progress'), detail: t('membership.progressDetail') },
      ...(scan ? [{ Icon: Bell, title: 'Reminders to stay on track', detail: '' }] : []),
    ].map(({ Icon, title, detail }) => <div className={styles.benefit} key={title}><Icon size={19} strokeWidth={1.6} aria-hidden="true" /><div><strong>{title}</strong><p>{detail}</p></div></div>)}
  </div>
}

export function AppAccessNote() {
  const { t } = useTranslation()
  return <div className={styles.appNote}><div className={styles.miniPhone} aria-hidden="true" inert><EvaluationPreview playback="still" /></div><p><strong>{t('membership.oneAccount')}</strong><span>{t('membership.sameAccount')}</span></p></div>
}

export function MembershipPlans({ prices, selected, onSelect, minimumCredits = 1, disabled = false }: {
  prices?: SubscriptionPrices; selected: SubscriptionProduct; onSelect: (product: SubscriptionProduct) => void; minimumCredits?: number; disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const reduce = useReducedMotion()
  return <div className={styles.plans} role="group" aria-label={t('membership.choosePlan')}>
    {membershipPlans.map(plan => {
      const active = selected === plan.id
      const monthlyTotal = prices ? prices.amounts.mobile_subscription_monthly * 12 : 0
      const saving = plan.id === 'mobile_subscription_yearly' && prices && monthlyTotal > 0 ? Math.floor((1 - prices.amounts[plan.id] / monthlyTotal) * 100) : 0
      const unavailable = disabled || plan.credits < minimumCredits
      return <button key={plan.id} type="button" aria-pressed={active} disabled={unavailable} onClick={() => onSelect(plan.id)} className={cn(styles.plan, active && styles.selected)}>
        {active ? <motion.span className={styles.selection} layoutId={`${id}-plan`} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} /> : null}
        <span className={styles.planTop}><strong>{t(plan.label)}</strong><span className={styles.radio}>{active ? <Check size={10} strokeWidth={3} /> : null}</span></span>
        <span className={styles.planPrice}>{prices ? formatStripePrice(prices.amounts[plan.id], prices.currency, i18n.language) : <span className={styles.priceSkeleton} />}</span>
        <span className={styles.cadence}>{t(plan.cadence)}</span>
        <span className={styles.planFoot}>{saving > 0 ? t('membership.annualSavings', { percent: saving }) : plan.id === 'mobile_subscription_yearly' ? t('membership.annual') : plan.id === 'mobile_subscription_monthly' ? t('membership.flexible') : t('membership.weekly')}</span>
      </button>
    })}
  </div>
}

export function MembershipTerms({ prices, selected, compactOnMobile, showRenewal = true }: { prices?: SubscriptionPrices; selected: SubscriptionProduct; compactOnMobile?: boolean; showRenewal?: boolean }) {
  const { t, i18n } = useTranslation()
  const reduce = useReducedMotion()
  const plan = membershipPlans.find(plan => plan.id === selected)!
  return <div className={cn(styles.terms, compactOnMobile && styles.compactTerms)} aria-live="polite" aria-atomic="true">
    <AnimatePresence mode="wait" initial={false}><motion.div key={selected} initial={{ opacity: 0, y: reduce ? 0 : 4, filter: reduce ? 'none' : 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .16 }}>
      <strong>{selected === 'mobile_subscription_weekly' ? t('membership.weeklyCredits') : t('membership.monthlyCredits')}</strong>
      {showRenewal && <span>{prices ? `${formatStripePrice(prices.amounts[selected], prices.currency, i18n.language)} ${t(plan.cadence)}. ` : ''}{t('membership.renewal')}</span>}
    </motion.div></AnimatePresence>
  </div>
}

const webPlanNames: Record<WebAnalysisProduct, string> = {
  web_basic_weekly: 'Basic', web_basic_monthly: 'Starter', web_pro_monthly: 'Pro',
}

export function WebAnalysisPlanOptions({ prices, selected, onSelect, imageCount, disabled }: {
  prices?: WebAnalysisPrices; selected: WebAnalysisProduct; onSelect: (plan: WebAnalysisProduct) => void; imageCount: number; disabled: boolean
}) {
  const { i18n } = useTranslation()
  const id = useId()
  const reduce = useReducedMotion()
  return <>
    <WebAnalysisPlanBenefits product={selected} />
    <div className={cn(styles.plans, styles.webPlans)} role="group" aria-label="Analysis plans">
      {webAnalysisProducts.map(product => {
        const plan = webAnalysisPlans[product]
        const active = product === selected
        const weekly = plan.interval === 'week'
        const starter = product === 'web_basic_monthly'
        const baseline = starter && prices ? prices.amounts.web_basic_weekly * plan.scans : 0
        const savings = prices && baseline > 0 ? Math.round(100 * (1 - prices.amounts[product] / baseline)) : 0
        const badge = weekly ? 'Flexible' : starter ? savings > 0 ? `Save ${savings}%` : null : 'Popular'
        const scanCount = weekly ? '1 scan per week' : `${plan.scans} scans per month`
        return <button key={product} type="button" aria-pressed={active} disabled={disabled || webAnalysisCheckoutLimit(product) < imageCount}
          onClick={() => onSelect(product)} className={cn(styles.plan, active && styles.selected)}>
          {active && <motion.span className={styles.selection} layoutId={`${id}-web-plan`} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} />}
          {badge && <span className={styles.planBadge} data-tone={starter ? 'savings' : weekly ? 'flexible' : 'popular'}>{badge}</span>}
          <span className={styles.planTop}><strong>{webPlanNames[product]}</strong></span>
          <span className={styles.planFoot}>{scanCount}</span>
          <span className={styles.planPrice}>{prices ? formatStripePrice(prices.amounts[product], prices.currency, i18n.language) : <span className={styles.priceSkeleton} />}</span>
          <span className={styles.cadence}>/{plan.interval}</span>
          {prices && savings > 0 && <span className={styles.planComparison}>
            vs {formatStripePrice(baseline, prices.currency, i18n.language)} for {plan.scans} Basic weeks
          </span>}
        </button>
      })}
    </div>
  </>
}

export function WebAnalysisPlanBenefits({ product }: { product: WebAnalysisProduct }) {
  const reduce = useReducedMotion()
  const plan = webAnalysisPlans[product]
  const benefits = [
    { Icon: ScanFace, title: plan.interval === 'week' ? '1 face scan per week' : `${plan.scans} face scans per month` },
    { Icon: ScanLine, title: 'More than 120 facial landmarks anchored' },
    { Icon: View, title: 'Comprehensive front and side face map' },
    { Icon: BookOpen, title: 'Original Looksmaxxing Courses' },
    ...(plan.tier === 'pro' ? [
      { Icon: ListChecks, title: 'Personalized Protocol' },
      { Icon: ChartNoAxesCombined, title: 'Progress Tracking' },
    ] : [{ Icon: ShieldCheck, title: 'Private analysis' }]),
  ]
  return <motion.ul layout="position" className={styles.webBenefits} aria-live="polite">
    <AnimatePresence initial={false}>
      {benefits.map(({ Icon, title }, index) => <motion.li key={index} layout="position"
        initial={{ opacity: 0, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }}>
        <Icon size={17} strokeWidth={1.65} aria-hidden="true" /><span>{reduce || index !== 0 ? title : <TextMorph>{title}</TextMorph>}</span>
      </motion.li>)}
    </AnimatePresence>
  </motion.ul>
}

export function CheckoutLegal() {
  const { t } = useTranslation()
  return <div className={styles.legal}><span><ShieldCheck size={13} aria-hidden="true" />{t('membership.secure')}</span><span><Link href="/tos">{t('footer.terms', { defaultValue: 'Terms' })}</Link><span>·</span><Link href="/privacy">{t('footer.privacy', { defaultValue: 'Privacy' })}</Link></span></div>
}

export function AppContinueLink() {
  const { t } = useTranslation()
  return <a href="https://apps.apple.com/us/app/mogging-face-rating/id6771414050" className={styles.appLink}>{t('membership.app')}<ArrowUpRight size={13} aria-hidden="true" /></a>
}
