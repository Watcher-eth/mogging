import { restoreWebJourney } from '@/lib/analytics/web-journey'
import { trackWebEvent } from '@/lib/analytics/client'
import { takeStripeAttempt, readStripeAttempt, clearStripeAttempt, stripeAttemptProperties } from '@/lib/client/stripe-attempt'
import { ScoreDistribution } from '@/components/analysis/score-distribution'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
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
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { ScanCreditSheet, scanBalanceKey, type ScanAccess } from '@/components/members/scan-credit-sheet'
import useSWRInfinite from 'swr/infinite'
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, BookOpen, FileText, LayoutGrid, Plus, Trophy } from 'lucide-react'
import { TextMorph } from 'torph/react'
import { ScanPwaHead } from '@/components/app/scan-pwa-head'
import { DesktopMemberPreview, sampleMemberProfile, sampleMemberEvaluations } from '@/components/landing/desktop-member-preview'
import { usePhoneLayout } from '@/hooks/use-phone-layout'
import { isPhoneUserAgent } from '@/lib/analysis/phone-layout'
import ProtocolPage from '@/components/members/protocol'
import type ProgressPage from '@/components/members/progress'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { getAuthSession } from '@/lib/auth/session'
import { getMemberProfile, memberPage, type MemberProfile } from '@/lib/users/member-pages'
import { MemberAccountMenu, type AccountPanel } from '@/components/members/member-account-menu'
import { DesktopEvaluations } from '@/components/members/desktop-evaluations'
import { MemberLeaderboard } from '@/components/members/member-leaderboard'

import { FeatureInstrument } from '@/components/members/feature-instrument'
import { ReportHistoryPortrait } from '@/components/members/report-history-portrait'
import { featureMeasurements, formatFeatureMeasurement, readFeatureMeasurements } from '@/lib/analysis-v2/feature-history'
import sampleLandmarks from '@/components/analysis/scan-welcome-landmarks.json'

const ScanCourses = dynamic(() => import('@/components/members/scan-courses'))

const tabs = [
  { id: 'courses', title: 'Courses', Icon: BookOpen },
  { id: 'protocol', title: 'Protocol', Icon: LayoutGrid },
  { id: 'evaluation', title: 'Evaluation', Icon: FileText },
  { id: 'leaderboard', title: 'Leaderboard', Icon: Trophy },
] as const
type Tab = typeof tabs[number]['id'] | 'progress'
type Props = {
  tab: Tab; preview: boolean; userId: string; signedIn: boolean; now: number; phoneEntry: boolean; previewPhone?: boolean;
  profile?: MemberProfile; protocol?: ComponentProps<typeof ProtocolPage>; progress?: ComponentProps<typeof ProgressPage>;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { req, res, query } = context
  res.setHeader('Cache-Control', 'private, no-store')
  const tab = query.tab === 'progress' ? 'progress' : tabs.find(item => item.id === query.tab)?.id ?? 'evaluation'
  const preview = process.env.NODE_ENV === 'development' && query.preview === '1'
  const session = preview ? null : await getAuthSession(req, res)
  const userId = session?.user?.id ?? ''
  const phoneEntry = isPhoneUserAgent(req.headers['user-agent'] ?? '', req.headers['sec-ch-ua-mobile']?.toString())
  const props: Props = { tab, preview, userId, signedIn: Boolean(userId), now: Date.now(), phoneEntry }
  if (preview && query.device === 'phone') props.previewPhone = true
  if (userId) {
    const memberTab = tab === 'protocol' ? 'protocol' : tab === 'progress' || tab === 'evaluation' ? 'progress' : null
    const [profile, member] = await Promise.all([
      getMemberProfile(userId),
      memberTab ? memberPage(memberTab)(context) : null,
    ])
    props.profile = profile
    if (member && 'props' in member) {
      if (memberTab === 'progress') props.progress = await member.props as Props['progress']
      if (memberTab === 'protocol') props.protocol = await member.props as Props['protocol']
    }
  }
  return { props }
}

export default function ScanHome({ tab, preview, userId, signedIn, now, phoneEntry, previewPhone, profile, progress, protocol }: Props) {
  const router = useRouter()
  const { status, data: session } = useSession()
  const phone = usePhoneLayout(phoneEntry)
  const desktop = !previewPhone && !phone
  const { mutate } = useSWRConfig()
  const [creditOpen, setCreditOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [signInRequired, setSignInRequired] = useState(false)
  const attemptedCheckout = useRef<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [accountPanel, setAccountPanel] = useState<AccountPanel | null>(null)
  const [direction, setDirection] = useState(1)
  const href = (id: Tab) => `/app/home?tab=${id}${preview ? '&preview=1' : ''}${previewPhone ? '&device=phone' : ''}`
  const activeTab = tab === 'progress' ? 'evaluation' : tab
  const current = tabs.findIndex(item => item.id === activeTab)
  const accountReady = signedIn && status !== 'unauthenticated' && !signInRequired
    && (status !== 'authenticated' || session?.user?.id === userId)
  const { data: access } = useSWR<ScanAccess>(accountReady && !preview ? scanBalanceKey(userId) : null, ([url]) => apiGet(url), { shouldRetryOnError: false })
  const membership = access?.entitlements.subscription
  const memberFeatures = preview || membership?.active || Boolean(progress || protocol)
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
    void router.push(`/analysis?start=1&from=app${preview ? `&preview=${desktop ? 'desktop' : 'mobile'}&walkthrough=1` : ''}`)
  }
  return <div className="scan-home" data-desktop={desktop || undefined}>
    <ScanPwaHead mobile={!desktop && !preview} />
    <Head><title>{desktop ? `${activeTab === 'evaluation' ? 'Progress' : tabs[current].title} | Mogging` : 'Mogging.com'}</title><meta name="robots" content="noindex, nofollow" /></Head>
    <MotionConfig reducedMotion="user">
      {!accountReady && !preview ? <section className="scan-home-auth">
        <img src="/scan/icon-192.png" width={72} height={72} alt="" /><h1>Welcome to Mogging</h1>
        <p>Sign in with the account you used at checkout to open your evaluations and access your plan.</p>
        <button type="button" className="scan-home-primary" onClick={() => setLoginOpen(true)}>Sign in</button>
        {!desktop && !sessionId && <Link href="/analysis" className="scan-home-start">Start an evaluation</Link>}
        <LoginDialog audience="scan" open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={sessionId ? `${returnPath}&scan_checkout=success&session_id=${encodeURIComponent(sessionId)}` : href(tab)} />
      </section> : <>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={activeTab} className="scan-home-screen" data-full-protocol={desktop && activeTab === 'protocol' && Boolean(preview || protocol) || undefined} custom={direction}
            variants={{ enter: (dir: number) => ({ opacity: 0, x: dir * 18 }), visible: { opacity: 1, x: 0 }, exit: (dir: number) => ({ opacity: 0, x: -dir * 12 }) }}
            initial="enter" animate="visible" exit="exit" transition={{ duration: .22, ease: [.23, 1, .32, 1] }}>
            {activeTab === 'evaluation' && <Evaluations preview={preview} desktop={desktop} onNewScan={openCredits}
              jumpToHistory={desktop && tab === 'progress'} progress={progress} />}
            {activeTab === 'courses' && <ScanCourses desktop={desktop} userId={userId || 'preview'} />}
            {activeTab === 'leaderboard' && <MemberLeaderboard preview={preview} profile={preview ? sampleMemberProfile : profile} onInvite={() => setAccountPanel('invite')} onSettings={() => setAccountPanel('settings')} mobile={!desktop} />}
            {activeTab === 'protocol' && (preview ? <DesktopMemberPreview view="protocol" now={now} desktop={desktop} />
              : protocol ? <ProtocolPage {...protocol} desktop={desktop} /> : <MemberFeatureNotice title="Protocol" />)}
          </motion.div>
        </AnimatePresence>
        <header className="scan-home-topbar">
          {desktop && <div className="scan-home-brand"><img src="/scan/icon-192.png" width={34} height={34} alt="" /><span>Mogging</span></div>}
          <nav className="scan-home-nav" aria-label="Mogging app">
            <LayoutGroup id="scan-home-tabs">
              {tabs.map(({ id, title, Icon }, index) => {
                if (id === 'protocol' && !memberFeatures) return null
                return <Link key={id} href={href(id)} scroll={false} aria-current={activeTab === id ? 'page' : undefined} onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  event.preventDefault()
                  if (id === tab) return
                  setDirection(index > current ? 1 : -1)
                  void router.push(href(id)).then(changed => { if (changed) window.scrollTo(0, 0) })
                }}>
                  {activeTab === id && <motion.span aria-hidden="true" layoutId="selected" className="scan-home-selected" transition={{ type: 'spring', damping: 30, stiffness: 360 }} />}
                  {!desktop && <Icon size={20} />}
                  <span>{desktop && id === 'evaluation' ? 'Progress' : title}</span>
                </Link>
              })}
            </LayoutGroup>
          </nav>
          <MemberAccountMenu panel={accountPanel} onPanel={setAccountPanel} profile={preview ? sampleMemberProfile : profile} preview={preview} mobile={!desktop} onScans={openCredits} />
        </header>
        <ScanCreditSheet open={creditOpen} onOpenChange={setCreditOpen}
          tab={tab === 'progress' ? 'progress' : 'evaluation'} userId={userId} preview={preview}
          confirming={confirming || Boolean(sessionId && !confirmationError)}
          confirmationError={confirmationError} onRetry={() => { if (sessionId) void confirmPurchase(sessionId) }}
          onStart={startScan} onSignIn={requestSignIn}
          onInvite={() => { setCreditOpen(false); setAccountPanel('scan-invite') }} />
      </>}
    </MotionConfig>
  </div>
}

function MemberFeatureNotice({ title }: { title: string }) {
  return <section className="scan-home-auth">
    <h1>{title}</h1><p>Available with an active Mogging Pro subscription.</p>
    <Link className="scan-home-primary" href="/analysis?start=1&from=app">Start an evaluation</Link>
  </section>
}

type SavedScores = { potential?: { score?: number } | null }

type ReportPage = {
  processing?: boolean
  reports: {
    photo: { imageUrl: string }
    analysis: {
      id: string
      createdAt: string
      landmarks?: unknown
      pslScore?: number | null
      metrics?: {
        webReportV2?: SavedScores & { overallScore?: number; categories?: { id: string; score: number }[]; entries?: { id: string; value: unknown }[] }
        report?: SavedScores & { categories?: { id: string; score: number }[] }
      }
    }
  }[]
  next: string | null
}
const evaluationReadings = [
  { area: 'skin', id: 'skin.pores', title: 'Skin', label: 'Pore appearance' },
  { area: 'eyes', id: 'eyes.under-eye-fullness', title: 'Eye area', label: 'Under-eye fullness' },
  { area: 'cheeks', id: 'cheeks.contour', title: 'Cheeks', label: 'Contour' },
  { area: 'face', id: 'face.shape', title: 'Face shape', label: 'Shape' },
  { area: 'jaw', id: 'jaw.jaw-shape', title: 'Jaw & chin', label: 'Jaw shape' },
  { area: 'symmetry', id: 'symmetry.eyes-height', title: 'Symmetry', label: 'Eye height difference' },
] as const
const historicScoreAliases: Record<string, string> = { eye_area: 'eyes', cheekbones: 'cheeks', face_shape: 'face', jaw_chin: 'jaw' }

function scoreFromReport(report: ReportPage['reports'][number]['analysis']) {
  const metrics = report.metrics
  return metrics?.webReportV2?.overallScore
    ?? metrics?.report?.categories?.find(category => category.id === 'overall')?.score
    ?? (typeof report.pslScore === 'number' && report.pslScore >= 0 && report.pslScore <= 8 ? pslToOverallScore(report.pslScore) : undefined)
}

function reportMeasurements(report: ReportPage['reports'][number]['analysis']) {
  const { id, createdAt: date, metrics } = report
  const scores = Object.fromEntries((metrics?.webReportV2?.categories ?? metrics?.report?.categories ?? []).flatMap(({ id, score }) =>
    Number.isFinite(score) ? [[historicScoreAliases[id] ?? id, score]] : []))
  const overall = scoreFromReport(report)
  if (overall != null && Number.isFinite(overall)) scores.overall = overall
  const potential = metrics?.report?.potential?.score ?? metrics?.webReportV2?.potential?.score
  return { id, date, scores, measurements: readFeatureMeasurements(metrics?.webReportV2?.entries),
    ...(typeof potential === 'number' && potential >= 1 && potential <= 8 ? { potential: pslToOverallScore(potential) } : {}),
  }
}
const sampleEvaluationDate = Date.UTC(2026, 10, 7, 12)
const evaluationDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const evaluationEntrance = {
  hidden: { opacity: 0, y: 7 },
  visible: (index: number) => ({ opacity: 1, y: 0, transition: { duration: .24, delay: Math.min(index, 6) * .028, ease: [.22, 1, .36, 1] as const } }),
}
const EvaluationLink = motion.create(Link)
function Evaluations({ preview, desktop, onNewScan, progress, jumpToHistory }: {
  preview: boolean; desktop: boolean; onNewScan: () => void; progress?: Props['progress']; jumpToHistory: boolean
}) {
  const reduced = useReducedMotion()
  const animateCards = !reduced
  const { data, error, setSize, isValidating } = useSWRInfinite<ReportPage>((index, previous) => preview || (index > 0 && !previous?.next) ? null : index === 0 ? '/api/mobile/reports?includeWebReports=1' : `/api/mobile/reports?includeWebReports=1&before=${encodeURIComponent(previous!.next!)}`, apiGet, { refreshInterval: pages => pages?.some(page => page.processing) ? 5000 : 0 })
  const samples = preview ? sampleMemberEvaluations(sampleEvaluationDate, 0) : []
  const reports: ReportPage['reports'] = samples.length ? samples.map(item => ({
    photo: { imageUrl: desktop ? sampleMemberProfile.imageUrl : '/scan/welcome.jpg' },
    analysis: { id: item.id, createdAt: item.date, landmarks: desktop ? null : sampleLandmarks, metrics: { webReportV2: { overallScore: item.scores.overall, potential: { score: 7.1 }, entries: sampleEntries } } },
  })) : data?.flatMap(page => page.reports) ?? []
  const latest = reports[0]
  const score = latest && scoreFromReport(latest.analysis)
  const potentialPsl = latest?.analysis.metrics?.report?.potential?.score ?? latest?.analysis.metrics?.webReportV2?.potential?.score
  const potential = typeof potentialPsl === 'number' && potentialPsl >= 1 && potentialPsl <= 8 ? pslToOverallScore(potentialPsl) : undefined
  const showDistribution = score != null && Number.isFinite(score)
  const entries = latest?.analysis.metrics?.webReportV2?.entries ?? []
  const observations = evaluationReadings.map(({ area, id, title, label }) => {
    const value = entries.find(entry => entry.id === id)?.value
    return { area, id, title, label, value: typeof value === 'string' && value.trim().length <= 55 ? value.trim() : '' }
  })
  const reportHref = (id: string) => preview ? `/analysis?preview=${desktop ? 'desktop' : 'mobile'}&walkthrough=1&report=sample` : `/analysis?analysisId=${encodeURIComponent(id)}&from=app`
  const history = preview ? samples : progress?.evaluations.length ? progress.evaluations : reports.map(({ analysis }) => reportMeasurements(analysis))
  if (desktop) {
    const findings = Object.fromEntries(observations.flatMap(item => item.value ? [[item.area, item]] : []))
    return <DesktopEvaluations reports={reports} evaluations={history}
      focusIds={preview ? ['skin', 'jaw'] : progress?.focusIds ?? []} observations={findings} preview={preview}
      activityUser={preview ? 'desktop-preview' : progress?.userId} reportHref={reportHref}
      onNewScan={onNewScan} processing={Boolean(data?.[0]?.processing)} loading={!preview && !data && !error} error={Boolean(error)}
      more={data?.at(-1)?.next ? { loading: isValidating, load: () => void setSize(size => size + 1) } : undefined} jumpToHistory={jumpToHistory} />
  }
  return <section className="scan-evaluations">
    <header><h1>Evaluations</h1><button type="button" className="scan-home-primary" onClick={onNewScan}><Plus size={19} /> New</button></header>
    {data?.[0]?.processing && <p role="status">Your new analysis is being prepared. It will appear here automatically.</p>}
    {latest && <div className="scan-evaluation-overview">
      {showDistribution && <EvaluationLink className="scan-evaluation-overall" href={reportHref(latest.analysis.id)}
        aria-label="Open latest evaluation" variants={evaluationEntrance} custom={0} initial={animateCards ? 'hidden' : false} animate="visible">
        <MobileScoreGauge score={score} light semicircle />
      </EvaluationLink>}
      <h2 className="scan-evaluation-grid-title">Your face</h2>
      <div className="scan-evaluation-observations">
        {showDistribution && <motion.div className="scan-evaluation-distribution" variants={evaluationEntrance} custom={1}
          initial={animateCards ? 'hidden' : false} animate="visible"><ScoreDistribution score={score} potential={potential} showSurvey compact /></motion.div>}
        {observations.map(({ area, id, title, label, value }, index) => {
          const measurement = featureMeasurements[area]
          const measured = history.flatMap(item => {
            const reading = item.measurements?.[measurement.id]
            return typeof reading === 'number' ? [{ id: item.id, date: item.date, score: reading }] : []
          }).reverse()
          const scored = history.flatMap(item => {
            const reading = item.scores[area]
            return typeof reading === 'number' ? [{ id: item.id, date: item.date, score: reading }] : []
          }).reverse()
          const isMeasured = measured.length > 0
          const readings = isMeasured ? measured : scored
          const format = (number: number) => isMeasured ? formatFeatureMeasurement(area, number) : number.toFixed(1)
          const reading = isMeasured ? format(measured.at(-1)!.score) : value || (scored.length ? format(scored.at(-1)!.score) : '—')
          const wide = index === 2 || index === 5
          return <EvaluationLink key={id} data-wide={wide || undefined} href={reportHref(latest.analysis.id)}
            variants={evaluationEntrance} custom={index + 2} initial={animateCards ? 'hidden' : false} animate="visible">
            <span className="scan-evaluation-tile-caption"><b>{title}</b><small>{isMeasured ? measurement.label : value ? label : 'Category score'}</small></span>
            <strong className="scan-evaluation-tile-value">{animateCards ? <TextMorph>{reading}</TextMorph> : reading}</strong>
            {readings.length > 0 && <FeatureInstrument area={area} readings={readings} measured={isMeasured} wide={wide}
              caption={isMeasured ? measurement.label : 'Category score'} format={format} />}
          </EvaluationLink>
        })}
      </div>
    </div>}
    {error ? <p role="alert">Couldn’t load your evaluations. Reconnect and try again.</p> : !preview && !data ? <div className="scan-evaluation-skeleton" aria-label="Loading evaluations" /> : reports.length ? <div className="scan-evaluation-list">
      <div className="scan-evaluation-history-title"><h2>Report history</h2><small>{animateCards ? <TextMorph>{`${reports.length} saved`}</TextMorph> : `${reports.length} saved`}</small></div>
      {reports.map(({ photo, analysis }, index) => <EvaluationLink key={analysis.id} className="scan-evaluation-card" data-latest={index === 0 || undefined} href={reportHref(analysis.id)}
        variants={evaluationEntrance} custom={index} initial={animateCards ? 'hidden' : false} animate="visible">
        <ReportHistoryPortrait imageUrl={photo.imageUrl} landmarks={analysis.landmarks} />
        <span><small>{index === 0 ? 'Latest evaluation' : 'Prior evaluation'}</small><b>{evaluationDate.format(new Date(analysis.createdAt))}</b></span><ArrowUpRight size={18} aria-hidden="true" />
      </EvaluationLink>)}
      {data?.at(-1)?.next && <button type="button" disabled={isValidating} onClick={() => void setSize(size => size + 1)}>Load more</button>}
    </div> : <p>Your saved reports will appear here after your first evaluation.</p>}
  </section>
}
