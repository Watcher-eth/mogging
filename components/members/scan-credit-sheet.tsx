import { webJourneyContext } from '@/lib/analytics/web-journey'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'
import { rememberStripeAttempt } from '@/lib/client/stripe-attempt'
import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { Drawer } from 'vaul'
import { useRef, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { ensureAnalysisWebInstallId } from '@/lib/client/analysis-install'
import { formatStripePrice } from '@/lib/payments/subscription-prices'
import { TextMorph } from 'torph/react'
import type { ReportPrice } from '@/components/payments/membership-offer'

export type ScanAccess = { analytics?: { flow_id?: string; attempt_id?: string; flow_version?: string }; entitlements: { evaluationCredits: number; subscription?: { active: boolean; tier?: 'basic' | 'pro' } } }
export const scanBalanceKey = (userId: string) => ['/api/payments/entitlements', 'scan-balance', userId] as const

const benefits = ['Full facial breakdown', 'Progress you can compare', 'Saved to your account']

type ScanTab = 'evaluation' | 'progress'
const offers = [
  { product: 'evaluation', title: 'Single scan', credits: 1, sample: 499 },
  { product: 'evaluation_pack_3', title: '3-scan pack', credits: 3, sample: 999 },
] as const

export function ScanCreditSheet({ open, onOpenChange, tab, userId, preview, confirming, confirmationError, onRetry, onStart, onSignIn, onInvite }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: ScanTab
  userId: string
  preview: boolean
  confirming: boolean
  confirmationError: string | null
  onRetry: () => void
  onStart: () => void
  onSignIn: () => void
  onInvite: () => void
}) {
  const access = useSWR<ScanAccess>(open && !preview ? scanBalanceKey(userId) : null, ([url]) => apiGet<ScanAccess>(url), { shouldRetryOnError: false })
  const [pending, setPending] = useState(false)
  const purchaseLock = useRef(false)
  const [selected, setSelected] = useState<ReportPrice['product']>('evaluation_pack_3')
  const [error, setError] = useState<string | null>(null)
  const credits = preview ? 1 : access.error ? undefined : access.data?.entitlements.evaluationCredits

  const { i18n } = useTranslation()
  const priceKey = (product: ReportPrice['product']) => open && !preview ? `/api/payments/report-price?product=${product}` : null
  const single = useSWR<ReportPrice>(priceKey('evaluation'), apiGet, { shouldRetryOnError: false })
  const pack = useSWR<ReportPrice>(priceKey('evaluation_pack_3'), apiGet, { shouldRetryOnError: false })
  const prices = offers.map((offer, index): ReportPrice | undefined => preview
    ? { product: offer.product, currency: 'usd', amount: offer.sample } : [single.data, pack.data][index])
  const [singlePrice, packPrice] = prices
  const savings = singlePrice && packPrice && singlePrice.amount > 0 && singlePrice.currency === packPrice.currency
    ? Math.max(0, Math.round((1 - packPrice.amount / (singlePrice.amount * 3)) * 100)) : 0
  const quote = selected === 'evaluation' ? singlePrice : packPrice
  const unavailable = Boolean((selected === 'evaluation' ? single : pack).error)
  const busy = pending || confirming
  const blocked = busy || Boolean(confirmationError) || (access.error instanceof ApiClientError && access.error.status === 401)
  const formatted = (price: ReportPrice) => formatStripePrice(price.amount, price.currency, i18n.language)

  async function buy(quote: ReportPrice) {
    if (purchaseLock.current || confirming || confirmationError) return
    if (preview) {
      setError('Sample preview. No payment will be taken.')
      return
    }
    purchaseLock.current = true
    setPending(true)
    setError(null)
    const attemptId = crypto.randomUUID()
    const journey = webJourneyContext()
    const purchase = { ...journey, surface: 'scan_app_credits', provider: 'stripe', tab, product: quote.product, attempt_id: attemptId }
    trackWebEvent('purchase_started', purchase)
    try {
      const checkout = await apiPost<{ url: string; sessionId: string }>('/api/payments/web-checkout', {
        product: quote.product, attemptId, flowId: journey.flow_id, flowVersion: journey.flow_version, entryMode: journey.entry_mode,
        currency: quote.currency,
        unitAmount: quote.amount,
        mobileInstallId: ensureAnalysisWebInstallId(),
        returnTo: `scan-app-${tab}`,
        source: 'scan_app_credits',
      })
      rememberStripeAttempt('scan_app_credits', { attempt_id: attemptId, flow_id: journey.flow_id, product: quote.product, sessionId: checkout.sessionId })
      trackWebEvent('purchase_stage_changed', { ...purchase, purchase_stage: 'checkout_redirect' })
      void flushWebAnalytics()
      window.location.assign(checkout.url)
    } catch (caught) {
      purchaseLock.current = false
      setPending(false)
      trackWebEvent('purchase_failed', { ...purchase, purchase_stage: 'checkout_create', reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed' })
      if (caught instanceof ApiClientError && caught.status === 401) {
        onSignIn()
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not open checkout. Try again.')
    }
  }

  return <Drawer.Root open={open} dismissible={!busy} repositionInputs={false}
    onOpenChange={next => { setError(null); onOpenChange(next) }}>
    <Drawer.Portal>
      <Drawer.Overlay className="scan-progress-backdrop scan-credit-backdrop" />
      <Drawer.Content className="scan-credit-sheet">
        <Drawer.Handle className="scan-credit-handle" />
        <div className="scan-credit-body">
          <header>
            <button type="button" className="scan-credit-close" aria-label="Close upgrades" disabled={busy}
              onClick={() => { setError(null); onOpenChange(false) }}><X size={17} /></button>
            <img className="scan-credit-icon" src="/scan/icon-192.png" alt="Mogging" width={76} height={76} />
            <div><Drawer.Title>Your next level starts here.</Drawer.Title>
              <Drawer.Description>Get a new private face scan.</Drawer.Description></div>
          </header>
          {credits !== Number.MAX_SAFE_INTEGER && <>
            <div className="scan-credit-options">
              <ul className="scan-credit-benefits">{benefits.map(benefit => <li key={benefit}><Check size={15} aria-hidden="true" />{benefit}</li>)}</ul>
              <fieldset className="scan-credit-tiers">
                <legend className="sr-only">Scan packs</legend>
                {offers.map((offer, index) => {
                  const price = prices[index]
                  return <label key={offer.product} data-selected={selected === offer.product || undefined}>
                    <input className="sr-only" type="radio" name="scan-pack" checked={selected === offer.product} disabled={busy}
                      onChange={() => {
                        setSelected(offer.product)
                        setError(null)
                        if (!preview) trackWebEvent('plan_selected', { surface: 'scan_app_credits', product: offer.product, tab })
                      }} />
                    {index === 1 && savings > 0 && <span className="scan-credit-savings">Save {savings}%</span>}
                    <b>{offer.title}</b><strong>{price ? formatted(price) : (index === 0 ? single : pack).error ? '—' : '…'}</strong>
                    <small>One-time payment</small>
                  </label>
                })}
              </fieldset>
            </div>
            {(single.error || pack.error) && <p role="alert">Couldn’t load all scan prices. <button type="button" onClick={() => { void single.mutate(); void pack.mutate() }}>Retry prices</button></p>}
          </>}
          {access.error && <p role="alert">Couldn’t load your balance. <button type="button" onClick={() => {
            if (access.error instanceof ApiClientError && access.error.status === 401) onSignIn()
            else void access.mutate()
          }}>{access.error instanceof ApiClientError && access.error.status === 401 ? 'Sign in again' : 'Retry'}</button></p>}
          {confirmationError && <p role="alert">{confirmationError} <button type="button" onClick={onRetry}>Retry confirmation</button></p>}
          {error && <p role="status">{error}</p>}
          {credits !== Number.MAX_SAFE_INTEGER && <button type="button" className="scan-home-primary" disabled={blocked || !quote} onClick={() => { if (quote) void buy(quote) }}>
            <TextMorph>{confirming ? 'Confirming purchase…' : pending ? 'Opening checkout…' : quote
              ? `Get ${selected === 'evaluation' ? '1 scan' : '3 scans'} · ${formatted(quote)}`
              : unavailable ? 'Price unavailable' : 'Loading price…'}</TextMorph>
          </button>}
          {Boolean(credits && credits > 0) && <button type="button" className="scan-credit-use" disabled={busy || access.isValidating} onClick={onStart}>
            Use a scan · {credits === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `${credits} available`}
          </button>}
          <button type="button" className="scan-credit-use" disabled={busy} onClick={onInvite}>Invite 3 friends · Get a free scan</button>
          <footer>
            {!preview && <button type="button" disabled={busy || access.isValidating} onClick={() => {
              void access.mutate().then(balance => { if (balance) setError('Your scan balance is up to date.') }).catch(() => {})
            }}>Refresh purchases</button>}
            <Link href="/tos">Terms</Link><Link href="/privacy">Privacy</Link>
          </footer>
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
}
