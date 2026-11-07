import { restoreWebJourney } from '@/lib/analytics/web-journey'
import { trackWebEvent } from '@/lib/analytics/client'
import { takeStripeAttempt, readStripeAttempt, clearStripeAttempt, stripeAttemptProperties } from '@/lib/client/stripe-attempt'
import { MobileScoreGauge } from '@/components/members/mobile-score-gauge'
import sampleEntries from '@/lib/analysis-v2/sample-entries.json'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { LoginDialog } from '@/components/app/login-dialog'
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { useSession } from 'next-auth/react'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { ScanCreditSheet, scanBalanceKey, type ScanAccess } from '@/components/members/scan-credit-sheet'
import useSWRInfinite from 'swr/infinite'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import { ArrowUpRight, BookOpen, ChartNoAxesCombined, FileText, LayoutGrid, Plus, SlidersHorizontal } from 'lucide-react'
import { ScanPwaHead } from '@/components/analysis/mobile-scan-pwa'
import { DesktopMemberPreview } from '@/components/landing/desktop-member-preview'
import ProtocolPage from '@/components/members/protocol'
import ProgressPage from '@/components/members/progress'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { getAuthSession } from '@/lib/auth/session'
import { memberPage } from '@/lib/users/member-pages'

const ScanCourses = dynamic(() => import('@/components/members/scan-courses'))

const tabs = [
  { id: 'courses', title: 'Courses', Icon: BookOpen },
  { id: 'progress', title: 'Progress', Icon: ChartNoAxesCombined },
  { id: 'protocol', title: 'Protocol', Icon: LayoutGrid },
  { id: 'evaluation', title: 'Evaluation', Icon: FileText },
] as const
type Tab = typeof tabs[number]['id']
type Props = {
  tab: Tab; preview: boolean; userId: string; signedIn: boolean; now: number;
  protocol?: ComponentProps<typeof ProtocolPage>; progress?: ComponentProps<typeof ProgressPage>;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { req, res, query } = context
  res.setHeader('Cache-Control', 'private, no-store')
  const tab = tabs.find(item => item.id === query.tab)?.id ?? 'evaluation'
  const preview = process.env.NODE_ENV === 'development' && query.preview === '1'
  const session = preview ? null : await getAuthSession(req, res)
  const userId = session?.user?.id ?? ''
  const props: Props = { tab, preview, userId, signedIn: Boolean(userId), now: Date.now() }
  if (userId && tab === 'progress') {
    const result = await memberPage('progress')(context)
    if ('props' in result) props.progress = await result.props as Props['progress']
  }
  if (userId && tab === 'protocol') {
    const result = await memberPage('protocol')(context)
    if ('props' in result) props.protocol = await result.props as Props['protocol']
  }
  return { props }
}

export default function ScanHome({ tab, preview, userId, signedIn, now, progress, protocol }: Props) {
  const router = useRouter()
  const { status, data: session } = useSession()
  const { mutate } = useSWRConfig()
  const [creditOpen, setCreditOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [signInRequired, setSignInRequired] = useState(false)
  const attemptedCheckout = useRef<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [direction, setDirection] = useState(1)
  const href = (id: Tab) => `/app/home?tab=${id}${preview ? '&preview=1' : ''}`
  const current = tabs.findIndex(item => item.id === tab)
  const accountReady = signedIn && status !== 'unauthenticated' && !signInRequired
    && (status !== 'authenticated' || session?.user?.id === userId)
  const sessionId = router.query.scan_checkout === 'success' && typeof router.query.session_id === 'string'
    ? router.query.session_id : null
  const returnPath = `/app/home?tab=${tab}`
  useEffect(() => { if (!preview) trackWebEvent('screen_viewed', { screen: `web_app_${tab}`, tab, surface: 'scan_app' }) }, [preview, tab])

  const requestSignIn = useCallback(() => {
    setCreditOpen(false)
    setSignInRequired(true)
    setLoginOpen(true)
  }, [])

  const confirmPurchase = useCallback(async (id: string) => {
    setCreditOpen(true)
    setConfirming(true)
    setConfirmationError(null)
    try {
      const confirmed = await apiPost<ScanAccess>('/api/payments/confirm', { sessionId: id })
      const purchase = readStripeAttempt('scan_app_credits', id)
      const flowId = confirmed.analytics?.flow_id || purchase?.flow_id
      if (flowId) restoreWebJourney(flowId)
      trackWebEvent('purchase_activated', { surface: 'scan_app_credits', provider: 'stripe', ...stripeAttemptProperties(purchase), ...confirmed.analytics })
      await mutate(scanBalanceKey(userId), confirmed, { revalidate: false })
      await router.replace(returnPath, undefined, { shallow: true, scroll: false })
      clearStripeAttempt('scan_app_credits')
      toast.success('Your scan balance is ready.')
    } catch (caught) {
      trackWebEvent('purchase_activation_failed', { surface: 'scan_app_credits', provider: 'stripe', ...stripeAttemptProperties(readStripeAttempt('scan_app_credits', id)), purchase_stage: 'checkout_return', reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed' })
      if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403)) requestSignIn()
      else setConfirmationError('Couldn’t confirm your purchase yet.')
    } finally {
      setConfirming(false)
    }
  }, [mutate, requestSignIn, returnPath, router, userId])

  useEffect(() => {
    if (!router.isReady || !accountReady || preview) return
    if (sessionId && attemptedCheckout.current !== sessionId) {
      attemptedCheckout.current = sessionId
      void confirmPurchase(sessionId)
    } else if (router.query.scan_checkout === 'cancelled') {
      const purchase = takeStripeAttempt('scan_app_credits')
      if (purchase) trackWebEvent('purchase_cancelled', { surface: 'scan_app_credits', provider: 'stripe', reason_code: 'checkout_return', ...stripeAttemptProperties(purchase) })
      setCreditOpen(true)
      void router.replace(returnPath, undefined, { shallow: true, scroll: false })
    }
  }, [accountReady, confirmPurchase, preview, returnPath, router, sessionId])

  useEffect(() => {
    if (status === 'authenticated' && (!signedIn || session?.user?.id !== userId)) {
      void router.replace(router.asPath, undefined, { scroll: false })
    }
  }, [router, session?.user?.id, signedIn, status, userId])

  const openCredits = () => {
    if (!preview) trackWebEvent('paywall_viewed', { surface: 'scan_app_credits', paywall_id: 'scan_credit_sheet', provider: 'stripe', tab })
    setCreditOpen(true)
  }
  const startScan = () => {
    setCreditOpen(false)
    void router.push(`/analysis?start=1&from=app${preview ? '&preview=mobile&walkthrough=1' : ''}`)
  }
  return <div className="scan-home" data-dark={tab === 'progress' || undefined}>
    <ScanPwaHead mobile={!preview} />
    <Head><title>{tabs[current].title} | Mogging</title><meta name="robots" content="noindex, nofollow" /></Head>
    <MotionConfig reducedMotion="user">
      {!accountReady && !preview ? <section className="scan-home-auth">
        <img src="/scan/icon-192.png" width={72} height={72} alt="" /><h1>Welcome to Mogging</h1>
        <p>Sign in with the account you used at checkout to open your evaluations and access your plan.</p>
        <button type="button" className="scan-home-primary" onClick={() => setLoginOpen(true)}>Sign in</button>
        <LoginDialog audience="scan" open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={sessionId ? `${returnPath}&scan_checkout=success&session_id=${encodeURIComponent(sessionId)}` : href(tab)} />
      </section> : <>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={tab} className="scan-home-screen" custom={direction}
            variants={{ enter: (dir: number) => ({ opacity: 0, x: dir * 18 }), visible: { opacity: 1, x: 0 }, exit: (dir: number) => ({ opacity: 0, x: -dir * 12 }) }}
            initial="enter" animate="visible" exit="exit" transition={{ duration: .22, ease: [.23, 1, .32, 1] }}>
            {tab === 'evaluation' ? <Evaluations preview={preview} now={now} onNewScan={openCredits} /> : null}
            {tab === 'courses' ? <ScanCourses userId={userId || 'preview'} /> : null}
            {preview && (tab === 'progress' || tab === 'protocol') ? <DesktopMemberPreview key={tab} view={tab} now={now} mobile onNewScan={openCredits} /> : null}
            {progress && <ProgressPage {...progress} mobile onNewScan={openCredits} />}
            {protocol && <ProtocolPage {...protocol} mobile />}
            {!preview && ((tab === 'progress' && !progress) || (tab === 'protocol' && !protocol)) ? <section className="scan-home-auth"><h1>{tabs[current].title}</h1><p>Available with an active Mogging Pro subscription.</p><Link className="scan-home-primary" href="/analysis?start=1&from=app">Start an evaluation</Link></section> : null}
          </motion.div>
        </AnimatePresence>
        <nav className="scan-home-nav" aria-label="Mogging app"><LayoutGroup id="scan-home-tabs">
          {tabs.map(({ id, title, Icon }, index) => <Link key={id} href={href(id)} scroll={false} aria-current={tab === id ? 'page' : undefined} onClick={event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            if (id === tab) return
            setDirection(index > current ? 1 : -1)
            void router.push(href(id)).then(changed => { if (changed) window.scrollTo(0, 0) })
          }}>
            {tab === id && <motion.span layoutId="selected" className="scan-home-selected" transition={{ type: 'spring', damping: 28, stiffness: 330 }} />}
            <Icon size={20} /><span>{title}</span>
          </Link>)}
        </LayoutGroup></nav>
        <ScanCreditSheet open={creditOpen} onOpenChange={setCreditOpen}
          tab={tab === 'progress' ? 'progress' : 'evaluation'} userId={userId} preview={preview}
          confirming={confirming || Boolean(sessionId && !confirmationError)}
          confirmationError={confirmationError} onRetry={() => { if (sessionId) void confirmPurchase(sessionId) }}
          onStart={startScan} onSignIn={requestSignIn} />
      </>}
    </MotionConfig>
  </div>
}

type ReportPage = { processing?: boolean; reports: { photo: { imageUrl: string }; analysis: { id: string; createdAt: string; metrics?: { webReportV2?: { overallScore?: number; entries?: { id: string; value: unknown }[] }; report?: { categories?: { id: string; score: number }[] } } } }[]; next: string | null }
const evaluationReadings = [
  { id: 'skin.pores', title: 'Skin', label: 'Pore appearance' },
  { id: 'skin.fine-lines', title: 'Skin Age', label: 'Visible fine lines' },
  { id: 'eyes.under-eye-fullness', title: 'Eye area', label: 'Under-eye fullness' },
  { id: 'cheeks.contour', title: 'Cheeks', label: 'Contour' },
  { id: 'face.shape', title: 'Face shape', label: 'Shape' },
  { id: 'jaw.jaw-shape', title: 'Jaw & chin', label: 'Jaw shape' },
]

function Evaluations({ preview, now, onNewScan }: { preview: boolean; now: number; onNewScan: () => void }) {
  const { data, error, setSize, isValidating } = useSWRInfinite<ReportPage>((index, previous) => preview || (index > 0 && !previous?.next) ? null : index === 0 ? '/api/mobile/reports?includeWebReports=1' : `/api/mobile/reports?includeWebReports=1&before=${encodeURIComponent(previous!.next!)}`, apiGet, { refreshInterval: pages => pages?.some(page => page.processing) ? 5000 : 0 })
  const reports = preview ? [{ photo: { imageUrl: '/scan/welcome.jpg' }, analysis: { id: 'sample', createdAt: new Date(now).toISOString(), metrics: { webReportV2: { overallScore: 7.8, entries: sampleEntries } } } }] : data?.flatMap(page => page.reports) ?? []
  const latest = reports[0]
  const score = latest?.analysis.metrics?.webReportV2?.overallScore ?? latest?.analysis.metrics?.report?.categories?.find(category => category.id === 'overall')?.score
  const entries = latest?.analysis.metrics?.webReportV2?.entries ?? []
  const observations = evaluationReadings.map(({ id, title, label }) => {
    const value = entries.find(entry => entry.id === id)?.value
    return { id, title, label, value: typeof value === 'string' && value.trim().length <= 55 ? value.trim() : '' }
  })
  const reportHref = (id: string) => preview ? '/analysis?preview=mobile&walkthrough=1&report=sample' : `/analysis?analysisId=${encodeURIComponent(id)}&from=app`
  return <section className="scan-evaluations">
    <header><h1>Evaluations</h1><button type="button" className="scan-home-primary" onClick={onNewScan}><Plus size={19} /> New</button></header>
    {data?.[0]?.processing && <p role="status">Your new analysis is being prepared. It will appear here automatically.</p>}
    {latest && score != null && <Link className="scan-evaluation-overall" href={reportHref(latest.analysis.id)}>
      <div className="scan-evaluation-summary-row"><b>Overall</b><small>{new Date(latest.analysis.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></div>
      <MobileScoreGauge score={score} light />
      <div className="scan-evaluation-summary-row"><small>Based on your latest evaluation</small><ArrowUpRight size={16} /></div>
    </Link>}
    {latest && <div className="scan-evaluation-observations">{observations.map(({ id, title, label, value }) => <Link key={id} href={reportHref(latest.analysis.id)}>
      <span className="scan-evaluation-tile-value"><b>{value || '—'}</b><SlidersHorizontal size={19} aria-hidden="true" /></span>
      <span className="scan-evaluation-tile-caption"><b>{title}</b><small>{label}</small></span>
    </Link>)}</div>}
    {error ? <p role="alert">Couldn’t load your evaluations. Reconnect and try again.</p> : !preview && !data ? <div className="scan-evaluation-skeleton" aria-label="Loading evaluations" /> : reports.length ? <div className="scan-evaluation-list">
      <div className="scan-evaluation-history-title"><h2>Prior evaluations</h2><small>{reports.length} saved</small></div>
      {reports.map(({ photo, analysis }, index) => <Link key={analysis.id} className="scan-evaluation-card" data-latest={index === 0 || undefined} href={reportHref(analysis.id)}>
        <img src={photo.imageUrl} alt="" loading={index ? 'lazy' : 'eager'} />
        <span><small>{index === 0 ? 'Latest evaluation' : 'Prior evaluation'}</small><b>Face Evaluation</b><span>{new Date(analysis.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></span><ArrowUpRight size={18} />
      </Link>)}
      {data?.at(-1)?.next && <button type="button" disabled={isValidating} onClick={() => void setSize(size => size + 1)}>Load more</button>}
    </div> : <p>Your saved reports will appear here after your first evaluation.</p>}
  </section>
}
