import { countryFromTimeZone, skipEthnicity } from '@/components/analysis/population-distribution'
import type { BasicReport as BasicReportData } from '@/lib/analysis-v2/basic-preview'
import { WEB_ANALYSIS_VARIANTS } from '@/lib/analytics/web-context'
import { useWebStep } from '@/hooks/use-web-step'
import { webJourneyContext, restoreWebJourney } from '@/lib/analytics/web-journey'
import { rememberStripeAttempt, takeStripeAttempt, readStripeAttempt, clearStripeAttempt, stripeAttemptProperties } from '@/lib/client/stripe-attempt'
import { usePortraitHandoff } from '@/components/analysis/use-portrait-handoff'
import { ensureAnalysisWebInstallId } from '@/lib/client/analysis-install'
import { isWebAnalysisProduct } from '@/lib/payments/web-analysis-plans'
import { ScanInstallGuide } from '@/components/analysis/scan-install-guide'
import { TextMorph } from 'torph/react'
import sampleLandmarks from '@/components/analysis/scan-welcome-landmarks.json'
import sampleRubrics from '@/lib/analysis-v2/sample-entries.json'
import rubricRegistry from '@/lib/analysis-v2/rubric-registry.json'
import { MobileCaptureChrome } from '@/components/analysis/guided-web-capture'
import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { MobileScanOnboarding } from '@/components/analysis/mobile-scan-onboarding'
import { ScanPwaHead } from '@/components/app/scan-pwa-head'
import { MobileScanWelcome, scanPart, scanSequence } from '@/components/analysis/mobile-scan-pwa'
import type { GetServerSideProps } from 'next'
import type { AnalysisPurchase } from '@/components/payments/analysis-unlock-dialog'
import { quotePaywallExperiment } from '@/lib/payments/paywall-experiment-server'
import { paywallExperimentProperties, type PaywallExposure } from '@/lib/payments/paywall-experiment'
import type { CheckoutQuote } from '@/components/payments/membership-offer'
import { flushWebAnalytics } from '@/lib/analytics/client'
import type { WebReport } from '@/lib/analysis-v2/report-schema'
import { reportCategoryDefaults as reportCategories } from '@/components/analysis/report-category-defaults'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
import { trackWebEvent } from '@/lib/analytics/client'
import { usePhoneLayout } from '@/hooks/use-phone-layout'
import { isPhoneUserAgent } from '@/lib/analysis/phone-layout'
import { getRequestLocation } from '@/lib/geo/request'
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Camera,
  ImagePlus,
  RotateCcw,
  Download,
  ScanFace,
  Loader2,
  Share2,
  X,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useSound } from '@web-kits/audio/react'
import useSWR, { useSWRConfig } from 'swr'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { downloadCue, selectSound, useQuietCue } from '@/lib/audio/sounds'
import {
  clearAnalysisDraft,
  clearCheckoutAnalysisDraft,
  loadCheckoutAnalysisDraft,
  saveCheckoutAnalysisDraft,
  loadAnalysisDraft,
  saveAnalysisDraft,
  type AnalysisDraftImage,
  loadAnalysisSidePhoto,
  saveAnalysisSidePhoto,
} from '@/lib/client/analysisDraft'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { Button } from '@/components/ui/button'
import { LoginDialog } from '@/components/app/login-dialog'
import { SeoHead } from '@/components/app/seo-head'
import { CaptureFrame, type CaptureFrameImagePosition } from '@/components/analysis/capture-frame'
import { desktopCaptureViewport } from '@/components/analysis/face-guide'
import { DesktopSetup, desktopSetupSteps, desktopShortSetupSteps, desktopFullSetupSteps, desktopCaptureSteps, getDesktopReportFocus, type AnalysisGender, type DesktopCaptureStep, type DesktopAnalysisPreferences } from '@/components/analysis/desktop-onboarding'
import { DesktopCapture } from '@/components/analysis/desktop-capture'
import { AnalysisProgress } from '@/components/analysis/analysis-progress'

const BasicReport = dynamic(() => import('@/components/analysis/basic-report').then(module => module.BasicReport))
const LockedReportPreview = dynamic(() => import('@/components/payments/locked-report-preview').then(module => module.LockedReportPreview))
const DesktopPortraitScan = dynamic(() => import('@/components/analysis/desktop-portrait-scan').then(module => module.DesktopPortraitScan))
const DesktopAssessmentPreview = dynamic(() => import('@/components/analysis/desktop-assessment-preview').then(module => module.DesktopAssessmentPreview))
const AnalysisUnlockDialog = dynamic(() => import('@/components/payments/analysis-unlock-dialog').then(module => module.AnalysisUnlockDialog))
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))

const WebAnalysisReport = dynamic(() => import('@/components/analysis/v2/web-analysis-report').then(module => module.WebAnalysisReport))

const LegacyAnalysisReport = dynamic(() => import('@/components/analysis/v2/web-analysis-report').then(module => module.LegacyAnalysisReport))
const ReportActions = dynamic(() => import('@/components/analysis/analysis-report').then((module) => module.ReportActions))
const CameraSheet = dynamic(() => import('@/components/analysis/camera-sheet').then((module) => module.CameraSheet))

type FlowStep = 'desktop-setup' | 'intro' | 'story' | 'upload' | 'preview-analysis' | 'desktop-scan' | 'payment' | 'actual-analysis' | 'basic-report' | 'results'

type AnalysisResponse = {
  canManage?: boolean;
  photo: {
    id: string
    imageUrl: string
    imageHash: string
    isPublic?: boolean
  }
  analysis: {
    id: string
    createdAt?: string
    status: 'pending' | 'processing' | 'complete' | 'failed'
    pslScore: number | null
    harmonyScore: number | null
    dimorphismScore: number | null
    angularityScore: number | null
    percentile: number | null
    tier: string | null
    tierDescription: string | null
    metrics: AnalysisMetrics
    landmarks: Record<string, unknown>
    failureReason?: string | null
  }
  deduped: boolean
}

const sampleWalkthroughReport: AnalysisResponse = {
  photo: { id: 'walkthrough-photo', imageUrl: '/scan/welcome.jpg', imageHash: 'walkthrough' },
  analysis: {
    id: 'walkthrough-report', status: 'complete', pslScore: 6.2, harmonyScore: 7.8,
    createdAt: '2026-11-07T12:00:00.000Z',
    dimorphismScore: 7.7, angularityScore: 7.9, percentile: null, tier: null, tierDescription: null,
    landmarks: sampleLandmarks,
    metrics: {
      report: { summary: 'Illustrative evaluation.', potential: { score: 6.7 }, categories: [] },
      webReportV2: {
        version: 2, summary: 'Illustrative evaluation for the walkthrough.', overallScore: 7.8,
        categories: rubricRegistry.categories.map(category => ({ id: category.id, score: 7.8, explanation: 'Sample observations for this evaluation category.' })),
        entries: sampleRubrics as WebReport['entries'],
        eyeColor: 'green', hairColor: 'brown', contours: { hair: [], ears: [] }, timingMs: 0,
      },
    },
  },
  deduped: false,
}

const sampleDesktopFront = '/analysis/studio/pair-front.jpg'
const sampleDesktopSide: AnalysisDraftImage = {
  id: 'walkthrough-side',
  name: 'Sample side profile',
  dataUrl: '/analysis/studio/pair-side.jpg',
  view: 'side',
}

function desktopWalkthroughReport(front?: AnalysisDraftImage): AnalysisResponse {
  return {
    ...sampleWalkthroughReport,
    photo: { ...sampleWalkthroughReport.photo, imageUrl: front?.dataUrl ?? sampleDesktopFront },
    analysis: { ...sampleWalkthroughReport.analysis, landmarks: front?.landmarks ?? {} },
  }
}

type AnalysisMetrics = Record<string, unknown> & {
  report?: AnalysisReport | null
  webReportV2?: WebReport | null
  metricScores?: Array<{
    name: string
    score: number
    category: string
    description?: string
  }>
  symmetryScore?: number | null
  proportionalityScore?: number | null
  averagenessScore?: number | null
}

type AnalysisReportFeature = {
  label: string
  value: string
  measurement?: string
}

type AnalysisReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  score: number
  features: AnalysisReportFeature[]
  eyeColor?: string
  explanation: string
}

type AnalysisReport = {
  summary: string
  potential?: { score?: number }
  categories: AnalysisReportCategory[]
}

type ShareResponse = {
  share: {
    token: string
  }
}

type CheckoutResponse = {
  url: string
  sessionId?: string
}

type PaymentAccessResponse = {
  analytics?: { flow_id?: string; attempt_id?: string; flow_version?: string }
  entitlements: {
    mobileInstallId: string
    evaluationCredits: number
    subscription: {
      active: boolean
      tier?: 'basic' | 'pro'
      status: string | null
      currentPeriodEnd: string | null
    }
  }
}

type ImageFramePositions = Record<string, CaptureFrameImagePosition>
const defaultFramePosition: CaptureFrameImagePosition = { x: 50, y: 50, scale: 1 }

const previewPhotoUrl = '/model.png'
type AnalysisEntryProps = { country: string | null; startWithPhoto: boolean; phoneEntry: boolean; previewDevice: 'mobile' | 'desktop' | null; walkthrough: boolean; sampleReport: boolean; assignedOnboarding: PaywallExposure | null }

export const getServerSideProps: GetServerSideProps<AnalysisEntryProps> = async ({ query, req, res }) => {
  const phoneEntry = isPhoneUserAgent(req.headers['user-agent'] ?? '', req.headers['sec-ch-ua-mobile']?.toString())
  const secret = process.env.NEXTAUTH_SECRET
  const eligible = !query.from && !query.checkout && !query.analysisId && !query.preview && !query.resumePhoto && !query.basic
  const assignedOnboarding = eligible && secret
    ? quotePaywallExperiment(req, res, phoneEntry ? 'mobile' : 'desktop', secret, 'onboarding')?.exposure ?? null
    : null
  if (assignedOnboarding) res.setHeader('Cache-Control', 'private, no-store')
  return { props: {
    assignedOnboarding,
    country: getRequestLocation(req).country,
    phoneEntry,
    startWithPhoto: query.start === '1' && !assignedOnboarding,
    sampleReport: process.env.NODE_ENV === 'development' && (query.preview === 'mobile' || query.preview === 'desktop') && query.walkthrough === '1' && query.report === 'sample',
    previewDevice: process.env.NODE_ENV === 'development' && (query.preview === 'mobile' || query.preview === 'desktop') ? query.preview : null,
    walkthrough: process.env.NODE_ENV === 'development' && (query.preview === 'mobile' || query.preview === 'desktop') && query.walkthrough === '1',
  } }
}

export default function AnalysisPage({ startWithPhoto, phoneEntry, previewDevice, walkthrough, sampleReport, assignedOnboarding, country: requestCountry }: AnalysisEntryProps) {
  const router = useRouter()
  const phoneLayout = usePhoneLayout(phoneEntry)
  const previewMobile = previewDevice === 'mobile'
  const mobileScan = previewDevice ? previewMobile : phoneLayout
  const onboardingExperiment = !walkthrough && assignedOnboarding?.surface === (mobileScan ? 'mobile' : 'desktop') ? assignedOnboarding : null
  const desktopArm = mobileScan ? undefined : onboardingExperiment?.arm
  const setupSteps = desktopArm === 'treatment' ? desktopShortSetupSteps : desktopArm === 'control' ? desktopFullSetupSteps : desktopSetupSteps
  const inlineConsent = desktopArm === 'treatment'
  const { status, data: session } = useSession()
  const playSelect = useSound(selectSound)
  const sideInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<AnalysisDraftImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other')
  const [setupIndex, setSetupIndex] = useState(0)
  const [captureStep, setCaptureStep] = useState<DesktopCaptureStep>('front')
  const [desktopDirection, setDesktopDirection] = useState<1 | -1>(1)
  const [chosenProfile, setChosenProfile] = useState<AnalysisGender | null>(null)
  const [preferences, setPreferences] = useState<DesktopAnalysisPreferences>({})
  const [background, setBackground] = useState(skipEthnicity)
  const [browserCountry, setBrowserCountry] = useState<string | null>(null)
  const detectedCountry = requestCountry === 'XX' ? null : requestCountry
  const country = detectedCountry ?? browserCountry
  useEffect(() => {
    if (!detectedCountry && !mobileScan) setBrowserCountry(countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone))
  }, [detectedCountry, mobileScan])
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const setupStep = setupSteps[setupIndex] ?? setupSteps[0]
  const entryStep = startWithPhoto ? 'upload' : mobileScan ? 'intro' : 'desktop-setup'
  const [step, setStep] = useState<FlowStep>(sampleReport ? 'results' : entryStep)
  useEffect(() => {
    setStep(current => current === 'intro' || current === 'upload' || current === 'desktop-setup'
      || (!mobileScan && current === 'story') || (mobileScan && current === 'desktop-scan')
      ? entryStep
      : current)
  }, [entryStep, mobileScan])
  const [progress, setProgress] = useState(0)
  const [scanRequest, setScanRequest] = useState<string | null>(null)
  const failedScanRequest = useRef<string | null>(null)
  const { mutate } = useSWRConfig()
  const { data: scanStatus } = useSWR<{ status: 'waiting' | 'pending' | 'complete' | 'failed' }>(
    scanRequest ? `/api/web/analyze-status?requestId=${encodeURIComponent(scanRequest)}` : null, apiGet,
    { refreshInterval: 2500, revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const [sidePortrait, setSidePortrait] = useState<AnalysisDraftImage | null>(sampleReport && !mobileScan ? sampleDesktopSide : null)
  const [results, setResults] = useState<AnalysisResponse[]>(() => sampleReport ? [mobileScan ? sampleWalkthroughReport : desktopWalkthroughReport()] : [])
  const [offerInstall, setOfferInstall] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [analysisUnlocked, setAnalysisUnlocked] = useState(false)
  const [returnOfferSessionId, setReturnOfferSessionId] = useState<string | null>(null)
  const [returnProduct, setReturnProduct] = useState<string>()
  const preferredPlan = isWebAnalysisProduct(router.query.plan) ? router.query.plan : undefined
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [autoPaywall, setAutoPaywall] = useState(false)
  const afterDesktopScan = useRef<(() => void) | null>(null)
  const [basicReport, setBasicReport] = useState<BasicReportData | null>(null)
  const basicResume = useRef(false)
  const desktopPreview = !mobileScan && step === 'actual-analysis' && !analysisUnlocked
  const desktopReport = desktopPreview || (!mobileScan && step === 'results' && !offerInstall)
  const desktopStep = step === 'desktop-setup' ? `profile.${setupStep}` : step === 'upload' ? `capture.${captureStep}` : step
  const completeStep = useWebStep(desktopPreview ? 'report-preview' : mobileScan ? step : desktopStep, !walkthrough, mobileScan ? WEB_ANALYSIS_VARIANTS.mobile : WEB_ANALYSIS_VARIANTS.desktop, onboardingExperiment)
  const enteredExperiment = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!onboardingExperiment || enteredExperiment.current === onboardingExperiment.unit || (step !== 'intro' && step !== 'desktop-setup')) return
    enteredExperiment.current = onboardingExperiment.unit
    trackWebEvent('onboarding_interaction', { surface: 'web_analysis', action: 'experiment_entered', ...paywallExperimentProperties(onboardingExperiment) })
  }, [onboardingExperiment, step])
  const desktopConsentNotice = <div className="max-w-sm space-y-2 text-sm">
    {!inlineConsent && <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="size-4 shrink-0 accent-black" checked={privacyAccepted} onChange={event => setPrivacyAccepted(event.target.checked)} />
      I agree to photo processing for my analysis.
    </label>}
    <p className="text-xs text-zinc-600">{inlineConsent && 'By selecting Agree and scan my photos, you agree to photo processing for your analysis. '}Mogging sends your photos to Moonshot/Kimi to generate your private analysis. <a className="underline" href="/privacy#third-party-processing" target="_blank" rel="noreferrer">Privacy policy</a></p>
  </div>
  const viewedAnalysisId = step === 'results' ? results[0]?.analysis.id : undefined
  useEffect(() => {
    if (!walkthrough && viewedAnalysisId) trackWebEvent('report_viewed', { report_id: viewedAnalysisId, surface: 'web_analysis', flow_id: webJourneyContext().flow_id })
  }, [viewedAnalysisId, walkthrough])
  useEffect(() => {
    if (!walkthrough && paymentDialogOpen) trackWebEvent('paywall_viewed', { surface: 'web_analysis', paywall_id: 'web_analysis', paywall_version: mobileScan ? '2' : '3', flow_id: webJourneyContext().flow_id, ...paywallExperimentProperties(onboardingExperiment) })
  }, [mobileScan, onboardingExperiment, paymentDialogOpen, walkthrough])
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null)
  const checkoutLoading = checkoutStatus !== null
  const checkoutInFlight = useRef(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [checkoutSignIn, setCheckoutSignIn] = useState(false)
  const [preparingScan, setPreparingScan] = useState<string | null>(null)
  const [loginCallback, setLoginCallback] = useState('/analysis?start=1&resumePhoto=1')
  const loadedAnalysisIdRef = useRef<string | null>(null)
  const resumedCheckoutRef = useRef<string | null>(null)
  const guestReturn = router.query.checkout === 'success' && router.query.guest === '1'
  const scanStage = scanStatus?.status === 'complete' ? 3 : scanStatus?.status === 'pending' ? Math.max(2, progress) : progress
  const checkoutSessionId = router.query.checkout === 'success' && typeof router.query.session_id === 'string' ? router.query.session_id : null
  const activatedCheckout = useRef<string | null>(null)
  const [guestPaymentState, setGuestPaymentState] = useState<'checking' | 'verified' | 'failed'>('checking')
  const [walkthroughCheckout, setWalkthroughCheckout] = useState(false)
  const analysisRunningRef = useRef(false)
  const [desktopPhotoStatus, setDesktopPhotoStatus] = useState<string | null>(null)
  const [landmarkPendingIds, setLandmarkPendingIds] = useState<Record<string, boolean>>({})
  const [imageFramePositions, setImageFramePositions] = useState<ImageFramePositions>({})

  const primaryResult = results[0]
  const primaryScore = primaryResult?.analysis.pslScore ?? null
  const isPreparingUploads = Object.values(landmarkPendingIds).some(Boolean)
  const reportCount = images.filter(image => image.view !== 'side').length
  const canStart = images.some(image => image.view !== 'side') && (mobileScan || images.some(image => image.view === 'side')) && step === 'upload' && (!mobileScan || !isPreparingUploads) && !preparingScan && (walkthrough || status !== 'loading')

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? images[images.length - 1] ?? null,
    [images, selectedImageId],
  )
  const previewImage = selectedImage?.dataUrl ?? null

  useEffect(() => {
    const input = uploadInputRef.current
    if (mobileScan || !input) return
    const finish = () => setDesktopPhotoStatus(null)
    input.addEventListener('cancel', finish)
    return () => input.removeEventListener('cancel', finish)
  }, [mobileScan])

  async function handleFiles(event: ChangeEvent<HTMLInputElement>, side = false) {
    const replace = mobileScan ? undefined
      : images.find(image => side ? image.view === 'side' : image.view !== 'side')
    const remaining = Math.max(0, 3 - images.length) + Number(Boolean(replace))
    const files = Array.from(event.target.files || []).slice(0, !mobileScan ? Math.min(1, remaining) : remaining)
    event.target.value = ''
    if (files.length === 0) {
      if (!mobileScan) setDesktopPhotoStatus(null)
      return
    }

    const started = Date.now()
    if (!walkthrough) trackWebEvent('photo_preparation_started', { surface: 'web_analysis', count: files.length, source: 'picker' })
    if (!mobileScan) setDesktopPhotoStatus('Opening your photo…')
    let nextImages: AnalysisDraftImage[]
    try { nextImages = await Promise.all(files.map(file => readImageFile(file, !mobileScan))) } catch {
      if (!walkthrough) trackWebEvent('photo_validation_failed', { surface: 'web_analysis', reason_code: 'image_read_failed', duration_ms: Date.now() - started })
      setError('Could not open that image. Please try another image.')
      return
    } finally {
      if (!mobileScan) setDesktopPhotoStatus(null)
    }
    if (!walkthrough) {
      trackWebEvent('photo_selected', { surface: 'web_analysis', count: nextImages.length, source: 'picker' })
      trackWebEvent('photo_preparation_completed', { surface: 'web_analysis', count: nextImages.length, duration_ms: Date.now() - started })
    }
    if (!mobileScan && images.some(image => (image.view === 'side') !== side && image.dataUrl === nextImages[0]?.dataUrl)) {
      setError('Choose a different photo for each angle.')
      return
    }
    const visibleNextImages = nextImages.map(image => side ? { ...image, view: 'side' as const } : image)
    if (replace) removeImage(replace.id)
    setError(null)
    setImages(current => [...current, ...visibleNextImages].slice(0, 3))
    setSelectedImageId(visibleNextImages[visibleNextImages.length - 1]?.id ?? null)
    setImageFramePositions((current) => ({
      ...current,
      ...Object.fromEntries(visibleNextImages.map((image) => [image.id, defaultFramePosition])),
    }))
    setLandmarkPendingIds((current) => ({
      ...current,
      ...Object.fromEntries(visibleNextImages.map((image) => [image.id, true])),
    }))
    visibleNextImages.forEach((image) => {
      void enrichImageLandmarks(image)
    })
  }

  const [previewDeadline, setPreviewDeadline] = useState<number | null>(null)

  async function startPseudoAnalysis() {
    if (!canStart || (!mobileScan && !privacyAccepted && !inlineConsent && !walkthrough)) return
    if (walkthrough) {
      if (!mobileScan) {
        beginDesktopScan(images)
        return
      }
      setPreviewDeadline(Date.now() + 10_000)
      setAnalysisUnlocked(false)
      setStep('preview-analysis')
      return
    }
    if (!mobileScan) {
      if (inlineConsent) setPrivacyAccepted(true)
      trackWebEvent('consent_result', { surface: 'web_analysis', step: `capture.${captureStep}`, result: 'accepted' })
      playSelect()
    }
    setPreparingScan('Preparing your photos…')
    let preparedImages: AnalysisDraftImage[]
    try {
      preparedImages = await prepareImagesForAnalysis(images, imageFramePositions, mobileScan)
      if (!mobileScan) {
        const installId = status === 'authenticated' ? ensureAnalysisWebInstallId() : null
        if (installId) setPreparingScan('Checking scan access…')
        const access = installId ? await apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(installId)}`).catch(() => null) : null
        const hasCredits = Boolean(access && access.entitlements.evaluationCredits >= reportCount)
        completeStep()
        setImages(current => preparedImages.map(image => current.find(existing => existing.id === image.id && existing.dataUrl === image.dataUrl) ?? image))
        setImageFramePositions({})
        setError(null)
        beginDesktopScan(preparedImages, hasCredits && installId ? () => void runActualAnalysis(preparedImages, installId, gender) : undefined)
        return
      }
    } catch {
      trackWebEvent('photo_validation_failed', { surface: 'web_analysis', step: 'image_prepare', reason_code: 'photo_prepare_failed' })
      toast.error('Could not prepare your photos. Please try again.')
      return
    } finally {
      setPreparingScan(null)
    }

    completeStep()
    setImages(preparedImages)
    setImageFramePositions({})
    setError(null)
    setAnalysisUnlocked(true)
    setPaymentDialogOpen(false)
    setProgress(1)
    setPreviewDeadline(null)
    const previewEnds = Date.now() + 10_000
    setStep('preview-analysis')

    if (status !== 'authenticated') {
      setPreviewDeadline(previewEnds)
      return
    }

    try {
      const installId = ensureAnalysisWebInstallId()
      const access = await apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(installId)}`)
      if (access.entitlements.evaluationCredits >= reportCount) {
        setStep('actual-analysis')
        await runActualAnalysis(preparedImages, installId, gender)
      } else {
        setPreviewDeadline(previewEnds)
      }
    } catch (caught) {
      trackWebEvent('photo_preparation_stage', { surface: 'web_analysis', step: 'entitlement_check', result: 'failed',
        reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed',
        http_status: caught instanceof ApiClientError ? caught.status : undefined,
      })
      setStep('upload')
      setError(caught instanceof Error ? caught.message : 'Unable to check your scan credits. Please try again.')
    }
  }

  function goToCapture(next: DesktopCaptureStep) {
    setDesktopDirection(desktopCaptureSteps.indexOf(next) < desktopCaptureSteps.indexOf(captureStep) ? -1 : 1)
    setCaptureStep(next)
    setError(null)
    setSelectedImageId(images.find(image => next === 'side' ? image.view === 'side' : image.view !== 'side')?.id ?? null)
  }

  function advanceDesktopSetup() {
    completeStep()
    setDesktopDirection(1)
    if (setupIndex === setupSteps.length - 1) {
      setCaptureStep('front')
      setStep('upload')
    } else setSetupIndex(setupIndex + 1)
  }

  function goBackDesktopSetup() {
    setDesktopDirection(-1)
    setSetupIndex(setupIndex - 1)
  }

  function advanceDesktopCapture() {
    if (captureStep !== 'front') {
      void startPseudoAnalysis()
      return
    }
    completeStep()
    goToCapture('side')
  }

  function retakePhoto() {
    if (!mobileScan) {
      goToCapture('review')
      setStep('upload')
      return
    }
    setImages([])
    setSelectedImageId(null)
    setImageFramePositions({})
    setReturnOfferSessionId(null)
    setReturnProduct(undefined)
    setError(null)
    setStep('upload')
  }

  function selectSamplePhoto() {
    const sample: AnalysisDraftImage = { id: 'walkthrough', name: 'Sample portrait', dataUrl: '/scan/welcome.jpg', landmarks: sampleLandmarks as FaceLandmarksPayload }
    setImages([sample])
    setSelectedImageId(sample.id)
    setError(null)
  }

  function beginAssessment() {
    completeStep()
    setStep('upload')
  }

  function changePlans(open: boolean) {
    setPaymentDialogOpen(open)
    if (!open && basicReport) setStep('basic-report')
  }

  const generateBasic = useCallback(async (photos: AnalysisDraftImage[]) => {
    setCheckoutStatus('Preparing your Basic report…')
    setError(null)
    setStep('actual-analysis')
    setPaymentDialogOpen(true)
    try {
      const front = photos.find(image => image.view !== 'side')
      const side = photos.find(image => image.view === 'side')
      if (!front || !side) throw new Error('Add a front and side photo to continue.')
      const report = await apiPost<BasicReportData>('/api/web/basic-preview', { front: front.dataUrl, side: side.dataUrl, consent: true })
      setBasicReport(report)
      setPaymentDialogOpen(false)
      setStep('basic-report')
      basicResume.current = true
      void router.replace('/analysis?basic=1', undefined, { shallow: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open your Basic report. Please try again.')
    } finally {
      setCheckoutStatus(null)
    }
  }, [router])

  useEffect(() => {
    if (mobileScan || !router.isReady || router.query.basic !== '1' || status !== 'authenticated' || basicResume.current) return
    basicResume.current = true
    void (async () => {
      try {
        const [{ report }, draft] = await Promise.all([
          apiGet<{ report: BasicReportData | null }>('/api/web/basic-preview'),
          loadAnalysisDraft().catch(() => null),
        ])
        if (draft?.images.length) {
          setImages(draft.images)
          setGender(draft.gender)
          setPreferences(draft.preferences ?? {})
          setPrivacyAccepted(Boolean(draft.desktopConsent))
          setCaptureStep('review')
        }
        if (report) {
          setBasicReport(report)
          setStep('basic-report')
        } else if (draft?.desktopConsent) {
          await generateBasic(draft.images)
        }
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : 'Couldn’t restore your Basic report.')
      }
    })()
  }, [generateBasic, mobileScan, router.isReady, router.query.basic, status])

  function beginDesktopScan(photos: AnalysisDraftImage[], runWithCredits?: () => void) {
    setAutoPaywall(false)
    setPaymentDialogOpen(false)
    setAnalysisUnlocked(Boolean(runWithCredits))
    setProgress(1)
    afterDesktopScan.current = runWithCredits ?? null
    setSidePortrait(photos.find(photo => photo.view === 'side') ?? null)
    setStep('desktop-scan')
  }

  const finishDesktopScan = useCallback(() => {
    const runWithCredits = afterDesktopScan.current
    afterDesktopScan.current = null
    setStep('actual-analysis')
    if (runWithCredits) runWithCredits()
    else setAutoPaywall(true)
  }, [])

  const showPlans = useCallback(() => {
    setAutoPaywall(false)
    if (desktopPreview) completeStep()
    setPaymentDialogOpen(true)
  }, [completeStep, desktopPreview])

  const openPlansRef = useRef(showPlans)
  useEffect(() => { openPlansRef.current = showPlans }, [showPlans])
  useEffect(() => {
    if (!desktopPreview || !autoPaywall || paymentDialogOpen) return
    const timer = window.setTimeout(() => openPlansRef.current(), 10_000)
    return () => window.clearTimeout(timer)
  }, [desktopPreview, autoPaywall, paymentDialogOpen])

  useEffect(() => {
    if (step !== 'preview-analysis' || previewDeadline === null) return
    const timer = window.setTimeout(() => {
      setAnalysisUnlocked(false)
      setStep('actual-analysis')
    }, Math.max(0, previewDeadline - Date.now()))
    return () => window.clearTimeout(timer)
  }, [step, previewDeadline])

  const [walkthroughProcessing, setWalkthroughProcessing] = useState(false)
  useEffect(() => {
    if (!walkthroughProcessing) return
    const finish = window.setTimeout(() => {
      const front = images.find(image => image.view !== 'side')
      setResults([mobileScan ? sampleWalkthroughReport : desktopWalkthroughReport(front)])
      if (!mobileScan) setSidePortrait(images.find(image => image.view === 'side') ?? sampleDesktopSide)
      setWalkthroughProcessing(false)
      setStep('results')
    }, mobileScan ? 7600 : 5200)
    return () => window.clearTimeout(finish)
  }, [images, mobileScan, walkthroughProcessing])

  const runActualAnalysis = useCallback(async (draftImages: AnalysisDraftImage[], paymentInstallId: string, analysisGender: 'male' | 'female' | 'other', requestIds?: string[]) => {
    const frontImages = draftImages.filter(image => image.view !== 'side')
    const side = draftImages.find(image => image.view === 'side')
    if (frontImages.length === 0) {
      setStep('upload')
      setError('Upload an image before starting analysis.')
      return
    }
    if (analysisRunningRef.current) return
    analysisRunningRef.current = true
    failedScanRequest.current = null
    setProgress(1)

    const analyticsStarted = Date.now()
    const attemptId = crypto.randomUUID()
    const analytics = { attempt_id: attemptId, evaluation_id: attemptId, flow_id: webJourneyContext().flow_id, surface: 'web_analysis' }
    trackWebEvent('evaluation_started', analytics)
    let requestId = ''
    try {
      const analysisResults: AnalysisResponse[] = []

      for (const [index, image] of frontImages.entries()) {
        requestId = requestIds?.[index] ?? crypto.randomUUID()
        setScanRequest(requestId)
        const result = await apiPost<AnalysisResponse>('/api/web/analyze', {
          imageData: image.dataUrl,
          ...(side && index === 0 ? { sideImageData: side.dataUrl } : {}),
          gender: analysisGender,
          photoType: 'face',
          name: image.name,
          hairColor: image.hairColor ?? null,
          skinColor: image.skinColor ?? null,
          landmarks: image.landmarks ?? null,
          mesh: image.mesh ?? null,
        }, {
          headers: { ...buildPaidAnalysisHeaders(paymentInstallId), 'x-mogging-flow-id': analytics.flow_id || '', 'x-mogging-evaluation-id': attemptId, 'x-mogging-request-id': requestId },
        })
        if (result.analysis.status !== 'complete') {
          failedScanRequest.current = requestId
          throw new Error(result.analysis.failureReason ?? 'Unable to complete this analysis. Please retry.')
        }
        analysisResults.push(result)
      }

      setProgress(3)
      setSidePortrait(side ?? null)
      if (side) await saveAnalysisSidePhoto(analysisResults[0].analysis.id, side).catch(() => {
        toast.info('The side photo is available for this session.')
      })
      setResults(analysisResults)
      trackWebEvent('evaluation_completed', { ...analytics, report_id: analysisResults[0]?.analysis.id, duration_ms: Date.now() - analyticsStarted })
      setStep('results')
      await clearAnalysisDraft().catch(() => {})
      return analysisResults[0]?.analysis.id
    } catch (analysisError) {
      trackWebEvent('evaluation_failed', { ...analytics, duration_ms: Date.now() - analyticsStarted, reason_code: analysisError instanceof ApiClientError ? analysisError.code : failedScanRequest.current ? 'evaluation_failed' : 'request_failed', http_status: analysisError instanceof ApiClientError ? analysisError.status : undefined })
      setStep('actual-analysis')
      setError(analysisError instanceof Error ? analysisError.message : 'Analysis failed')
    } finally {
      setScanRequest(null)
      analysisRunningRef.current = false
    }
  }, [])

  const startCheckout = useCallback(async (product: AnalysisPurchase, quote: CheckoutQuote) => {
    if (walkthrough) {
      setPaymentDialogOpen(false)
      if (!mobileScan) {
        setWalkthroughCheckout(true)
        return
      }
      setAnalysisUnlocked(true)
      setProgress(1)
      setOfferInstall(true)
      setWalkthroughProcessing(true)
      return
    }
    if (checkoutInFlight.current || status === 'loading') return
    const { experiment, ...paymentQuote } = quote
    const guestCheckout = status !== 'authenticated'

    checkoutInFlight.current = true
    setCheckoutStatus(guestCheckout ? 'Saving your photos…' : 'Checking scan access…')
    setError(null)
    const checkoutImageCount = images.filter(image => image.view !== 'side').length
    const attemptId = crypto.randomUUID()
    const purchaseContext = { surface: 'web_analysis', flow_id: webJourneyContext().flow_id, attempt_id: attemptId, product, paywall_version: mobileScan ? '2' : '3', ...paywallExperimentProperties(experiment) }
    let checkoutStage = guestCheckout ? 'draft_save' : 'entitlements'
    trackWebEvent('purchase_started', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })

    try {
      const paymentInstallId = ensureAnalysisWebInstallId()
      if (!guestCheckout) {
        const access = await apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(paymentInstallId)}`)
        if (access.entitlements.evaluationCredits >= checkoutImageCount) {
          trackWebEvent('purchase_reconciled', { ...purchaseContext, provider: 'stripe', result: 'existing_access' })
          setAnalysisUnlocked(true)
          setPaymentDialogOpen(false)
          setStep('actual-analysis')
          await runActualAnalysis(images, paymentInstallId, gender)
          return
        }
        if (product !== 'evaluation' && product !== 'evaluation_pack_3' && (access.entitlements.subscription.active || access.entitlements.subscription.tier)) {
          setError('Your membership is already active. Use your next scan when your allowance refreshes.')
          return
        }
      }
      checkoutStage = 'draft_save'
      setCheckoutStatus('Saving your photos…')
      trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })
      const draft = { gender, images, savedAt: Date.now(), ...(!mobileScan ? { preferences, desktopConsent: privacyAccepted } : {}) }
      await saveAnalysisDraft(draft)
      checkoutStage = 'checkout_create'
      setCheckoutStatus('Preparing secure checkout…')
      trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })
      const subscription = product !== 'evaluation' && product !== 'evaluation_pack_3'
      const response = await apiPost<CheckoutResponse>(subscription ? '/api/payments/web-checkout' : '/api/payments/checkout', {
        ...(subscription ? { product, returnTo: 'analysis', source: 'web_analysis', ...(mobileScan && isWebAnalysisProduct(product) ? { webPriceVariant: 'mobile' } : {}) } : {}),
        imageCount: checkoutImageCount,
        mobileInstallId: paymentInstallId,
        ...paymentQuote, ...(subscription && experiment ? { paywallExperimentId: experiment.id, paywallExperimentUnit: experiment.unit } : {}), ...(guestCheckout ? { guestCheckout: true } : {}), attemptId, paywallVersion: purchaseContext.paywall_version, flowId: webJourneyContext().flow_id, flowVersion: webJourneyContext().flow_version, entryMode: experiment?.kind === 'onboarding' ? 'onboarding_first' : webJourneyContext().entry_mode,
      })
      checkoutStage = 'checkout_redirect'
      setCheckoutStatus('Opening Stripe…')
      if (response.sessionId) {
        await saveCheckoutAnalysisDraft(response.sessionId, { ...draft, requestIds: Array.from({ length: checkoutImageCount }, () => crypto.randomUUID()) })
        rememberStripeAttempt('web_analysis', { attempt_id: attemptId, product, flow_id: webJourneyContext().flow_id, sessionId: response.sessionId })
        trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: 'checkout_redirect' })
        void flushWebAnalytics()
      }
      window.location.href = response.url
    } catch (checkoutError) {
      trackWebEvent('purchase_failed', { ...purchaseContext, purchase_stage: checkoutStage, reason_code: checkoutError instanceof ApiClientError ? checkoutError.code : checkoutStage === 'draft_save' ? 'draft_storage_unavailable' : 'request_failed', http_status: checkoutError instanceof ApiClientError ? checkoutError.status : undefined })
      setError(checkoutError instanceof ApiClientError ? checkoutError.message : checkoutStage === 'draft_save' ? 'Your browser could not save your photos for checkout. Free up storage or try a regular browser window, then retry. You have not been charged.' : 'Unable to open checkout. Please check your connection and retry.')
    } finally {
      checkoutInFlight.current = false
      setCheckoutStatus(null)
    }
  }, [gender, images, mobileScan, preferences, privacyAccepted, runActualAnalysis, status, walkthrough])

  const resumeAfterPayment = useCallback(async (sessionId: string, retryRequestId?: string | null) => {
    const purchase = readStripeAttempt('web_analysis', sessionId)
    if (purchase?.flow_id) restoreWebJourney(purchase.flow_id)
    let confirmed = false
    try {
      setError(null)
      setLoginOpen(false)
      setAutoPaywall(false)
      setAnalysisUnlocked(true)
      setPaymentDialogOpen(false)
      setStep('actual-analysis')
      setProgress(0)
      const [confirmation, draft] = await Promise.all([
        apiPost<PaymentAccessResponse>('/api/payments/confirm', { sessionId }),
        loadCheckoutAnalysisDraft(sessionId).then(saved => saved ?? (!guestReturn ? loadAnalysisDraft() : null)).catch(() => null),
      ])
      confirmed = true
      if (confirmation.analytics?.flow_id) restoreWebJourney(confirmation.analytics.flow_id)
      if (activatedCheckout.current !== sessionId) {
        activatedCheckout.current = sessionId
        const activation = { surface: 'web_analysis', provider: 'stripe', ...stripeAttemptProperties(purchase), ...confirmation.analytics }
        if (guestReturn) trackWebEvent('account_authenticated', { ...activation, auth_stage: 'post_payment' })
        trackWebEvent('purchase_activated', activation)
      }
      if (session?.user?.id) void mutate(['/api/payments/entitlements', session.user.id])
      const installId = ensureAnalysisWebInstallId(confirmation.entitlements.mobileInstallId)
      if (!draft?.images.length) {
        await router.replace('/analysis?start=1&resumePhoto=1', undefined, { shallow: true })
        clearStripeAttempt('web_analysis')
        setStep('upload')
        setError('Your payment is confirmed. Please upload your photo to use your scan credit.')
        return
      }
      setImages(draft.images)
      setSelectedImageId(draft.images[draft.images.length - 1]?.id ?? null)
      setGender(draft.gender)
      setPreferences(draft.preferences ?? {})
      setPrivacyAccepted(Boolean(draft.desktopConsent))
      setCaptureStep('review')
      const requestIds = draft.images.filter(image => image.view !== 'side').map((image, index) => {
        const id = draft.requestIds?.[index] ?? image.id
        return id === retryRequestId ? crypto.randomUUID() : id
      })
      if (!draft.requestIds || retryRequestId) {
        await saveCheckoutAnalysisDraft(sessionId, { ...draft, requestIds })
      }
      const reportId = await runActualAnalysis(draft.images, installId, draft.gender, requestIds)
      if (!reportId) return
      loadedAnalysisIdRef.current = reportId
      await router.replace({ pathname: '/analysis', query: { analysisId: reportId } }, undefined, { shallow: true, scroll: false })
      if (purchase) clearStripeAttempt('web_analysis')
      await clearCheckoutAnalysisDraft(sessionId).catch(() => {})
    } catch (caught) {
      if (!confirmed) trackWebEvent('purchase_activation_failed', { surface: 'web_analysis', ...stripeAttemptProperties(purchase), purchase_stage: 'checkout_return', reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed', http_status: caught instanceof ApiClientError ? caught.status : undefined })
      const message = caught instanceof Error ? caught.message : 'Unable to restore your purchase. Please try again.'
      setError(message)
    }
  }, [guestReturn, mutate, router, runActualAnalysis, session?.user?.id])

  function retryAnalysis() {
    if (checkoutSessionId) void resumeAfterPayment(checkoutSessionId, failedScanRequest.current)
    else setStep('upload')
  }

  const verifyGuestPayment = useCallback(async (sessionId: string) => {
    setGuestPaymentState('checking')
    setError(null)
    try {
      const response = await apiPost<{ requiresSignIn?: boolean }>('/api/payments/confirm', { sessionId })
      if (!response.requiresSignIn) throw new Error('Could not verify this purchase')
      const attempt = readStripeAttempt('web_analysis', sessionId)
      if (attempt?.flow_id) restoreWebJourney(attempt.flow_id)
      setGuestPaymentState('verified')
    } catch (error) {
      setGuestPaymentState('failed')
      setError(error instanceof ApiClientError && error.status === 409
        ? 'Stripe is still confirming your payment. Try checking again in a moment.'
        : 'We couldn’t verify this purchase here. Use the browser you paid in, or contact support with your Stripe receipt.')
    }
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const sessionId = checkoutSessionId
    if (!sessionId || resumedCheckoutRef.current === sessionId) return
    if (status === 'unauthenticated') {
      if (guestReturn) {
        if (resumedCheckoutRef.current === `guest:${sessionId}`) return
        resumedCheckoutRef.current = `guest:${sessionId}`
        void verifyGuestPayment(sessionId)
        return
      }
      setLoginCallback(router.asPath)
      setLoginOpen(true)
      return
    }
    if (status !== 'authenticated') return
    resumedCheckoutRef.current = sessionId
    void resumeAfterPayment(sessionId)
  }, [checkoutSessionId, guestReturn, resumeAfterPayment, router.asPath, router.isReady, status, verifyGuestPayment])

  useEffect(() => {
    if (!router.isReady || status !== 'authenticated' || router.query.resumePhoto !== '1') return
    let cancelled = false
    void loadAnalysisDraft().then(draft => {
      if (cancelled || !draft?.images.length) return
      setImages(current => current.length ? current : draft.images)
      setGender(draft.gender)
      setPreferences(draft.preferences ?? {})
      setPrivacyAccepted(Boolean(draft.desktopConsent))
      setCaptureStep('review')
    }).catch(() => {
      if (!cancelled) toast.error('Could not restore your photo. Please select it again.')
    })
    return () => { cancelled = true }
  }, [router.isReady, router.query.resumePhoto, status])

  useEffect(() => {
    const resumeOnEntry = step === 'intro' || (!mobileScan && (step === 'desktop-setup' || step === 'upload') && images.length === 0 && !startWithPhoto)
    if (!router.isReady || walkthrough || status !== 'authenticated' || router.query.checkout || router.query.analysisId || router.query.resumePhoto || router.query.basic || !resumeOnEntry) return
    let cancelled = false
    const installId = ensureAnalysisWebInstallId()
    void Promise.all([
      apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(installId)}`),
      loadAnalysisDraft(),
    ]).then(([access, draft]) => {
      if (cancelled) return
      if (!draft?.images.length || access.entitlements.evaluationCredits < 1) {
        if (mobileScan && access.entitlements.subscription.active) void router.replace('/app/home')
        return
      }
      setImages(draft.images)
      setSelectedImageId(draft.images[draft.images.length - 1]?.id ?? null)
      setGender(draft.gender)
      setPreferences(draft.preferences ?? {})
      setPrivacyAccepted(Boolean(draft.desktopConsent))
      setCaptureStep('review')
      setStep('upload')
      toast.info('Your paid scan is ready. Review your photo and continue.')
    }).catch(() => { /* The upload action checks access again before offering payment. */ })
    return () => { cancelled = true }
  }, [images.length, mobileScan, router, startWithPhoto, status, step, walkthrough])

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== 'cancelled') return
    let cancelled = false
    void loadAnalysisDraft().catch(() => null).then(draft => {
      if (cancelled) return
      const purchase = takeStripeAttempt('web_analysis')
      if (purchase?.flow_id) { restoreWebJourney(purchase.flow_id) }
      if (purchase) trackWebEvent('purchase_cancelled', { surface: 'web_analysis', provider: 'stripe', reason_code: 'checkout_return', ...stripeAttemptProperties(purchase) })
      void router.replace('/analysis', undefined, { shallow: true })
      if (!draft?.images.length) {
        setStep('upload')
        toast.info('Checkout was cancelled. Select a photo to continue.')
        return
      }
      setImages(draft.images)
      setSelectedImageId(draft.images.at(-1)?.id ?? null)
      setGender(draft.gender)
      setPreferences(draft.preferences ?? {})
      setPrivacyAccepted(Boolean(draft.desktopConsent))
      setCaptureStep('review')
      setAnalysisUnlocked(false)
      setStep('actual-analysis')
      setReturnOfferSessionId(purchase?.sessionId ?? null)
      setReturnProduct(purchase?.product)
      setPaymentDialogOpen(true)
      if (!mobileScan) toast.info('Checkout was cancelled. Your photo is ready to use.')
    })
    return () => { cancelled = true }
  }, [mobileScan, router])

  useEffect(() => {
    if (!router.isReady) return

    const analysisId = typeof router.query.analysisId === 'string' ? router.query.analysisId : null
    if (!analysisId || loadedAnalysisIdRef.current === analysisId) return

    loadedAnalysisIdRef.current = analysisId
    let cancelled = false
    setError(null)

    void apiGet<AnalysisResponse>(`/api/analysis/${encodeURIComponent(analysisId)}`)
      .then(async (result) => {
        const side = result.canManage ? await loadAnalysisSidePhoto(analysisId).catch(() => null) : null
        if (cancelled) return
        setSidePortrait(side)
        setResults([result])
        setStep('results')
        setImages([])
        setSelectedImageId(null)
        setImageFramePositions({})
        setShareUrl(null)
      })
      .catch((analysisError) => {
        if (cancelled) return
        setStep(entryStep)
        const message = analysisError instanceof ApiClientError ? analysisError.message : 'Unable to load analysis'
        setError(message)
        toast.error(message)
      })
    return () => { cancelled = true; loadedAnalysisIdRef.current = null }
  }, [entryStep, router.isReady, router.query.analysisId])

  async function createShare() {
    if (walkthrough) {
      toast.info('Sharing is disabled in the sample walkthrough.')
      return null
    }
    if (!primaryResult) return null

    try {
      setShareLoading(true)
      const response = await apiPost<ShareResponse>('/api/share/analysis', {
        analysisId: primaryResult.analysis.id,
        includeLeaderboard: true,
      })
      const url = `${window.location.origin}/share/${response.share.token}`
      setShareUrl(url)
      return url
    } catch (shareError) {
      toast.error(shareError instanceof ApiClientError ? shareError.message : 'Unable to create share link')
      return null
    } finally {
      setShareLoading(false)
    }
  }

  function removeImage(id: string) {
    setImages((current) => {
      const nextImages = current.filter((image) => image.id !== id)
      setLandmarkPendingIds((currentPending) => {
        const { [id]: _removed, ...nextPending } = currentPending
        return nextPending
      })
      setImageFramePositions((currentPositions) => {
        const { [id]: _removed, ...nextPositions } = currentPositions
        return nextPositions
      })
      setSelectedImageId((currentSelectedId) => {
        if (currentSelectedId !== id) return currentSelectedId

        return nextImages[nextImages.length - 1]?.id ?? null
      })
      return nextImages
    })
  }

  function addCameraImage(image: { dataUrl: string; name: string }) {
    const side = !mobileScan && captureStep === 'side'
    const replace = mobileScan ? undefined : images.find(item => (item.view === 'side') === side)
    if (images.length >= 3 && !replace) {
      setSelectedImageId(images[images.length - 1]?.id ?? null)
      return
    }

    const imageId = crypto.randomUUID()
    const nextImage: AnalysisDraftImage = {
      id: imageId,
      name: image.name,
      dataUrl: image.dataUrl,
      ...(side ? { view: 'side' as const } : {}),
      hairColor: null,
      skinColor: null,
      landmarks: null,
    }

    if (replace) removeImage(replace.id)
    setImages(current => [...current, nextImage].slice(0, 3))
    setSelectedImageId(imageId)
    setImageFramePositions((current) => ({ ...current, [imageId]: defaultFramePosition }))
    setLandmarkPendingIds((current) => ({ ...current, [imageId]: true }))
    void enrichImageLandmarks(nextImage)
  }

  async function enrichImageLandmarks(image: AnalysisDraftImage) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const started = performance.now()
    const enrich = async () => {
      const [{ detectWebAnalysisEvidence }, { inferHairColorFromDataUrl, inferSkinColorFromDataUrl }] = await Promise.all([
        import('@/lib/client/faceLandmarks'),
        import('@/lib/client/appearance'),
      ])
      const { detection, mesh } = await detectWebAnalysisEvidence(image.dataUrl, image.view === 'side')
      const landmarks = detection.status === 'detected' ? detection.landmarks : null
      const [hairColor, skinColor] = await Promise.all([
        inferHairColorFromDataUrl(image.dataUrl, landmarks),
        inferSkinColorFromDataUrl(image.dataUrl, landmarks),
      ])
      return { hairColor, skinColor, landmarks, mesh }
    }
    try {
      const evidence = await Promise.race([enrich(), new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 4500) })])
      if (evidence) {
        setImages(current => current.map(existing => existing.id === image.id && existing.dataUrl === image.dataUrl ? { ...existing, ...evidence } : existing))
      } else if (!walkthrough) {
        trackWebEvent('photo_preparation_stage', { surface: 'web_analysis', step: 'photo_enrichment', result: 'failed', reason_code: 'model_timeout', duration_ms: Math.round(performance.now() - started) })
      }
    } catch {
      if (!walkthrough) trackWebEvent('photo_preparation_stage', { surface: 'web_analysis', step: 'photo_enrichment', result: 'failed', reason_code: 'enrichment_failed' })
    } finally {
      clearTimeout(timeout)
      setLandmarkPendingIds(current => {
        const { [image.id]: _removed, ...nextPending } = current
        return nextPending
      })
    }
  }

  const scanFrame = useRef<HTMLElement>(null)
  const portraitStage = step === 'upload' ? 'review'
    : step === 'preview-analysis' || (step === 'actual-analysis' && analysisUnlocked) ? 'scanner'
    : (step === 'actual-analysis' || (step === 'results' && !offerInstall)) ? 'report' : null
  usePortraitHandoff(scanFrame, mobileScan ? portraitStage : null)

  const captureSurface = mobileScan && (step === 'upload' || cameraOpen)

  return (
    <div data-responsive-desktop={!mobileScan && !previewDevice || undefined} data-desktop-report={desktopReport || undefined} data-scan-step={step} data-capture-surface={captureSurface || undefined} data-desktop-onboarding={!mobileScan && step !== 'results' || undefined} className="scan-flow min-h-[calc(100svh-5rem)] w-full bg-white" data-mobile-scan={mobileScan || undefined} data-scan-preview={previewMobile || undefined}>
      <ScanPwaHead mobile={mobileScan && !walkthrough} dark={captureSurface} />
      {walkthrough && <div className="pointer-events-none fixed inset-x-0 top-1 z-[60] mx-auto w-fit rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-white">Sample walkthrough</div>}
      <SeoHead
        title={mobileScan && !walkthrough ? 'Mogging.com' : 'Mogging Analysis'}
        description="Upload your face photo and generate a private PSL report with facial feature annotations."
        path="/analysis"
      />
      <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" onChange={handleFiles} />

      {!mobileScan && <input ref={sideInputRef} className="hidden" type="file" accept="image/*" onChange={event => void handleFiles(event, true)} />}
      <MotionConfig reducedMotion="user"><LayoutGroup id="desktop-analysis">
      <section ref={scanFrame} className="public-frame relative min-h-[calc(100svh-5rem)] overflow-hidden bg-white">
        {walkthroughCheckout ? (
          <div className="assessment-columns public-gutters">
            <div className="assessment-copy">
              <p className="assessment-kicker">Walkthrough preview</p>
              <h1>Payment confirmed.</h1>
              <p>Sign in after checkout to save your purchase and open your report.</p>
              <Button className="mt-6 rounded-full px-6" onClick={() => {
                setWalkthroughCheckout(false)
                setAnalysisUnlocked(true)
                setProgress(2)
                setWalkthroughProcessing(true)
              }}>Open sample report <ArrowRight className="size-4" /></Button>
            </div>
            <motion.div layoutId="analysis-portrait" className="assessment-portrait assessment-media aspect-[4/5]">
              <ScanImagePanel imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage} landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null} variant="scanner" fit="cover" showLabel={false} paused />
            </motion.div>
          </div>
        ) : guestReturn && (status !== 'authenticated' || guestPaymentState === 'failed') ? (
          <ProcessScreen>
            <div className="mx-auto max-w-md text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">Private facial analysis</p>
              <h1 className="text-4xl font-semibold tracking-[-.055em]" role="status"><TextMorph>{guestPaymentState === 'verified' ? 'Payment confirmed' : guestPaymentState === 'failed' || typeof router.query.session_id !== 'string' ? 'Check your purchase' : 'Confirming payment'}</TextMorph></h1>
              <p className="mt-4 text-sm leading-6 text-zinc-600">{error ?? (guestPaymentState === 'verified' ? 'Sign in to save your purchase and open your analysis.' : typeof router.query.session_id === 'string' ? 'This usually takes a moment.' : 'Open the return link from your checkout to continue.')}</p>
              {guestPaymentState === 'checking' && <div className="mx-auto mt-5 max-w-60"><AnalysisProgress label="Verifying with Stripe…" /></div>}
              {guestPaymentState === 'verified' && <Button className="mt-6 rounded-full px-6" onClick={() => {
                setCheckoutSignIn(true)
                setLoginCallback(router.asPath)
                trackWebEvent('account_auth_started', { surface: 'web_analysis', auth_stage: 'post_payment' })
                setLoginOpen(true)
              }}>Sign in to continue <ArrowRight className="size-4" /></Button>}
              {guestPaymentState === 'failed' && typeof router.query.session_id === 'string' && <Button className="mt-6 rounded-full px-6" onClick={() => {
                const sessionId = String(router.query.session_id)
                if (status === 'authenticated') { setGuestPaymentState('checking'); void resumeAfterPayment(sessionId) }
                else void verifyGuestPayment(sessionId)
              }}>Check payment again</Button>}
            </div>
          </ProcessScreen>
        ) : <AnimatePresence initial={mobileScan} mode={step === 'story' ? 'wait' : 'popLayout'}>
          {step === 'intro' && mobileScan ? (
            <ScreenMotion key="intro" managedMotion>
              <MobileScanWelcome onBegin={() => setStep('story')} onSignIn={() => {
                setLoginCallback(router.asPath)
                setLoginOpen(true)
              }} />
            </ScreenMotion>
          ) : null}

          {step === 'story' ? (
            <ScreenMotion key="story" managedMotion>
              <MobileScanOnboarding experiment={onboardingExperiment} analyticsEnabled={!walkthrough} onComplete={profile => {
                setGender(profile)
                beginAssessment()
              }} />
            </ScreenMotion>
          ) : null}

          {!mobileScan && (step === 'desktop-setup' || step === 'upload') ? (
            <ScreenMotion key="desktop-onboarding" managedMotion>
              {step === 'desktop-setup' ? <DesktopSetup step={setupStep} setupSteps={setupSteps} direction={desktopDirection}
                privacy={{ accepted: privacyAccepted, notice: desktopConsentNotice }}
                gender={chosenProfile} preferences={preferences} country={country}
                background={background} onBackground={setBackground}
                onGender={value => { setChosenProfile(value); setGender(value) }} onPreferences={setPreferences}
                onBack={setupIndex > 0 && !startWithPhoto ? goBackDesktopSetup : undefined} onContinue={advanceDesktopSetup} />
              : <DesktopCapture step={captureStep} setupSteps={setupSteps} direction={desktopDirection} images={images} selected={selectedImage ?? undefined}
                position={selectedImage ? imageFramePositions[selectedImage.id] ?? defaultFramePosition : defaultFramePosition}
                photoStatus={desktopPhotoStatus ?? preparingScan ?? (captureStep !== 'front' && isPreparingUploads ? 'Finding facial landmarks…' : null)}
                frontLandmarksPending={captureStep === 'front' && isPreparingUploads} canSubmit={canStart && (privacyAccepted || inlineConsent || walkthrough)} error={error} onSelect={setSelectedImageId}
                submitLabel={inlineConsent ? 'Agree and scan my photos' : undefined}
                consent={!walkthrough && desktopArm !== 'control' && desktopConsentNotice}
                onPosition={position => {
                  if (selectedImage) setImageFramePositions(current => ({ ...current, [selectedImage.id]: position }))
                }}
                onBack={captureStep !== 'front' ? () => goToCapture(captureStep === 'side' ? 'front' : 'side')
                  : !startWithPhoto ? () => { setDesktopDirection(-1); setSetupIndex(setupSteps.length - 1); setStep('desktop-setup') } : undefined}
                onContinue={advanceDesktopCapture} onChooseFront={() => {
                  if (captureStep === 'front' && images.some(image => image.view !== 'side')) setDesktopPhotoStatus('Choose a replacement photo…')
                  uploadInputRef.current?.click()
                }} onChooseSide={() => sideInputRef.current?.click()}
                onCamera={() => setCameraOpen(true)}
                onRemove={id => {
                  removeImage(id)
                  const removed = images.find(image => image.id === id)
                  goToCapture(removed?.view === 'side' ? 'side' : 'front')
                }} />}
            </ScreenMotion>
          ) : null}

          {step === 'upload' && mobileScan ? (
            <ScreenMotion key="upload" managedMotion>
              <MobileUploadScreen isPreparingUploads={isPreparingUploads}
                previewImage={previewImage} imagePosition={selectedImage ? imageFramePositions[selectedImage.id] ?? defaultFramePosition : defaultFramePosition}
                selectedImageId={selectedImage?.id ?? null} canStart={canStart}
                onCamera={() => setCameraOpen(true)} onUseSample={walkthrough ? () => selectSamplePhoto() : undefined}
                onImagePositionChange={position => {
                  if (selectedImage) setImageFramePositions(current => ({ ...current, [selectedImage.id]: position }))
                }}
                onRemove={removeImage} onStart={startPseudoAnalysis} onUpload={() => {
                  if (!walkthrough) trackWebEvent('photo_source_selected', { surface: 'web_analysis', source: 'picker', placement: 'upload' })
                  uploadInputRef.current?.click()
                }} />
            </ScreenMotion>
          ) : null}

          {!mobileScan && step === 'desktop-scan' && <ScreenMotion key="desktop-scan" managedMotion>
            <DesktopPortraitScan front={images.find(image => image.view !== 'side')} side={images.find(image => image.view === 'side')} onComplete={finishDesktopScan} />
          </ScreenMotion>}

          {step === 'preview-analysis' ? (
            <ScreenMotion key="preview-analysis" managedMotion={mobileScan}>
              <ActualAnalysisScreen preparingPreview
                mobileScan={mobileScan}
                onboardingExperiment={onboardingExperiment}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={retryAnalysis}
                imageCount={reportCount}
                checkoutError={error}
                checkoutStatus={checkoutStatus}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                paymentDialogOpen={paymentDialogOpen}
                progress={scanStage}
                onCheckout={startCheckout}
                onPaymentDialogChange={changePlans}
                onPaymentRequired={showPlans}
              />
            </ScreenMotion>
          ) : null}

          {step === 'payment' ? (
            <ScreenMotion key="payment">
              <ActualAnalysisScreen
                mobileScan={mobileScan}
                onboardingExperiment={onboardingExperiment}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={retryAnalysis}
                imageCount={reportCount}
                checkoutError={error}
                checkoutStatus={checkoutStatus}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                paymentDialogOpen={paymentDialogOpen}
                progress={scanStage}
                onCheckout={startCheckout}
                onPaymentDialogChange={changePlans}
                onPaymentRequired={showPlans}
              />
            </ScreenMotion>
          ) : null}

          {step === 'actual-analysis' ? (
            <ScreenMotion key="actual-analysis" managedMotion>
              <ActualAnalysisScreen
                mobileScan={mobileScan}
                onboardingExperiment={onboardingExperiment}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={retryAnalysis}
                imageCount={reportCount}
                checkoutError={error}
                checkoutStatus={checkoutStatus}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                returnProduct={returnProduct ?? preferredPlan}
                frontPhoto={images.find(image => image.view !== 'side')}
                sidePhoto={images.find(image => image.view === 'side')}
                basicValues={basicReport?.values}
                paymentDialogOpen={paymentDialogOpen}
                progress={scanStage}
                onCheckout={startCheckout}
                onPaymentDialogChange={changePlans}
                onPaymentRequired={showPlans}
              />
            </ScreenMotion>
          ) : null}

          {step === 'basic-report' && basicReport ? <ScreenMotion key="basic-report">
            <BasicReport report={basicReport} canUpgrade={images.length > 0} onUpgrade={() => {
              setAnalysisUnlocked(false)
              if (!images.length) {
                setCaptureStep('front')
                setStep('upload')
                return
              }
              setStep('actual-analysis')
              setPaymentDialogOpen(true)
            }} />
          </ScreenMotion> : null}

          {step === 'results' && offerInstall ? (
            <ScreenMotion key="install">
              <ScanInstallGuide onContinue={() => setOfferInstall(false)} onOpenApp={() => void router.push(walkthrough ? '/app/home?preview=1' : '/app/home')} />
            </ScreenMotion>
          ) : null}

          {step === 'results' && !offerInstall ? (
            <ScreenMotion key="results" managedMotion={mobileScan}>
              <ProcessScreen wide>
                {mobileScan && <button type="button" className="scan-retake" aria-label="Close report" onClick={() => void router.push(walkthrough ? '/app/home?preview=1' : '/app/home')}><X size={20} /></button>}
                <ResultsStep
                  mobileScan={mobileScan}
                  country={walkthrough ? 'US' : country}
                  primaryScore={primaryScore}
                  results={results}
                  sidePortrait={!mobileScan ? sidePortrait : null}
                  initialCategoryId={!mobileScan ? getDesktopReportFocus(preferences) : undefined}
                  onOpenShare={walkthrough ? () => toast.info('This sample report is available only in the walkthrough.') : () => setShareOpen(true)}
                />
                {mobileScan && <div className="mobile-report-share-dock">
                  <button type="button" className="mobile-report-share-button" onClick={() => setShareOpen(true)}>
                    <Share2 size={18} aria-hidden="true" /> Share report
                  </button>
                </div>}
              </ProcessScreen>
            </ScreenMotion>
          ) : null}
        </AnimatePresence>}
      </section>

      <ShareSheet
        open={shareOpen}
        result={primaryResult ?? null}
        shareUrl={shareUrl}
        loading={shareLoading}
        onClose={() => setShareOpen(false)}
        onCreate={createShare}
      />
      {(mobileScan || cameraOpen) ? (
        <CameraSheet
          analyticsEnabled={!walkthrough}
          fullscreen={mobileScan}
          desktop={!mobileScan}
          side={!mobileScan && captureStep === 'side'}
          open={cameraOpen}
          onCapture={addCameraImage}
          onClose={() => setCameraOpen(false)}
          onUpload={() => {
            if (!walkthrough) trackWebEvent('photo_source_selected', { surface: 'web_analysis', source: 'picker', placement: 'camera' })
            setCameraOpen(false)
            const input = !mobileScan && captureStep === 'side' ? sideInputRef : uploadInputRef
            input.current?.click()
          }}
        />
      ) : null}
      </LayoutGroup></MotionConfig>
      <LoginDialog
        open={loginOpen}
        audience={checkoutSignIn ? 'analysis-checkout' : undefined}
        onOpenChange={setLoginOpen}
        callbackUrl={loginCallback}
      />
    </div>
  )
}

const ScreenMotion = forwardRef<HTMLDivElement, { children: ReactNode; managedMotion?: boolean }>(function ScreenMotion({ children, managedMotion }, ref) {
  const reduced = useReducedMotion()
  const skipMotion = managedMotion || reduced
  return (
    <motion.div
      ref={ref}
      className="scan-screen min-h-[calc(100svh-5rem)]"
      initial={skipMotion ? false : { opacity: 0, y: 18, scale: 0.992 }}
      animate={skipMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      exit={skipMotion ? undefined : { opacity: 0, y: -14, scale: 0.992 }}
      transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
    >
      <AnimatePresence propagate>{children}</AnimatePresence>
    </motion.div>
  )
})

function MobileUploadScreen({ canStart, imagePosition, isPreparingUploads, onCamera, onImagePositionChange, onRemove, onStart, onUpload, onUseSample, previewImage, selectedImageId }: {
  canStart: boolean
  imagePosition: CaptureFrameImagePosition
  isPreparingUploads: boolean
  onCamera: () => void
  onImagePositionChange: (position: CaptureFrameImagePosition) => void
  onRemove: (id: string) => void
  onStart: () => void
  onUpload: () => void
  onUseSample?: () => void
  previewImage: string | null
  selectedImageId: string | null
}) {
  const feedback = useScanFeedback()
  return (
    <motion.div className="mobile-capture-screen" variants={scanSequence} initial="enter" animate="visible" exit="leave">
      {previewImage && <div data-scan-portrait="review" className="mobile-capture-photo">
        <CaptureFrame bare className="!absolute !inset-0 !h-full !max-w-none !rounded-none !shadow-none"
          imageSrc={previewImage} imageAlt="Your selected photo" imagePosition={imagePosition}
          onImagePositionChange={onImagePositionChange} />
      </div>}
      <div className="guided-scan-shade" aria-hidden="true" />
      <motion.div variants={scanPart} custom={0}><MobileCaptureChrome /></motion.div>
      {!previewImage && <motion.div className="mobile-capture-permission" variants={scanPart}>
        <h2>Add a front-facing photo</h2>
        <p>Take a photo or choose one from your library.</p>
        {onUseSample && <button type="button" className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm" onClick={onUseSample}>Use sample photo</button>}
      </motion.div>}
      <AnimatePresence mode="wait">
        <motion.div key={previewImage ? 'review-actions' : 'capture-actions'} className="mobile-capture-dock" variants={scanPart} custom={20}>
          <motion.button type="button" className="mobile-capture-icon" aria-label="Choose a photo from your library"
            whileTap={{ scale: .94 }} onClick={() => { feedback(); onUpload() }}><ImagePlus size={24} /></motion.button>
          {previewImage ? <>
            <motion.button type="button" className="mobile-capture-primary" disabled={!canStart}
              whileTap={{ scale: .95 }} onClick={() => { feedback('action'); onStart() }}>
              {isPreparingUploads ? <Loader2 size={21} className="animate-spin" /> : <ScanFace size={21} />} Use photo
            </motion.button>
            <motion.button type="button" className="mobile-capture-icon" aria-label="Retake photo" whileTap={{ scale: .94 }}
              onClick={() => { feedback(); if (selectedImageId) onRemove(selectedImageId) }}><RotateCcw size={22} /></motion.button>
          </> : <motion.button type="button" className="mobile-capture-primary" whileTap={{ scale: .95 }}
            onClick={() => { feedback('action'); onCamera() }}><Camera size={17} /> Open camera</motion.button>}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function ProcessScreen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid min-h-[calc(100svh-5rem)] ${wide ? '' : 'place-items-center p-4 sm:p-8'}`}>
      <div className={`w-full ${wide ? '' : 'max-w-xl'}`}>{children}</div>
    </div>
  )
}

function ActualAnalysisScreen({
  preparingPreview = false,
  frontPhoto,
  sidePhoto,
  basicValues,
  mobileScan,
  onboardingExperiment,
  walkthrough,
  onRetake,
  onRetry,
  imageCount,
  checkoutError,
  checkoutStatus,
  imageSrc,
  isUnlocked,
  landmarks,
  onCheckout,
  onPaymentDialogChange,
  onPaymentRequired,
  paymentDialogOpen,
  returnOfferSessionId,
  returnProduct,
  progress,
}: {
  onboardingExperiment?: PaywallExposure | null
  preparingPreview?: boolean
  frontPhoto?: AnalysisDraftImage
  sidePhoto?: AnalysisDraftImage
  basicValues?: BasicReportData['values']
  mobileScan: boolean
  walkthrough: boolean
  onRetake: () => void
  onRetry: () => void
  imageCount: number
  checkoutError: string | null
  checkoutStatus: string | null
  imageSrc: string | null
  isUnlocked: boolean
  landmarks: FaceLandmarksPayload | null
  onCheckout: (product: AnalysisPurchase, quote: CheckoutQuote) => void
  onPaymentDialogChange: (open: boolean) => void
  onPaymentRequired: () => void
  paymentDialogOpen: boolean
  returnOfferSessionId: string | null
  returnProduct?: string
  progress: number
}) {
  const feedback = useScanFeedback()
  const processingLabel = ['Confirming your payment…', 'Preparing your photos…', 'Generating your full report…', 'Opening your report…'][progress]
  if (mobileScan && (isUnlocked || preparingPreview)) return (
    <motion.div className="mobile-scan-processing" initial={{ backgroundColor: '#121212' }} animate={{ backgroundColor: '#030303' }}>
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .48, delay: .4 }}>
        <h1>{preparingPreview ? 'Facial scan' : 'Your analysis'}</h1>
        <p>{preparingPreview ? 'Anchoring detected landmarks' : 'Private facial analysis'}</p>
      </motion.header>
      <div data-scan-portrait="scanner" className="mobile-scan-processing-photo">
        <ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} variant="scanner" fit="cover" showLabel={false} />
      </div>
      <motion.div className="mobile-scan-processing-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .45, delay: .58 }} role="status">
        {checkoutError ? <>
          <strong>Evaluation paused</strong><p>{checkoutError}</p>
          <motion.button type="button" className="mobile-capture-primary" whileTap={{ scale: .95 }} onClick={() => { feedback('action'); onRetry() }}>Retry evaluation</motion.button>
        </> : preparingPreview ? <p className="mobile-scan-shimmer">Mapping facial landmarks</p> : <AnalysisProgress label={processingLabel} stage={progress} />}
      </motion.div>
    </motion.div>
  )

  return (
    <>
      {!isUnlocked ? mobileScan
        ? <LockedReportPreview imageSrc={imageSrc ?? previewPhotoUrl} landmarks={landmarks} onUnlock={onPaymentRequired} onRetake={onRetake} />
        : <DesktopAssessmentPreview imageSrc={imageSrc ?? previewPhotoUrl} landmarks={landmarks} front={frontPhoto} side={sidePhoto} basicValues={basicValues} onUnlock={onPaymentRequired} /> : (
        checkoutError ? <ProcessScreen>
          <div className="grid justify-items-center gap-4 text-center" role="alert">
            <h1 className="text-2xl font-semibold">Your analysis is paused</h1>
            <p className="text-sm text-zinc-600">{checkoutError}</p>
            <Button onClick={onRetry}>Try again</Button>
          </div>
        </ProcessScreen> : imageSrc
          ? <DesktopPortraitScan front={frontPhoto} side={sidePhoto} processing={{ stage: progress, label: processingLabel }} />
          : <ProcessScreen><div className="mx-auto w-full max-w-60 text-center"><AnalysisProgress label={processingLabel} stage={progress} /></div></ProcessScreen>
      )}

      <AnalysisUnlockDialog
        walkthrough={walkthrough}
        fullscreen={mobileScan}
        desktopAnalysis={!mobileScan && !isUnlocked}
        webCatalog
        onboardingExperiment={onboardingExperiment}
        initialProduct={returnProduct}
        imageCount={imageCount}
        imageSrc={imageSrc}
        landmarks={landmarks}
        error={checkoutError}
        loading={checkoutStatus !== null}
        loadingLabel={!mobileScan ? checkoutStatus ?? undefined : undefined}
        open={paymentDialogOpen}
        returnOfferSessionId={returnOfferSessionId}
        onCheckout={onCheckout}
        onOpenChange={onPaymentDialogChange}
      />
    </>
  )
}

function ResultsStep({
  mobileScan,
  country,
  primaryScore,
  results,
  sidePortrait,
  initialCategoryId,
  onOpenShare,
}: {
  mobileScan: boolean
  country: string | null
  primaryScore: number | null
  results: AnalysisResponse[]
  sidePortrait: AnalysisDraftImage | null
  initialCategoryId?: string
  onOpenShare: () => void
}) {
  const primaryResult = results[0]
  const sample = primaryResult?.analysis.id === sampleWalkthroughReport.analysis.id
  const { data: reportHeading } = useSWR<{ number: number | null }>(
    !mobileScan && primaryResult && !sample
      ? `/api/analysis/${encodeURIComponent(primaryResult.analysis.id)}?view=heading`
      : null,
    apiGet,
  )
  const heading = mobileScan ? undefined : { createdAt: primaryResult?.analysis.createdAt, number: sample ? 1 : reportHeading?.number }
  const portraits = [
    ...(sidePortrait ? [{ src: sidePortrait.dataUrl, landmarks: sidePortrait.landmarks ?? null, side: true, label: 'Side' }] : []),
    ...results.slice(1).map((result, index) => ({ src: result.photo.imageUrl, landmarks: getReportLandmarks(result), label: `Photo ${index + 2}` })),
  ]
  const landmarks = useMemo(() => getReportLandmarks(primaryResult), [primaryResult])
  const score = getReportOverallScore(primaryResult, primaryScore)
  const potential = getAnalysisReport(primaryResult)?.potential?.score
  const potentialScore = typeof potential === 'number' && Number.isFinite(potential) && potential >= 1 && potential <= 8
    ? pslToOverallScore(potential)
    : null
  const categories = reportCategories.map(category => {
    const report = getReportCategoryData(category.id, primaryResult)
    return {
      ...category,
      title: report?.title ?? category.title,
      subtitle: report?.subtitle ?? category.subtitle,
      scoreLabel: !mobileScan && category.id === 'overall' ? 'Your Score' : report?.scoreLabel ?? category.scoreLabel,
      explanation: report?.explanation,
      eyeColor: report?.eyeColor,
      features: report?.features?.length ? report.features : category.features,
      score: getReportCategoryScore(category.id, primaryResult),
    }
  })
  const actions = (reportScore: number) => mobileScan ? null : <ReportActions score={reportScore} potential={potentialScore} onOpenShare={onOpenShare} country={country} />
  if (primaryResult?.analysis.metrics.webReportV2?.version === 2) {
    return <WebAnalysisReport heading={heading} mobileScan={mobileScan} potentialScore={potentialScore} initialCategoryId={initialCategoryId ?? "overall"} portraitLayoutId="analysis-portrait" portraits={portraits} report={primaryResult.analysis.metrics.webReportV2} imageSrc={primaryResult.photo.imageUrl} landmarks={landmarks} pslScore={primaryScore ?? 1}>
      {actions(primaryResult.analysis.metrics.webReportV2.overallScore)}
    </WebAnalysisReport>
  }
  return (
    <LegacyAnalysisReport heading={heading} mobileScan={mobileScan} potentialScore={potentialScore} initialCategoryId={mobileScan ? "overall" : undefined} portraitLayoutId="analysis-portrait" portraits={portraits} categories={categories} imageSrc={primaryResult?.photo.imageUrl ?? previewPhotoUrl} landmarks={landmarks} score={score} pslScore={primaryScore}>
      {actions(score)}
    </LegacyAnalysisReport>
  )
}

function getReportLandmarks(result?: AnalysisResponse) {
  return parseFaceLandmarksPayload(result?.analysis.landmarks)
}

function getAnalysisReport(result?: AnalysisResponse): AnalysisReport | null {
  const report = result?.analysis.metrics?.report
  if (!report || typeof report.summary !== 'string' || !Array.isArray(report.categories)) return null

  return report
}

function getReportCategoryData(categoryId: string, result?: AnalysisResponse): AnalysisReportCategory | null {
  const report = getAnalysisReport(result)
  const category = report?.categories.find((item) => item.id === categoryId)
  if (!category || !Array.isArray(category.features)) return null

  return category
}

function getReportOverallScore(result?: AnalysisResponse, fallbackScore?: number | null) {
  const reportCategory = getReportCategoryData('overall', result)
  if (typeof reportCategory?.score === 'number') {
    return Math.max(0, Math.min(10, reportCategory.score))
  }

  const score = fallbackScore ?? result?.analysis.pslScore ?? 0
  return pslToOverallScore(score)
}


function getReportCategoryScore(categoryId: string, result?: AnalysisResponse) {
  if (!result) return 0
  const reportCategory = getReportCategoryData(categoryId, result)
  if (typeof reportCategory?.score === 'number') {
    return Math.max(0, Math.min(10, reportCategory.score))
  }

  const overall = result.analysis.pslScore ?? 0
  const harmony = result.analysis.harmonyScore ?? overall
  const dimorphism = result.analysis.dimorphismScore ?? overall
  const angularity = result.analysis.angularityScore ?? overall

  const scores: Record<string, number> = {
    eyes: harmony + 0.1,
    nose: harmony - 0.2,
    mouth: harmony - 0.1,
    jaw: angularity + 0.2,
    dimorphism,
    'face-shape': (harmony + angularity) / 2,
    'facial-fat': Math.max(0, Math.min(10, harmony + (angularity >= 5 ? 0.2 : -0.4))),
    'biological-age': harmony + 0.3,
    symmetry: harmony,
    overall,
  }

  const fallbackScore = categoryId === 'overall' ? pslToOverallScore(overall) : scores[categoryId] ?? overall
  return Math.max(0, Math.min(10, fallbackScore))
}

function ShareSheet({
  result,
  open,
  shareUrl,
  loading,
  onClose,
  onCreate,
}: {
  result: AnalysisResponse | null
  open: boolean
  shareUrl: string | null
  loading: boolean
  onClose: () => void
  onCreate: () => Promise<string | null>
}) {
  const playDownload = useQuietCue(downloadCue)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null)
  const [shareImageSize, setShareImageSize] = useState<{ width: number; height: number } | null>(null)
  const [renderingImage, setRenderingImage] = useState(false)
  const [shareActionLoading, setShareActionLoading] = useState<string | null>(null)
  const [isMobileShare, setIsMobileShare] = useState(false)
  const hasRequestedShareRef = useRef(false)

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    setIsMobileShare(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
  }, [open])

  useEffect(() => {
    if (!open) {
      hasRequestedShareRef.current = false
      return
    }

    if (shareUrl || loading || hasRequestedShareRef.current) return
    hasRequestedShareRef.current = true
    void onCreate()
  }, [loading, onCreate, open, shareUrl])

  useEffect(() => {
    if (!open || !shareUrl) return

    const token = getShareToken(shareUrl)
    if (!token) return

    let cancelled = false
    const controller = new AbortController()

    setRenderingImage(true)
    setShareImageBlob(null)
    setShareImageSize(null)

    void fetch(`/api/og/share?token=${encodeURIComponent(token)}&render=story-population-v11`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to prepare share image')
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        const size = await getImageSize(objectUrl)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        setShareImageBlob(blob)
        setShareImageSize(size)
        setShareImageUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return objectUrl
        })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!cancelled) toast.error('Unable to prepare share image')
      })
      .finally(() => {
        if (!cancelled) setRenderingImage(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, shareUrl])

  useEffect(() => {
    return () => {
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl)
    }
  }, [shareImageUrl])

  function downloadReportImage(url: string) {
    downloadShareImage(url)
    if (!isMobileShare) playDownload()
  }

  async function ensureShareUrl() {
    return shareUrl ?? await onCreate()
  }

  async function handleImageShare(target: 'instagram' | 'tiktok' | 'native') {
    const url = await ensureShareUrl()
    if (!url || !result) return

    setShareActionLoading(target)
    try {
      const file = shareImageBlob
        ? new File([shareImageBlob], 'mogging-report.png', { type: 'image/png' })
        : null
      const canShareFile = Boolean(file && navigator.canShare?.({ files: [file] }))

      if (canShareFile && file) {
        await navigator.share({
          title: 'My Mogging report',
          text: `Overall score ${formatShareScore(getReportOverallScore(result))} / 10`,
          files: [file],
        })
        return
      }

      if (shareImageUrl) {
        downloadReportImage(shareImageUrl)
        toast.success('Share image downloaded')
      }
    } finally {
      setShareActionLoading(null)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-50 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close share sheet" type="button" />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[94svh] overflow-y-auto rounded-t-[34px] border border-zinc-200 bg-white p-5 text-black shadow-[0_32px_120px_rgba(15,23,42,0.24)] sm:left-auto sm:right-5 sm:top-20 sm:h-fit sm:w-[430px] sm:rounded-[34px]"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Share report //</p>
                <h2 className="mt-2 text-3xl font-semibold leading-none tracking-[-0.055em]">Share card</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div
              className="relative mt-5 overflow-hidden border border-zinc-200 bg-zinc-100 shadow-[0_18px_50px_rgba(15,23,42,0.10)]"
              style={{
                aspectRatio: shareImageSize ? `${shareImageSize.width} / ${shareImageSize.height}` : '3 / 4',
              }}
            >
              {shareImageUrl ? (
                <SkeletonImage className="object-cover" src={shareImageUrl} alt="Shareable report card preview" sizes="430px" unoptimized />
              ) : (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <Loader2 className="mx-auto size-5 animate-spin text-zinc-500" aria-hidden="true" />
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                      {renderingImage ? 'Rendering share image' : 'Preparing preview'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              <ShareNetworkButton
                disabled={loading || renderingImage}
                loading={shareActionLoading === 'instagram'}
                mark="IG"
                onClick={() => void handleImageShare('instagram')}
              >
                Instagram story
              </ShareNetworkButton>
              <ShareNetworkButton
                disabled={loading || renderingImage}
                loading={shareActionLoading === 'tiktok'}
                mark="TT"
                onClick={() => void handleImageShare('tiktok')}
              >
                TikTok story
              </ShareNetworkButton>
              {isMobileShare ? (
                <button
                  className="flex h-12 w-full items-center justify-between rounded-full border border-zinc-200 bg-white px-4 text-left font-mono text-[11px] uppercase tracking-wide text-black transition-colors hover:bg-zinc-50 disabled:opacity-60"
                  disabled={loading || renderingImage}
                  onClick={() => void handleImageShare('native')}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <Share2 className="size-5" aria-hidden="true" />
                    Native share
                  </span>
                  {shareActionLoading === 'native' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                </button>
              ) : null}
            </div>

            {shareImageUrl ? (
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-black"
                onClick={() => downloadReportImage(shareImageUrl)}
                type="button"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Download image
              </button>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ShareNetworkButton({
  children,
  disabled,
  loading,
  mark,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  mark: string
  onClick: () => void
}) {
  return (
    <button
      className="flex h-12 w-full items-center justify-between rounded-full bg-black px-4 text-left font-mono text-[11px] uppercase tracking-wide text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60"
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[9px] font-bold text-black">
          {mark}
        </span>
        {children}
      </span>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
    </button>
  )
}

function formatShareScore(score: number | null) {
  return typeof score === 'number' ? score.toFixed(1) : '--'
}

function getShareToken(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? null
  } catch {
    return url.split('/').filter(Boolean).pop() ?? null
  }
}

function getImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 1080, height: 1440 })
    image.src = src
  })
}

function downloadShareImage(url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'mogging-report.png'
  anchor.click()
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value?.toFixed(1) ?? '--'}</div>
    </div>
  )
}

async function prepareImagesForAnalysis(images: AnalysisDraftImage[], framePositions: ImageFramePositions, mobile: boolean) {
  return Promise.all(images.map(async (image) => {
    const position = framePositions[image.id] ?? defaultFramePosition
    if (position.x === 50 && position.y === 50 && position.scale === 1 && (mobile || image.dataUrl.length <= maxDesktopPhotoLength)) return image

    const dataUrl = await cropImageDataUrlToFrame(image.dataUrl, position, mobile)
    return {
      ...image,
      dataUrl,
      landmarks: null,
      mesh: null,
    }
  }))
}

async function cropImageDataUrlToFrame(dataUrl: string, position: CaptureFrameImagePosition, mobile: boolean) {
  const image = await loadImageElement(dataUrl)
  const frameAspectRatio = mobile ? 9 / 16 : desktopCaptureViewport.width / desktopCaptureViewport.height
  const imageAspectRatio = image.naturalWidth / image.naturalHeight
  const baseSourceWidth = imageAspectRatio > frameAspectRatio ? image.naturalHeight * frameAspectRatio : image.naturalWidth
  const baseSourceHeight = imageAspectRatio > frameAspectRatio ? image.naturalHeight : image.naturalWidth / frameAspectRatio
  const sourceWidth = baseSourceWidth / position.scale
  const sourceHeight = baseSourceHeight / position.scale
  const sourceX = ((image.naturalWidth - sourceWidth) * position.x) / 100
  const sourceY = ((image.naturalHeight - sourceHeight) * position.y) / 100
  const canvas = document.createElement('canvas')

  canvas.width = 1080
  canvas.height = Math.round(canvas.width / frameAspectRatio)

  const context = canvas.getContext('2d')
  if (!context) return dataUrl

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
  return encodeAnalysisImage(canvas, !mobile)
}

function buildPaidAnalysisHeaders(paymentInstallId: string | null): HeadersInit | undefined {
  return paymentInstallId
    ? {
        'x-mogging-mobile-install-id': paymentInstallId,
      }
    : undefined
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for cropping'))
    image.src = src
  })
}

const maxDesktopPhotoLength = 1_600_000

function encodeAnalysisImage(canvas: HTMLCanvasElement, bounded: boolean) {
  const original = canvas.toDataURL('image/jpeg', .92)
  if (!bounded || original.length <= maxDesktopPhotoLength) return original
  const compressed = canvas.toDataURL('image/jpeg', .76)
  if (compressed.length <= maxDesktopPhotoLength) return compressed
  const smaller = document.createElement('canvas')
  smaller.width = Math.round(canvas.width * .65)
  smaller.height = Math.round(canvas.height * .65)
  const context = smaller.getContext('2d')
  if (!context) throw new Error('Could not resize this photo')
  context.drawImage(canvas, 0, 0, smaller.width, smaller.height)
  const resized = smaller.toDataURL('image/jpeg', .76)
  if (resized.length > maxDesktopPhotoLength) throw new Error('Photo is too large')
  return resized
}

async function readImageFile(file: File, bounded: boolean): Promise<AnalysisDraftImage> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(url)
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image preparation unavailable')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return {
      id: crypto.randomUUID(),
      name: file.name,
      dataUrl: encodeAnalysisImage(canvas, bounded),
      hairColor: null,
      skinColor: null,
      landmarks: null,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
