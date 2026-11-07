import { webJourneyContext } from '@/lib/analytics/web-journey'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'
import { rememberStripeAttempt } from '@/lib/client/stripe-attempt'
import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { Drawer } from 'vaul'
import { useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { ensureAnalysisWebInstallId } from '@/lib/client/analysis-install'
import { formatStripePrice } from '@/lib/payments/subscription-prices'
import type { ReportPrice } from '@/components/payments/membership-offer'

export type ScanAccess = { analytics?: { flow_id?: string; attempt_id?: string; flow_version?: string }; entitlements: { evaluationCredits: number } }
export const scanBalanceKey = (userId: string) => ['/api/payments/entitlements', 'scan-balance', userId] as const

const packs = [
  { product: 'evaluation', title: 'Single scan', sampleAmount: 599 },
  { product: 'evaluation_pack_3', title: 'Three scans', sampleAmount: 1499 },
] as const
const benefits = ['Full facial breakdown', 'Progress you can compare', 'Saved to your account']

function useScanQuote(product: ReportPrice['product'], enabled: boolean) {
  return useSWR<ReportPrice>(enabled ? `/api/payments/report-price?product=${product}` : null, apiGet, { shouldRetryOnError: false })
}

type ScanTab = 'evaluation' | 'progress'

export function ScanCreditSheet({ open, onOpenChange, tab, userId, preview, confirming, confirmationError, onRetry, onStart, onSignIn }: {
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
}) {
  const access = useSWR<ScanAccess>(open && !preview ? scanBalanceKey(userId) : null, ([url]) => apiGet<ScanAccess>(url), { shouldRetryOnError: false })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const credits = preview ? 1 : access.error ? undefined : access.data?.entitlements.evaluationCredits

  const [selected, setSelected] = useState<ReportPrice['product']>('evaluation_pack_3')
  const { i18n } = useTranslation()
  const single = useScanQuote('evaluation', open && !preview)
  const bundle = useScanQuote('evaluation_pack_3', open && !preview)
  const quotes = [single, bundle]
  const options = packs.map(({ product, title, sampleAmount }, index) => ({
    product, title, quote: preview ? { product, currency: 'usd', amount: sampleAmount } : quotes[index].data,
  }))
  const [singleQuote, bundleQuote] = options.map(option => option.quote)
  const savings = singleQuote && bundleQuote && singleQuote.amount > 0 && singleQuote.currency === bundleQuote.currency
    ? Math.max(0, Math.round((1 - bundleQuote.amount / (3 * singleQuote.amount)) * 100))
    : 0
  const quote = options.find(option => option.product === selected)?.quote
  const busy = pending || confirming
  const blocked = busy || Boolean(confirmationError) || (access.error instanceof ApiClientError && access.error.status === 401)
  const formatted = (price: ReportPrice) => formatStripePrice(price.amount, price.currency, i18n.language)

  async function buy(quote: ReportPrice) {
    if (pending || confirming || confirmationError) return
    if (preview) {
      setError('Sample preview. No payment will be taken.')
      return
    }
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
      setPending(false)
      trackWebEvent('purchase_failed', { ...purchase, purchase_stage: 'checkout_create', reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed' })
      if (caught instanceof ApiClientError && caught.status === 401) {
        onSignIn()
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not open checkout. Try again.')
    }
  }

  return <Drawer.Root open={open} dismissible={!busy} repositionInputs={false} snapPoints={[0.68, 0.9]} fadeFromIndex={0}
    onOpenChange={next => { setError(null); onOpenChange(next) }}>
    <Drawer.Portal>
      <Drawer.Overlay className="scan-progress-backdrop" />
      <Drawer.Content className="scan-credit-sheet">
        <Drawer.Handle className="scan-credit-handle" />
        <div className="scan-credit-body">
          <header>
            <Drawer.Close className="scan-credit-close" aria-label="Close upgrades" disabled={busy}><X size={17} /></Drawer.Close>
            <img className="scan-credit-icon" src="/scan/icon-192.png" alt="Mogging" width={76} height={76} />
            <Drawer.Title>Your next level starts here.</Drawer.Title>
            <Drawer.Description>See what’s changed. Know what’s next.</Drawer.Description>
          </header>
          {credits !== Number.MAX_SAFE_INTEGER && <>
            <ul className="scan-credit-benefits">{benefits.map(benefit => <li key={benefit}><Check size={15} aria-hidden="true" />{benefit}</li>)}</ul>
            <fieldset className="scan-credit-packs" disabled={blocked}>
              <legend className="sr-only">Choose a scan pack</legend>
              {options.map(option => <label key={option.product}>
                <input type="radio" name="scan-credit-pack" value={option.product} checked={selected === option.product} onChange={() => {
                  setSelected(option.product)
                  if (!preview) trackWebEvent('plan_selected', { surface: 'scan_app_credits', provider: 'stripe', tab, product: option.product })
                }} />
                {option.product === 'evaluation_pack_3' && savings > 0 && <span className="scan-credit-saving">Save {savings}%</span>}
                <b>{option.title}</b>
                <strong>{option.quote ? formatted(option.quote) : '—'}</strong>
                <small>One-time payment</small>
              </label>)}
            </fieldset>
          </>}
          {access.error && <p role="alert">Couldn’t load your balance. <button type="button" onClick={() => {
            if (access.error instanceof ApiClientError && access.error.status === 401) onSignIn()
            else void access.mutate()
          }}>{access.error instanceof ApiClientError && access.error.status === 401 ? 'Sign in again' : 'Retry'}</button></p>}
          {(single.error || bundle.error) && <p role="alert">Couldn’t load all prices. <button type="button" onClick={() => { void single.mutate(); void bundle.mutate() }}>Retry prices</button></p>}
          {confirmationError && <p role="alert">{confirmationError} <button type="button" onClick={onRetry}>Retry confirmation</button></p>}
          {error && <p role="status">{error}</p>}
          {credits !== Number.MAX_SAFE_INTEGER && <button type="button" className="scan-home-primary" disabled={blocked || !quote} onClick={() => { if (quote) void buy(quote) }}>
            {confirming ? 'Confirming purchase…' : pending ? 'Opening checkout…' : quote ? `Get ${selected === 'evaluation' ? '1 scan' : '3 scans'} · ${formatted(quote)}` : 'Loading prices…'}
          </button>}
          {Boolean(credits && credits > 0) && <button type="button" className="scan-credit-use" disabled={busy || access.isValidating} onClick={onStart}>
            Use a scan · {credits === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `${credits} available`}
          </button>}
          <footer><Link href="/tos">Terms</Link><Link href="/privacy">Privacy</Link></footer>
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
}
