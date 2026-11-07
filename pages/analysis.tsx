import { useWebStep } from '@/hooks/use-web-step'
import { webJourneyContext, restoreWebJourney } from '@/lib/analytics/web-journey'
import { rememberStripeAttempt, takeStripeAttempt, readStripeAttempt, clearStripeAttempt, stripeAttemptProperties } from '@/lib/client/stripe-attempt'
import { usePortraitHandoff } from '@/components/analysis/use-portrait-handoff'
import { ensureAnalysisWebInstallId } from '@/lib/client/analysis-install'
import { ScanInstallGuide } from '@/components/analysis/scan-install-guide'
import { TextMorph } from 'torph/react'
import sampleLandmarks from '@/components/analysis/scan-welcome-landmarks.json'
import sampleRubrics from '@/lib/analysis-v2/sample-entries.json'
import rubricRegistry from '@/lib/analysis-v2/rubric-registry.json'
import { MobileCaptureChrome, MobileCaptureRing } from '@/components/analysis/guided-web-capture'
import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { MobileScanOnboarding } from '@/components/analysis/mobile-scan-onboarding'
import { MobileScanWelcome, ScanPwaHead, scanPart, scanSequence, useMobileScan } from '@/components/analysis/mobile-scan-pwa'
import { useDesktop } from '@/components/landing/use-desktop'
import type { GetServerSideProps } from 'next'
import type { AnalysisPurchase } from '@/components/payments/analysis-unlock-dialog'
import type { CheckoutQuote } from '@/components/payments/membership-offer'
import { flushWebAnalytics } from '@/lib/analytics/client'
import type { WebReport } from '@/lib/analysis-v2/report-schema'
import { reportCategoryDefaults as reportCategories } from '@/components/analysis/report-category-defaults'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
import { trackWebEvent } from '@/lib/analytics/client'
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Camera,
  ImagePlus,
  RotateCcw,
  Check,
  CreditCard,
  Download,
  ScanFace,
  Loader2,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { IntroFacePreview } from '@/components/analysis/intro-face-preview'
import { useRouter } from 'next/router'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useSound } from '@web-kits/audio/react'
import useSWR from 'swr'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { downloadCue, expandCue, selectSound, useQuietCue } from '@/lib/audio/sounds'
import {
  clearAnalysisDraft,
  loadAnalysisDraft,
  saveAnalysisDraft,
  type AnalysisDraftImage,
  loadAnalysisSidePhoto,
  saveAnalysisSidePhoto,
} from '@/lib/client/analysisDraft'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoginDialog } from '@/components/app/login-dialog'
import { SeoHead } from '@/components/app/seo-head'
import { CaptureFrame, type CaptureFrameImagePosition } from '@/components/analysis/capture-frame'
import { TextLoop } from '@/components/core/text-loop'
import { TextShimmer } from '@/components/core/text-shimmer'

const LockedReportPreview = dynamic(() => import('@/components/payments/locked-report-preview').then(module => module.LockedReportPreview))
const AnalysisUnlockDialog = dynamic(() => import('@/components/payments/analysis-unlock-dialog').then(module => module.AnalysisUnlockDialog))
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))

const WebAnalysisReport = dynamic(() => import('@/components/analysis/v2/web-analysis-report').then(module => module.WebAnalysisReport))

const LegacyAnalysisReport = dynamic(() => import('@/components/analysis/v2/web-analysis-report').then(module => module.LegacyAnalysisReport))
const ReportActions = dynamic(() => import('@/components/analysis/analysis-report').then((module) => module.ReportActions))
const CameraSheet = dynamic(() => import('@/components/analysis/camera-sheet').then((module) => module.CameraSheet))

type FlowStep = 'intro' | 'story' | 'upload' | 'preview-analysis' | 'payment' | 'actual-analysis' | 'results'

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

type AppConfig = {
  features: {
    paidAnalysisRequired: boolean
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
      status: string | null
      currentPeriodEnd: string | null
    }
  }
}

type ImageFramePositions = Record<string, CaptureFrameImagePosition>
const defaultFramePosition: CaptureFrameImagePosition = { x: 50, y: 50, scale: 1 }

const pseudoAnalysisItems = [
  'Detecting facial reference lines',
  'Checking image quality',
  'Mapping proportional landmarks',
  'Preparing private report',
]
const previewPhotoUrl = '/model.png'
const analysisTimeline = [
  {
    title: 'Preparing image geometry',
    substeps: ['Normalizing crop', 'Checking frontal alignment', 'Reading image density'],
  },
  {
    title: 'Mapping facial anchors',
    substeps: ['Locating eye line', 'Resolving nose bridge', 'Tracing mouth axis', 'Estimating chin point'],
  },
  {
    title: 'Measuring symmetry',
    substeps: ['Comparing left-right landmarks', 'Checking eye and mouth reference lines', 'Weighting visible asymmetries'],
  },
  {
    title: 'Scoring proportionality',
    substeps: ['Estimating thirds and fifths', 'Comparing local feature ratios', 'Rejecting golden-ratio shortcuts'],
  },
  {
    title: 'Evaluating averageness',
    substeps: ['Checking population-typical ranges', 'Flagging extreme deviations', 'Balancing structural harmony'],
  },
  {
    title: 'Assessing dimorphism',
    substeps: ['Reading brow and jaw cues', 'Separating sex-typical shape from attractiveness', 'Applying gender scoring mode'],
  },
  {
    title: 'Composing final report',
    substeps: ['Calibrating PSL estimate', 'Writing evidence-weighted summary', 'Preparing shareable result'],
  },
]
type AnalysisEntryProps = { startWithPhoto: boolean; previewMobile: boolean; walkthrough: boolean; sampleReport: boolean }

export const getServerSideProps: GetServerSideProps<AnalysisEntryProps> = async ({ query }) => ({
  props: {
    startWithPhoto: query.start === '1',
    sampleReport: process.env.NODE_ENV === 'development' && query.preview === 'mobile' && query.walkthrough === '1' && query.report === 'sample',
    previewMobile: process.env.NODE_ENV === 'development' && query.preview === 'mobile',
    walkthrough: process.env.NODE_ENV === 'development' && query.preview === 'mobile' && query.walkthrough === '1',
  },
})

export default function AnalysisPage({ startWithPhoto, previewMobile, walkthrough, sampleReport }: AnalysisEntryProps) {
  const router = useRouter()
  const mobileDevice = useMobileScan()
  const mobileScan = previewMobile || mobileDevice
  const { status } = useSession()
  const playSelect = useSound(selectSound)
  const playExpand = useQuietCue(expandCue)
  const { data: appConfig } = useSWR<AppConfig>('/api/app-config', apiGet, {
    shouldRetryOnError: false,
  })
  const paidAnalysisRequired = appConfig?.features.paidAnalysisRequired ?? false
  const desktop = useDesktop()
  const sideInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<AnalysisDraftImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other')
  const [step, setStep] = useState<FlowStep>(sampleReport ? 'results' : startWithPhoto ? 'upload' : 'intro')
  useEffect(() => {
    setStep(current => current === 'intro' || current === 'upload'
      ? startWithPhoto ? 'upload' : 'intro'
      : current)
  }, [startWithPhoto])
  useWebStep(step, !walkthrough)
  const [progress, setProgress] = useState(0)
  const [sidePortrait, setSidePortrait] = useState<AnalysisDraftImage | null>(null)
  const [results, setResults] = useState<AnalysisResponse[]>(sampleReport ? [sampleWalkthroughReport] : [])
  const [offerInstall, setOfferInstall] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [analysisUnlocked, setAnalysisUnlocked] = useState(false)
  const [returnOfferSessionId, setReturnOfferSessionId] = useState<string | null>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const viewedAnalysisId = step === 'results' ? results[0]?.analysis.id : undefined
  useEffect(() => {
    if (!walkthrough && viewedAnalysisId) trackWebEvent('report_viewed', { report_id: viewedAnalysisId, surface: 'web_analysis', flow_id: webJourneyContext().flow_id })
  }, [viewedAnalysisId, walkthrough])
  useEffect(() => {
    if (!walkthrough && paymentDialogOpen) trackWebEvent('paywall_viewed', { surface: 'web_analysis', paywall_id: 'web_analysis', paywall_version: '2', flow_id: webJourneyContext().flow_id })
  }, [paymentDialogOpen, walkthrough])
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [preparingScan, setPreparingScan] = useState(false)
  const [loginCallback, setLoginCallback] = useState('/analysis?start=1&resumePhoto=1')
  const loadedAnalysisIdRef = useRef<string | null>(null)
  const resumedCheckoutRef = useRef<string | null>(null)
  const analysisRunningRef = useRef(false)
  const [landmarkPendingIds, setLandmarkPendingIds] = useState<Record<string, boolean>>({})
  const [imageFramePositions, setImageFramePositions] = useState<ImageFramePositions>({})

  const primaryResult = results[0]
  const primaryScore = primaryResult?.analysis.pslScore ?? null
  const isPreparingUploads = Object.values(landmarkPendingIds).some(Boolean)
  const reportCount = images.filter(image => image.view !== 'side').length
  const canStart = images.some(image => image.view !== 'side') && step === 'upload' && !isPreparingUploads && !preparingScan && (walkthrough || status !== 'loading')

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? images[images.length - 1] ?? null,
    [images, selectedImageId],
  )
  const previewImage = selectedImage?.dataUrl ?? null

  async function handleFiles(event: ChangeEvent<HTMLInputElement>, side = false) {
    const remaining = Math.max(0, 3 - images.length)
    const files = Array.from(event.target.files || []).slice(0, side ? Math.min(1, remaining) : remaining)
    if (files.length === 0) return

    const started = Date.now()
    if (!walkthrough) trackWebEvent('photo_preparation_started', { surface: 'web_analysis', count: files.length, source: 'picker' })
    let nextImages: AnalysisDraftImage[]
    try { nextImages = await Promise.all(files.map(readImageFile)) } catch {
      if (!walkthrough) trackWebEvent('photo_validation_failed', { surface: 'web_analysis', reason_code: 'image_read_failed', duration_ms: Date.now() - started })
      setError('Could not open that image. Please try another image.')
      return
    }
    if (!walkthrough) {
      trackWebEvent('photo_selected', { surface: 'web_analysis', count: nextImages.length, source: 'picker' })
      trackWebEvent('photo_preparation_completed', { surface: 'web_analysis', count: nextImages.length, duration_ms: Date.now() - started })
    }
    const visibleNextImages = nextImages.slice(0, Math.max(0, 3 - images.length)).map(image => side ? { ...image, view: 'side' as const } : image)
    setImages((current) => [...current, ...visibleNextImages].slice(0, 3))
    setSelectedImageId(visibleNextImages[visibleNextImages.length - 1]?.id ?? null)
    setImageFramePositions((current) => ({
      ...current,
      ...Object.fromEntries(visibleNextImages.map((image) => [image.id, defaultFramePosition])),
    }))
    setLandmarkPendingIds((current) => ({
      ...current,
      ...Object.fromEntries(visibleNextImages.map((image) => [image.id, true])),
    }))
    event.target.value = ''
    visibleNextImages.forEach((image) => {
      void enrichImageLandmarks(image)
    })
  }

  const [previewDeadline, setPreviewDeadline] = useState<number | null>(null)

  async function startPseudoAnalysis() {
    if (!canStart) return
    if (walkthrough) {
      setPreviewDeadline(Date.now() + 10_000)
      setAnalysisUnlocked(false)
      setStep('preview-analysis')
      return
    }
    if (!mobileScan) playSelect()
    setPreparingScan(true)
    let preparedImages: AnalysisDraftImage[]
    try {
      preparedImages = await prepareImagesForAnalysis(images, imageFramePositions)
      if (status !== 'authenticated') {
        await saveAnalysisDraft({ gender, images: preparedImages, savedAt: Date.now() })
        const returnUrl = new URL(router.asPath, window.location.origin)
        returnUrl.searchParams.set('start', '1')
        returnUrl.searchParams.set('resumePhoto', '1')
        setLoginCallback(returnUrl.pathname + returnUrl.search)
        setLoginOpen(true)
        return
      }
    } catch {
      toast.error('Could not prepare your photos. Please try again.')
      return
    } finally {
      setPreparingScan(false)
    }

    setImages(preparedImages)
    setImageFramePositions({})
    setError(null)
    setAnalysisUnlocked(true)
    setPaymentDialogOpen(false)
    setProgress(18)
    setPreviewDeadline(null)
    const previewEnds = Date.now() + 10_000
    setStep(mobileScan ? 'preview-analysis' : 'actual-analysis')

    try {
      const installId = ensureAnalysisWebInstallId()
      const access = await apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(installId)}`)
      if (access.entitlements.evaluationCredits >= reportCount) {
        setStep('actual-analysis')
        await runActualAnalysis(preparedImages, installId, gender)
      } else if (mobileScan) {
        setPreviewDeadline(previewEnds)
      } else {
        setAnalysisUnlocked(false)
      }
    } catch (caught) {
      setStep('upload')
      setError(caught instanceof Error ? caught.message : 'Unable to check your scan credits. Please try again.')
    }
  }

  function retakePhoto() {
    setImages([])
    setSelectedImageId(null)
    setImageFramePositions({})
    setStep('upload')
  }

  function beginAssessment() {
    setStep('upload')
    if (!mobileScan) playExpand()
  }

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
      setResults([sampleWalkthroughReport])
      setWalkthroughProcessing(false)
      setStep('results')
    }, 7600)
    return () => window.clearTimeout(finish)
  }, [walkthroughProcessing])

  async function startCheckout(product: AnalysisPurchase, quote: CheckoutQuote) {
    if (walkthrough) {
      setPaymentDialogOpen(false)
      setAnalysisUnlocked(true)
      setProgress(18)
      setOfferInstall(true)
      setWalkthroughProcessing(true)
      return
    }
    if (checkoutLoading || status === 'loading') return
    if (status !== 'authenticated') {
      trackWebEvent('account_auth_started', { surface: 'web_analysis', auth_stage: 'checkout' })
      try { await saveAnalysisDraft({ gender, images, savedAt: Date.now() }) }
      catch { setError('Your browser could not save your photos. Please try a regular browser window before continuing.'); return }
      setLoginOpen(true)
      return
    }

    setCheckoutLoading(true)
    setError(null)
    const attemptId = crypto.randomUUID()
    const purchaseContext = { surface: 'web_analysis', flow_id: webJourneyContext().flow_id, attempt_id: attemptId, product, paywall_version: '2' }
    let checkoutStage = 'entitlements'
    trackWebEvent('purchase_started', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })

    try {
      const paymentInstallId = ensureAnalysisWebInstallId()
      const access = await apiGet<PaymentAccessResponse>(`/api/payments/entitlements?mobileInstallId=${encodeURIComponent(paymentInstallId)}`)
      if (access.entitlements.evaluationCredits >= reportCount) {
        trackWebEvent('purchase_reconciled', { ...purchaseContext, provider: 'stripe', result: 'existing_access' })
        setAnalysisUnlocked(true)
        setPaymentDialogOpen(false)
        setStep('actual-analysis')
        await runActualAnalysis(images, paymentInstallId, gender)
        return
      }
      if (product.startsWith('mobile_subscription_') && access.entitlements.subscription.active) {
        throw new Error('Your Pro membership is already active. Choose Report only for an additional evaluation.')
      }
      checkoutStage = 'draft_save'
      trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })
      await saveAnalysisDraft({
        gender,
        images,
        savedAt: Date.now(),
      })
      checkoutStage = 'checkout_create'
      trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: checkoutStage })
      const subscription = product.startsWith('mobile_subscription_')
      const response = await apiPost<CheckoutResponse>(subscription ? '/api/payments/web-checkout' : '/api/payments/checkout', {
        ...(subscription ? { product, returnTo: 'analysis', source: 'web_analysis' } : { imageCount: reportCount }),
        mobileInstallId: paymentInstallId,
        ...quote, attemptId, flowId: webJourneyContext().flow_id, flowVersion: webJourneyContext().flow_version, entryMode: webJourneyContext().entry_mode,
      })
      checkoutStage = 'checkout_redirect'
      if (response.sessionId) {
        rememberStripeAttempt('web_analysis', { attempt_id: attemptId, product, flow_id: webJourneyContext().flow_id, sessionId: response.sessionId })
        trackWebEvent('purchase_stage_changed', { ...purchaseContext, provider: 'stripe', purchase_stage: 'checkout_redirect' })
        void flushWebAnalytics()
      }
      window.location.href = response.url
    } catch (checkoutError) {
      trackWebEvent('purchase_failed', { ...purchaseContext, purchase_stage: checkoutStage, reason_code: checkoutError instanceof ApiClientError ? checkoutError.code : checkoutStage === 'draft_save' ? 'draft_storage_unavailable' : 'request_failed', http_status: checkoutError instanceof ApiClientError ? checkoutError.status : undefined })
      setError(checkoutError instanceof ApiClientError ? checkoutError.message : checkoutStage === 'draft_save' ? 'Your browser could not save your photos for checkout. Free up storage or try a regular browser window, then retry. You have not been charged.' : 'Unable to open checkout. Please check your connection and retry.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const runActualAnalysis = useCallback(async (draftImages: AnalysisDraftImage[], paymentInstallId: string, analysisGender: 'male' | 'female' | 'other') => {
    const frontImages = draftImages.filter(image => image.view !== 'side')
    if (frontImages.length === 0) {
      setStep('upload')
      setError('Upload an image before starting analysis.')
      return
    }
    if (analysisRunningRef.current) return
    analysisRunningRef.current = true

    const analyticsStarted = Date.now()
    const attemptId = crypto.randomUUID()
    trackWebEvent('evaluation_started', { attempt_id: attemptId, flow_id: webJourneyContext().flow_id, surface: 'web_analysis' })
    try {
      const analysisResults: AnalysisResponse[] = []

      for (const [index, image] of frontImages.entries()) {
        setProgress(Math.round(30 + (index / frontImages.length) * 62))
        const result = await apiPost<AnalysisResponse>('/api/web/analyze', {
          imageData: image.dataUrl,
          gender: analysisGender,
          photoType: 'face',
          name: image.name,
          hairColor: image.hairColor ?? null,
          skinColor: image.skinColor ?? null,
          landmarks: image.landmarks ?? null,
          mesh: image.mesh ?? null,
        }, {
          headers: { ...buildPaidAnalysisHeaders(paymentInstallId), 'x-mogging-flow-id': webJourneyContext().flow_id || '', 'x-mogging-evaluation-id': attemptId },
        })
        if (result.analysis.status !== 'complete') throw new Error(result.analysis.failureReason ?? 'Unable to complete this analysis. Please retry.')
        analysisResults.push(result)
      }

      setProgress(100)
      const side = draftImages.find(image => image.view === 'side')
      setSidePortrait(side ?? null)
      if (side) await saveAnalysisSidePhoto(analysisResults[0].analysis.id, side).catch(() => {
        toast.info('The side photo is available for this session.')
      })
      setResults(analysisResults)
      trackWebEvent('evaluation_completed', { report_id: analysisResults[0]?.analysis.id, attempt_id: attemptId, flow_id: webJourneyContext().flow_id, duration_ms: Date.now() - analyticsStarted, surface: 'web_analysis' })
      setStep('results')
      await clearAnalysisDraft()
    } catch (analysisError) {
      trackWebEvent('evaluation_failed', { attempt_id: attemptId, flow_id: webJourneyContext().flow_id, duration_ms: Date.now() - analyticsStarted, reason_code: analysisError instanceof ApiClientError ? analysisError.code : 'request_failed', http_status: analysisError instanceof ApiClientError ? analysisError.status : undefined, surface: 'web_analysis' })
      setStep('actual-analysis')
      setError(analysisError instanceof Error ? analysisError.message : 'Analysis failed')
    } finally {
      analysisRunningRef.current = false
    }
  }, [])

  const resumeAfterPayment = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      setAnalysisUnlocked(true)
      setPaymentDialogOpen(false)
      setStep('actual-analysis')
      setProgress(28)
      const [confirmation, draft] = await Promise.all([
        apiPost<PaymentAccessResponse>('/api/payments/confirm', { sessionId }),
        loadAnalysisDraft(),
      ])
      const purchase = readStripeAttempt('web_analysis', sessionId)
      if (confirmation.analytics?.flow_id) { restoreWebJourney(confirmation.analytics.flow_id) }
      if (purchase?.flow_id) { restoreWebJourney(purchase.flow_id) }
      trackWebEvent('purchase_activated', { surface: 'web_analysis', provider: 'stripe', ...confirmation.analytics, ...stripeAttemptProperties(purchase) })
      clearStripeAttempt('web_analysis')
      const installId = ensureAnalysisWebInstallId(confirmation.entitlements.mobileInstallId)
      // Remove the return parameters before changing screens, so retries cannot re-run checkout recovery.
      await router.replace('/analysis', undefined, { shallow: true })
      if (!draft?.images.length) {
        setStep('upload')
        setError('Your payment is confirmed. Please upload your photo to use your scan credit.')
        return
      }
      setImages(draft.images)
      setSelectedImageId(draft.images[draft.images.length - 1]?.id ?? null)
      setGender(draft.gender)
      if (confirmation.entitlements.evaluationCredits < draft.images.filter(image => image.view !== 'side').length) {
        setStep('upload')
        setError('Your payment is confirmed. Select one photo per available scan credit to continue.')
        return
      }
      setOfferInstall(mobileScan && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
        && !window.matchMedia('(display-mode: standalone)').matches
        && !(navigator as Navigator & { standalone?: boolean }).standalone)
      await runActualAnalysis(draft.images, installId, draft.gender)
    } catch (caught) {
      setStep('upload')
      trackWebEvent('purchase_activation_failed', { surface: 'web_analysis', ...stripeAttemptProperties(readStripeAttempt('web_analysis', sessionId)), purchase_stage: 'checkout_return', reason_code: caught instanceof ApiClientError ? caught.code : 'request_failed', http_status: caught instanceof ApiClientError ? caught.status : undefined })
      const message = caught instanceof Error ? caught.message : 'Unable to restore your purchase. Please try again.'
      setError(message)
      toast.error(message, { action: { label: 'Retry confirmation', onClick: () => { void resumeAfterPayment(sessionId) } } })
    }
  }, [mobileScan, router, runActualAnalysis])

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== 'success') return
    if (status === 'unauthenticated') {
      setLoginCallback(router.asPath)
      setLoginOpen(true)
      return
    }
    if (status !== 'authenticated') return
    const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : null
    if (!sessionId || resumedCheckoutRef.current === sessionId) return
    resumedCheckoutRef.current = sessionId
    void resumeAfterPayment(sessionId)
  }, [resumeAfterPayment, router.asPath, router.isReady, router.query.checkout, router.query.session_id, status])

  useEffect(() => {
    if (!router.isReady || status !== 'authenticated' || router.query.resumePhoto !== '1') return
    let cancelled = false
    void loadAnalysisDraft().then(draft => {
      if (cancelled || !draft?.images.length) return
      setImages(current => current.length ? current : draft.images)
      setGender(draft.gender)
    }).catch(() => {
      if (!cancelled) toast.error('Could not restore your photo. Please select it again.')
    })
    return () => { cancelled = true }
  }, [router.isReady, router.query.resumePhoto, status])

  useEffect(() => {
    if (!router.isReady || walkthrough || status !== 'authenticated' || router.query.checkout || router.query.analysisId || step !== 'intro') return
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
      setStep('upload')
      toast.info('Your paid scan is ready. Review your photo and continue.')
    }).catch(() => { /* The upload action checks access again before offering payment. */ })
    return () => { cancelled = true }
  }, [mobileScan, router, status, step, walkthrough])

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
      setAnalysisUnlocked(false)
      setStep('actual-analysis')
      setReturnOfferSessionId(purchase?.sessionId ?? null)
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
        setStep('intro')
        const message = analysisError instanceof ApiClientError ? analysisError.message : 'Unable to load analysis'
        setError(message)
        toast.error(message)
      })
    return () => { cancelled = true; loadedAnalysisIdRef.current = null }
  }, [router.isReady, router.query.analysisId])

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
    if (images.length >= 3) {
      setSelectedImageId(images[images.length - 1]?.id ?? null)
      return
    }

    const imageId = crypto.randomUUID()
    const nextImage: AnalysisDraftImage = {
      id: imageId,
      name: image.name,
      dataUrl: image.dataUrl,
      hairColor: null,
      skinColor: null,
      landmarks: null,
    }

    setImages((current) => {
      return [...current, nextImage].slice(0, 3)
    })
    setSelectedImageId(imageId)
    setImageFramePositions((current) => ({ ...current, [imageId]: defaultFramePosition }))
    setLandmarkPendingIds((current) => ({ ...current, [imageId]: true }))
    void enrichImageLandmarks(nextImage)
  }

  async function enrichImageLandmarks(image: AnalysisDraftImage) {
    try {
      const [{ detectWebAnalysisEvidence }, { inferHairColorFromDataUrl, inferSkinColorFromDataUrl }] = await Promise.all([
        import('@/lib/client/faceLandmarks'),
        import('@/lib/client/appearance'),
      ])
      const { detection, mesh } = await detectWebAnalysisEvidence(image.dataUrl)
      const landmarks = detection.status === 'detected' ? detection.landmarks : null
      const [hairColor, skinColor] = await Promise.all([
        inferHairColorFromDataUrl(image.dataUrl, landmarks),
        inferSkinColorFromDataUrl(image.dataUrl, landmarks),
      ])

      setImages((current) => current.map((currentImage) => (
        currentImage.id === image.id ? { ...currentImage, hairColor, skinColor, landmarks, mesh } : currentImage
      )))
    } catch {
      const { inferHairColorFromDataUrl } = await import('@/lib/client/appearance')
      const hairColor = await inferHairColorFromDataUrl(image.dataUrl)
      setImages((current) => current.map((currentImage) => (
        currentImage.id === image.id ? { ...currentImage, hairColor, skinColor: null } : currentImage
      )))
    } finally {
      setLandmarkPendingIds((current) => {
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
    <div data-scan-step={step} data-capture-surface={captureSurface || undefined} className="scan-flow min-h-[calc(100svh-5rem)] w-full bg-white" data-mobile-scan={mobileScan || undefined} data-scan-preview={previewMobile || undefined}>
      <ScanPwaHead mobile={mobileScan && !walkthrough} dark={captureSurface} />
      {walkthrough && <div className="pointer-events-none fixed inset-x-0 top-1 z-[60] mx-auto w-fit rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-white">Sample walkthrough</div>}
      <SeoHead
        title="Mogging Analysis"
        description="Upload your face photo and generate a private PSL report with facial feature annotations."
        path="/analysis"
      />
      <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple={!mobileScan} onChange={handleFiles} />

      {desktop && <input ref={sideInputRef} className="hidden" type="file" accept="image/*" onChange={event => void handleFiles(event, true)} />}
      <MotionConfig reducedMotion="user"><LayoutGroup id="desktop-analysis">
      <section ref={scanFrame} className="public-frame relative min-h-[calc(100svh-5rem)] overflow-hidden bg-white">
        <AnimatePresence mode={(mobileScan && step !== 'story') || step === 'results' ? 'popLayout' : 'wait'}>
          {step === 'intro' ? (
            <ScreenMotion key="intro" managedMotion={mobileScan}>
              {mobileScan ? <MobileScanWelcome onBegin={() => setStep('story')} onSignIn={() => {
                setLoginCallback(router.asPath)
                setLoginOpen(true)
              }} /> : <IntroScreen onBegin={beginAssessment} />}
            </ScreenMotion>
          ) : null}

          {step === 'story' ? (
            <ScreenMotion key="story" managedMotion>
              <MobileScanOnboarding analyticsEnabled={!walkthrough} onComplete={profile => {
                setGender(profile)
                beginAssessment()
              }} />
            </ScreenMotion>
          ) : null}

          {step === 'upload' ? (
            <ScreenMotion key="upload" managedMotion={mobileScan}>
              <UploadScreen
                mobileScan={mobileScan}
                images={images}
                isPreparingUploads={isPreparingUploads}
                previewImage={previewImage}
                imagePosition={selectedImage ? (imageFramePositions[selectedImage.id] ?? defaultFramePosition) : defaultFramePosition}
                selectedImageId={selectedImage?.id ?? null}
                canStart={canStart}
                onCamera={() => setCameraOpen(true)}
                onUseSample={walkthrough ? () => {
                  setImages([{ id: 'walkthrough', name: 'Sample portrait', dataUrl: '/scan/welcome.jpg', landmarks: sampleLandmarks as FaceLandmarksPayload }])
                  setSelectedImageId('walkthrough')
                } : undefined}
                onImagePositionChange={(position) => {
                  if (!selectedImage) return
                  setImageFramePositions((current) => ({ ...current, [selectedImage.id]: position }))
                }}
                onRemove={removeImage}
                onSelect={setSelectedImageId}
                onStart={startPseudoAnalysis}
                onUpload={() => uploadInputRef.current?.click()}
                onUploadSide={desktop && images.some(image => image.view !== 'side') && !images.some(image => image.view === 'side') ? () => sideInputRef.current?.click() : undefined}
              />
            </ScreenMotion>
          ) : null}

          {step === 'preview-analysis' ? (
            <ScreenMotion key="preview-analysis" managedMotion={mobileScan}>
              <ActualAnalysisScreen preparingPreview
                mobileScan={mobileScan}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={() => setStep('upload')}
                imageCount={reportCount}
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired || walkthrough) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'payment' ? (
            <ScreenMotion key="payment">
              <ActualAnalysisScreen
                mobileScan={mobileScan}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={() => setStep('upload')}
                imageCount={reportCount}
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired || walkthrough) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'actual-analysis' ? (
            <ScreenMotion key="actual-analysis" managedMotion={mobileScan}>
              <ActualAnalysisScreen
                mobileScan={mobileScan}
                walkthrough={walkthrough}
                onRetake={retakePhoto}
                onRetry={() => setStep('upload')}
                imageCount={reportCount}
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images.find(image => image.view !== 'side')?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={images.find(image => image.view !== 'side')?.landmarks ?? null}
                returnOfferSessionId={returnOfferSessionId}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired || walkthrough) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'results' && offerInstall ? (
            <ScreenMotion key="install">
              <ScanInstallGuide onContinue={() => setOfferInstall(false)} onOpenApp={() => void router.push(walkthrough ? '/app/home?preview=1' : '/app/home')} />
            </ScreenMotion>
          ) : null}

          {step === 'results' && !offerInstall ? (
            <ScreenMotion key="results" managedMotion={mobileScan}>
              <ProcessScreen wide>
                {mobileScan && <button type="button" className="scan-retake" aria-label="Close report" onClick={() => { if (walkthrough || window.matchMedia('(display-mode: standalone)').matches || router.query.from === 'app') void router.push(walkthrough ? '/app/home?preview=1' : '/app/home'); else setStep('intro') }}><X size={20} /></button>}
                <ResultsStep
                  mobileScan={mobileScan}
                  primaryScore={primaryScore}
                  results={results}
                  sidePortrait={desktop ? sidePortrait : null}
                  onOpenShare={() => setShareOpen(true)}
                  onReset={() => {
                    setImages([])
                    setSelectedImageId(null)
                    setImageFramePositions({})
                    setResults([])
                    setSidePortrait(null)
                    setStep('intro')
                    setShareUrl(null)
                  }}
                />
                {mobileScan && <div className="mobile-report-share-dock">
                  <button type="button" className="mobile-report-share-button" onClick={() => setShareOpen(true)}>
                    <Share2 size={18} aria-hidden="true" /> Share report
                  </button>
                </div>}
              </ProcessScreen>
            </ScreenMotion>
          ) : null}
        </AnimatePresence>
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
          open={cameraOpen}
          onCapture={addCameraImage}
          onClose={() => setCameraOpen(false)}
          onUpload={() => {
            setCameraOpen(false)
            uploadInputRef.current?.click()
          }}
        />
      ) : null}
      </LayoutGroup></MotionConfig>
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        callbackUrl={loginCallback}
      />
    </div>
  )
}

const ScreenMotion = forwardRef<HTMLDivElement, { children: ReactNode; managedMotion?: boolean }>(function ScreenMotion({ children, managedMotion }, ref) {
  return (
    <motion.div
      ref={ref}
      className="scan-screen min-h-[calc(100svh-5rem)]"
      initial={managedMotion ? false : { opacity: 0, y: 18, scale: 0.992 }}
      animate={managedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      exit={managedMotion ? undefined : { opacity: 0, y: -14, scale: 0.992 }}
      transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
    >
      <AnimatePresence propagate>{children}</AnimatePresence>
    </motion.div>
  )
})

function IntroScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="grid min-h-[calc(100svh-5rem)] gap-8 public-gutters py-6 sm:py-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 xl:gap-24 2xl:gap-32">
      <aside className="flex flex-col justify-between gap-10 min-w-0" style={{ containerType: 'inline-size' }}>
        <div>
          <div className="flex gap-6 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            <Link href="/how-face-analysis-works" className="underline underline-offset-4 transition-colors hover:text-foreground">How does it work</Link>
          </div>

          <div className="mt-20 sm:mt-28 lg:mt-40">
            <h1 className="text-[clamp(1.625rem,5.5cqw,3.5rem)] lg:text-[clamp(2rem,8cqw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.05em]">
              <span className="block">Improve your looks</span>
              <span className="block">Discover your true potential</span>
            </h1>
            <div className="mt-8 grid grid-cols-1 divide-y divide-zinc-200/60 sm:grid-cols-[1fr_1.2fr_1fr] sm:divide-x sm:divide-y-0">
              {[
                ['Based on science', 'Using the latest research'],
                ['Personalized', 'Based on your demographics'],
                ['Without surgery', 'Non-surgical changes'],
              ].map(([title, description]) => (
                <div key={title} className="py-3 first:pt-0 last:pb-0 sm:px-3 sm:py-0 sm:first:pl-0 sm:last:pr-0">
                  <p className="text-sm font-medium tracking-tight sm:whitespace-nowrap lg:text-[clamp(0.625rem,2.6cqw,0.875rem)]">{title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:whitespace-nowrap lg:text-[clamp(0.5rem,2.05cqw,0.75rem)]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <Button className="h-11 w-full justify-between rounded-sm font-mono text-[11px] uppercase" onClick={onBegin}>
            Begin assessment
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          <p className="mt-6 max-w-sm text-xs leading-5 text-muted-foreground">
            By clicking begin, you agree that the uploaded images can be used to generate your private report.
          </p>
        </div>
      </aside>

      <IntroFacePreview />

      <div className="lg:hidden">
        <Button className="h-11 w-full justify-between rounded-sm font-mono text-[11px] uppercase" onClick={onBegin}>
          Begin assessment
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        <p className="mt-5 max-w-sm text-xs leading-5 text-muted-foreground">
          By clicking begin, you agree that the uploaded images can be used to generate your private report.
        </p>
      </div>
    </div>
  )
}

function UploadScreen({
  mobileScan,
  canStart,
  imagePosition,
  images,
  isPreparingUploads,
  onCamera,
  onImagePositionChange,
  onRemove,
  onSelect,
  onStart,
  onUpload,
  onUploadSide,
  onUseSample,
  previewImage,
  selectedImageId,
}: {
  mobileScan: boolean
  canStart: boolean
  imagePosition: CaptureFrameImagePosition
  images: AnalysisDraftImage[]
  isPreparingUploads: boolean
  onCamera: () => void
  onImagePositionChange: (position: CaptureFrameImagePosition) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  onStart: () => void
  onUpload: () => void
  onUseSample?: () => void
  onUploadSide?: () => void
  previewImage: string | null
  selectedImageId: string | null
}) {
  const feedback = useScanFeedback()
  if (mobileScan) return (
    <motion.div className="mobile-capture-screen" variants={scanSequence} initial="enter" animate="visible" exit="leave">
      {previewImage && <div data-scan-portrait="review" className="mobile-capture-photo">
        <CaptureFrame bare className="!absolute !inset-0 !h-full !max-w-none !rounded-none !shadow-none"
          imageSrc={previewImage} imageAlt="Your selected photo" imagePosition={imagePosition}
          onImagePositionChange={onImagePositionChange} />
      </div>}
      <div className="guided-scan-shade" aria-hidden="true" />
      <MobileCaptureRing />
      <motion.div variants={scanPart} custom={0}><MobileCaptureChrome /></motion.div>
      {!previewImage && <motion.div className="mobile-capture-permission" variants={scanPart}>
        <h2>Camera permission required</h2>
        <p>Allow camera access to capture a front-facing reference image.</p>
        {onUseSample && <button type="button" className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm" onClick={onUseSample}>Use sample photo</button>}
      </motion.div>}
      <AnimatePresence mode="wait">
        <motion.div key={previewImage ? 'review-actions' : 'capture-actions'} className="mobile-capture-dock" variants={scanPart} custom={20}>
          <motion.button type="button" className="mobile-capture-icon" aria-label="Choose a photo from your library"
            whileTap={{ scale: .94 }} onClick={() => { feedback(); onUpload() }}><ImagePlus size={24} /></motion.button>
          {previewImage ? <>
            <motion.button type="button" className="mobile-capture-primary" disabled={!canStart}
              whileTap={{ scale: .95 }} onClick={() => { feedback(); onStart() }}>
              {isPreparingUploads ? <Loader2 size={21} className="animate-spin" /> : <ScanFace size={21} />} Use photo
            </motion.button>
            <motion.button type="button" className="mobile-capture-icon" aria-label="Retake photo" whileTap={{ scale: .94 }}
              onClick={() => { feedback(); if (selectedImageId) onRemove(selectedImageId) }}><RotateCcw size={22} /></motion.button>
          </> : <motion.button type="button" className="mobile-capture-primary" whileTap={{ scale: .95 }}
            onClick={() => { feedback(); onCamera() }}><Camera size={17} /> Allow camera</motion.button>}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )

  const uploadButtonClass = 'h-10 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-medium text-black shadow-none hover:bg-zinc-50'

  return (
    <div className="grid min-h-[calc(100svh-5rem)] content-between public-gutters py-6 sm:py-8">
      <div className="grid min-h-[calc(100svh-10rem)] gap-8 lg:grid-cols-[0.76fr_1fr_0.76fr]">
        <div className="flex flex-col justify-center">
          <h1 className="max-w-[240px] text-4xl font-semibold leading-[0.9] tracking-[-0.06em] sm:text-5xl">
            Upload your image
          </h1>
          <p className="mt-5 max-w-[240px] text-sm leading-5 text-muted-foreground">
            Upload a clear front-facing photo. You can include up to three photos per checkout.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button className={uploadButtonClass} onClick={onUpload} variant="outline" disabled={images.length >= 3}>
              <Upload className="size-4" aria-hidden="true" />
              Upload
            </Button>
            <Button className={uploadButtonClass} onClick={onCamera} variant="outline" disabled={images.length >= 3}>
              <Camera className="size-4" aria-hidden="true" />
              Camera
            </Button>
          </div>
          {onUploadSide && <button type="button" className="mt-3 self-start text-sm font-medium underline underline-offset-4 disabled:opacity-50" disabled={images.length >= 3} onClick={onUploadSide}>Add side photo <span className="font-normal text-zinc-500">(optional, saved in this browser)</span></button>}
          <Button className="mt-4 hidden h-11 w-full max-w-[260px] justify-between rounded-sm font-mono text-[11px] uppercase lg:flex" onClick={onStart} disabled={!canStart}>
            {isPreparingUploads ? 'Preparing photo' : 'Continue'}
            {isPreparingUploads ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </div>

        <div className="grid content-center gap-4">
          <div className="mx-auto w-full max-w-[390px] p-1">
            <div className="bg-black p-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={previewImage ?? 'empty-preview'}
                  initial={{ opacity: 0, scale: 0.985, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.985, y: -8 }}
                  transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
                >
                  <CaptureFrame
                    className="max-w-[370px]"
                    landmarks={images.find((image) => image.id === selectedImageId)?.landmarks}
                    imageSrc={previewImage}
                    imageAlt="Primary uploaded preview"
                    imagePosition={imagePosition}
                    onEmptyClick={images.length >= 3 ? undefined : onUpload}
                    onImagePositionChange={previewImage ? onImagePositionChange : undefined}
                    onMediaClick={images.length >= 3 ? undefined : onUpload}
                    showStepIndicator={false}
                    stepLabel="Step 1 of 4"
                    subtitle="Center your face in the frame"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {previewImage ? (
            <div className="mx-auto grid w-full max-w-[390px] gap-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Zoom</span>
                <span>{Math.round(imagePosition.scale * 100)}%</span>
              </div>
              <input
                aria-label="Image zoom"
                className="analysis-zoom-slider w-full"
                max="3"
                min="1"
                onChange={(event) => onImagePositionChange({ ...imagePosition, scale: clampFrameScale(Number(event.target.value)) })}
                step="0.01"
                style={{ '--zoom-progress': `${((imagePosition.scale - 1) / 2) * 100}%` } as CSSProperties}
                type="range"
                value={imagePosition.scale}
              />
            </div>
          ) : null}

          {previewImage && selectedImageId ? (
            <div className="mx-auto flex w-full max-w-[390px] items-center justify-between gap-3">
              {images.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <button key={image.id} type="button" aria-pressed={image.id === selectedImageId} onClick={() => onSelect(image.id)} className={`rounded-sm border px-2.5 py-1.5 text-xs ${image.id === selectedImageId ? 'border-black bg-black text-white' : 'border-zinc-200 text-muted-foreground'}`}>
                      Photo {index + 1}
                    </button>
                  ))}
                </div>
              ) : <span className="text-xs text-muted-foreground">Photo 1</span>}
              <button type="button" onClick={() => onRemove(selectedImageId)} className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <X className="size-3.5" aria-hidden="true" /> Remove photo
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-center pb-8 text-sm text-muted-foreground lg:pb-0">
          <ul className="grid gap-3">
            <li>▪ Remove your glasses</li>
            <li>▪ Look directly at camera</li>
            <li>▪ Pull hair back</li>
            <li>▪ Keep neutral expression</li>
          </ul>
          <Button className="mt-6 h-11 w-full justify-between rounded-sm font-mono text-[11px] uppercase lg:hidden" onClick={onStart} disabled={!canStart}>
            {isPreparingUploads ? 'Preparing photo' : 'Continue'}
            {isPreparingUploads ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <StepRail active={1} />
    </div>
  )
}

function ProcessScreen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid min-h-[calc(100svh-5rem)] ${wide ? '' : 'place-items-center p-4 sm:p-8'}`}>
      <div className={`w-full ${wide ? '' : 'max-w-xl'}`}>{children}</div>
    </div>
  )
}

function StepRail({ active }: { active: 1 | 2 | 3 | 4 }) {
  const steps = ['Upload image', 'Comprehensive Analysis', 'Unlock Full Report', 'Personalized Protocol']

  return (
    <div className="font-mono text-[9px] uppercase text-muted-foreground sm:text-[10px]">
      <div className="h-3 overflow-hidden rounded-sm bg-zinc-100">
        <div className="creator-progress h-full bg-zinc-400" style={{ width: `${(active / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-3">
        {steps.map((label, index) => (
          <li key={label} aria-current={active === index + 1 ? 'step' : undefined} className="min-w-0 text-center first:text-left last:text-right">
            [ {String(index + 1).padStart(3, '0')} ] {label}
          </li>
        ))}
      </ol>
    </div>
  )
}

function PseudoAnalysisStep({ progress }: { progress: number }) {
  const activeIndex = Math.min(Math.floor(progress / 25), pseudoAnalysisItems.length - 1)

  return (
    <CenteredStep
      icon={<Sparkles className="size-6" aria-hidden="true" />}
      eyebrow="Pre-analysis"
      title="Preparing your assessment"
      description="We are checking whether the upload is usable before checkout."
    >
      <ProgressBar progress={progress} />
      <div className="mt-6 grid gap-2">
        {pseudoAnalysisItems.map((item, index) => (
          <div key={item} className="flex items-center gap-3 text-sm">
            <span className={`grid size-5 place-items-center rounded-full border ${index <= activeIndex ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>
              {index < activeIndex ? <Check className="size-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className={index <= activeIndex ? 'text-foreground' : 'text-muted-foreground'}>{item}</span>
          </div>
        ))}
      </div>
    </CenteredStep>
  )
}

function PaymentStep({
  error,
  imageCount,
  onCheckout,
}: {
  error: string | null
  imageCount: number
  onCheckout: () => void
}) {
  return (
    <CenteredStep
      icon={<CreditCard className="size-6" aria-hidden="true" />}
      eyebrow="Payment required"
      title="Unlock your full assessment"
      description={`One checkout unlocks the private analysis for ${imageCount || 1} uploaded image${imageCount === 1 ? '' : 's'}.`}
    >
      <div className="mt-6 rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Facial Aesthetic Assessment</span>
          <span className="font-mono text-sm">$4.99</span>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <Button className="mt-6 w-full" onClick={onCheckout}>
        Continue to Stripe
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </CenteredStep>
  )
}

const scanStatusLabels = ['Preparing image signal', 'Locking facial geometry', 'Mapping eye region', 'Tracing nose axis', 'Measuring midface balance', 'Reading cheekbone structure', 'Framing jawline vectors', 'Checking symmetry', 'Mapping skin regions', 'Preparing feature chapters']

function ScanProcessingLabel({ preparingPreview }: { preparingPreview: boolean }) {
  const [index, setIndex] = useState(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (preparingPreview || reduced) return
    const timer = window.setInterval(() => setIndex(current => (current + 1) % scanStatusLabels.length), 2700)
    return () => window.clearInterval(timer)
  }, [preparingPreview, reduced])
  return <p className="mobile-scan-shimmer"><TextMorph>{preparingPreview ? 'Mapping facial landmarks' : scanStatusLabels[index]}</TextMorph></p>
}

function ActualAnalysisScreen({
  preparingPreview = false,
  mobileScan,
  walkthrough,
  onRetake,
  onRetry,
  imageCount,
  checkoutError,
  checkoutLoading,
  imageSrc,
  isUnlocked,
  landmarks,
  onCheckout,
  onPaymentDialogChange,
  onPaymentRequired,
  paymentDialogOpen,
  returnOfferSessionId,
  progress,
}: {
  preparingPreview?: boolean
  mobileScan: boolean
  walkthrough: boolean
  onRetake: () => void
  onRetry: () => void
  imageCount: number
  checkoutError: string | null
  checkoutLoading: boolean
  imageSrc: string | null
  isUnlocked: boolean
  landmarks: FaceLandmarksPayload | null
  onCheckout: (product: AnalysisPurchase, quote: CheckoutQuote) => void
  onPaymentDialogChange: (open: boolean) => void
  onPaymentRequired: () => void
  paymentDialogOpen: boolean
  returnOfferSessionId: string | null
  progress: number
}) {
  const feedback = useScanFeedback()
  if (mobileScan && (isUnlocked || preparingPreview)) return (
    <motion.div className="mobile-scan-processing" initial={{ backgroundColor: '#121212' }} animate={{ backgroundColor: '#030303' }}>
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .48, delay: .4 }}>
        <h1>{preparingPreview ? 'Facial scan' : 'Portrait study'}</h1>
        <p>{preparingPreview ? 'Anchoring detected landmarks' : 'Preparing your guided walkthrough'}</p>
      </motion.header>
      <div data-scan-portrait="scanner" className="mobile-scan-processing-photo">
        <ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} variant="scanner" fit="cover" showLabel={false} />
      </div>
      <motion.div className="mobile-scan-processing-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .45, delay: .58 }} role="status">
        {checkoutError ? <>
          <strong>Evaluation paused</strong><p>{checkoutError}</p>
          <motion.button type="button" className="mobile-capture-primary" whileTap={{ scale: .95 }} onClick={() => { feedback(); onRetry() }}>Retry evaluation</motion.button>
        </> : <ScanProcessingLabel preparingPreview={preparingPreview} />}
      </motion.div>
    </motion.div>
  )

  return (
    <>
      {!isUnlocked ? <LockedReportPreview imageSrc={imageSrc ?? previewPhotoUrl} landmarks={landmarks} onUnlock={onPaymentRequired} onRetake={mobileScan ? onRetake : undefined} /> : (
      <div className="grid min-h-[calc(100svh-5rem)] gap-12 public-gutters py-6 sm:py-8 lg:grid-cols-[minmax(0,620px)_minmax(0,620px)] lg:items-center lg:justify-between lg:gap-20 xl:gap-28 2xl:gap-40">
        <div className="grid place-items-center lg:justify-items-start">
          <div className="flex aspect-[4/5] w-full max-w-[620px] flex-col">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Analysis //</p>
              <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[0.92] tracking-[-0.06em] sm:text-6xl">
                Generating your facial assessment
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
                Your uploaded image is being evaluated against the research-weighted rubric.
              </p>
            </div>

            <div className="flex flex-1 items-start pt-10 pb-6">
              <AnalysisTimeline
                isUnlocked={isUnlocked}
                onPaymentRequired={onPaymentRequired}
              />
            </div>

            <ProgressBar progress={isUnlocked ? progress : 24} />
            {!isUnlocked ? <button type="button" className="mt-4 self-start text-sm font-medium underline underline-offset-4" onClick={onPaymentRequired}>Unlock full report <ArrowRight className="ml-1 inline size-4" aria-hidden="true" /></button> : null}
          </div>
        </div>

        <div className="grid place-items-center lg:justify-items-end">
          <motion.div layoutId="analysis-portrait" className="w-full max-w-[390px]"><ScanImagePanel key={imageSrc} imageSrc={imageSrc} landmarks={landmarks} paused={paymentDialogOpen} /></motion.div>
        </div>
      </div>

      )}

      <AnalysisUnlockDialog
        walkthrough={walkthrough}
        fullscreen={mobileScan}
        imageCount={imageCount}
        imageSrc={imageSrc}
        landmarks={landmarks}
        error={checkoutError}
        loading={checkoutLoading}
        open={paymentDialogOpen}
        returnOfferSessionId={returnOfferSessionId}
        onCheckout={onCheckout}
        onOpenChange={onPaymentDialogChange}
      />
    </>
  )
}

function AnalysisTimeline({
  isUnlocked,
  onPaymentRequired,
}: {
  isUnlocked: boolean
  onPaymentRequired: () => void
}) {
  const [activeIndex, setActiveIndex] = useState(isUnlocked ? 2 : 0)
  const [expandedIndex, setExpandedIndex] = useState(isUnlocked ? 2 : 0)
  const paymentRequestedRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => {
        const maxIndex = isUnlocked ? analysisTimeline.length - 1 : 1
        return Math.min(current + 1, maxIndex)
      })
    }, 6_400)

    return () => clearInterval(timer)
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked || activeIndex >= 2) return

    setActiveIndex(2)
    setExpandedIndex(2)
  }, [activeIndex, isUnlocked])

  useEffect(() => {
    if (isUnlocked || activeIndex < 1 || paymentRequestedRef.current) return

    paymentRequestedRef.current = true
    const timer = setTimeout(onPaymentRequired, 1_200)

    return () => clearTimeout(timer)
  }, [activeIndex, isUnlocked, onPaymentRequired])

  useEffect(() => {
    const timer = setTimeout(() => {
      setExpandedIndex(activeIndex)
    }, 1_650)

    return () => clearTimeout(timer)
  }, [activeIndex])

  return (
    <div className="relative grid gap-5">
      <div className="absolute bottom-2 left-[5px] top-2 w-px bg-zinc-200" />
      {analysisTimeline.map((step, index) => {
        const isActive = index === activeIndex
        const isVisible = index <= activeIndex
        const isExpanded = index === expandedIndex && isVisible
        const shouldShimmer = isActive || (index === expandedIndex && expandedIndex < activeIndex)

        if (!isVisible) return null

        return (
          <motion.div
            key={step.title}
            layout
            className="relative pl-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ layout: { duration: 0.62, ease: [0.23, 1, 0.32, 1] }, duration: 0.44, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className={`absolute left-0 top-1.5 size-2.5 rounded-full border ${isActive ? 'border-black bg-black' : 'border-zinc-300 bg-white'}`} />
            {shouldShimmer ? (
              <TextShimmer className="text-base font-medium tracking-[-0.025em] sm:text-lg" duration={1.1}>
                {step.title}
              </TextShimmer>
            ) : (
              <p className="text-base font-medium tracking-[-0.025em] text-black/78 sm:text-lg">{step.title}</p>
            )}

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  key={`${step.title}-substeps`}
                  className="mt-2 overflow-hidden pl-4 font-mono text-xs uppercase tracking-wide text-muted-foreground"
                  initial={{ height: 0, opacity: 0, y: -6 }}
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  transition={{
                    height: { duration: 0.68, ease: [0.23, 1, 0.32, 1] },
                    opacity: { duration: 0.42, ease: 'easeOut' },
                    y: { duration: 0.52, ease: [0.23, 1, 0.32, 1] },
                  }}
                >
                  <TextLoop interval={3.4} transition={{ duration: 0.58, ease: [0.23, 1, 0.32, 1] }}>
                    {step.substeps.map((substep) => (
                      <span key={substep}>{substep}</span>
                    ))}
                  </TextLoop>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}

function ResultsStep({
  mobileScan,
  primaryScore,
  results,
  sidePortrait,
  onOpenShare,
  onReset,
}: {
  mobileScan: boolean
  primaryScore: number | null
  results: AnalysisResponse[]
  sidePortrait: AnalysisDraftImage | null
  onOpenShare: () => void
  onReset: () => void
}) {
  const primaryResult = results[0]
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
      scoreLabel: report?.scoreLabel ?? category.scoreLabel,
      explanation: report?.explanation,
      eyeColor: report?.eyeColor,
      features: report?.features?.length ? report.features : category.features,
      score: getReportCategoryScore(category.id, primaryResult),
    }
  })
  if (primaryResult?.analysis.metrics.webReportV2?.version === 2) {
    return <WebAnalysisReport mobileScan={mobileScan} potentialScore={potentialScore} initialCategoryId={mobileScan ? "overall" : undefined} portraitLayoutId="analysis-portrait" portraits={portraits} report={primaryResult.analysis.metrics.webReportV2} imageSrc={primaryResult.photo.imageUrl} landmarks={landmarks} pslScore={primaryScore ?? 1}>
      {!mobileScan && <ReportActions score={primaryResult.analysis.metrics.webReportV2.overallScore} onOpenShare={onOpenShare} onReset={onReset} />}
    </WebAnalysisReport>
  }
  return (
    <LegacyAnalysisReport mobileScan={mobileScan} potentialScore={potentialScore} initialCategoryId={mobileScan ? "overall" : undefined} portraitLayoutId="analysis-portrait" portraits={portraits} categories={categories} imageSrc={primaryResult?.photo.imageUrl ?? previewPhotoUrl} landmarks={landmarks} score={score} pslScore={primaryScore}>
      {!mobileScan && <ReportActions score={score} onOpenShare={onOpenShare} onReset={onReset} />}
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
    playDownload()
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

function CenteredStep({
  children,
  description,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode
  description: string
  eyebrow: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="mx-auto grid min-h-[520px] max-w-md content-center">
      <div className="mb-5 grid size-12 place-items-center rounded-lg border bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{eyebrow} {'//'}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full bg-foreground" animate={{ width: `${progress}%` }} transition={{ duration: 0.2, ease: 'easeOut' }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase text-muted-foreground">
        <span>{Math.round(progress)}%</span>
        <span>Processing</span>
      </div>
    </div>
  )
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value?.toFixed(1) ?? '--'}</div>
    </div>
  )
}

async function prepareImagesForAnalysis(images: AnalysisDraftImage[], framePositions: ImageFramePositions) {
  return Promise.all(images.map(async (image) => {
    const position = framePositions[image.id] ?? defaultFramePosition
    if (position.x === 50 && position.y === 50 && position.scale === 1) return image

    const dataUrl = await cropImageDataUrlToFrame(image.dataUrl, position)
    return {
      ...image,
      dataUrl,
      landmarks: null,
      mesh: null,
    }
  }))
}

async function cropImageDataUrlToFrame(dataUrl: string, position: CaptureFrameImagePosition) {
  const image = await loadImageElement(dataUrl)
  const frameAspectRatio = 9 / 16
  const imageAspectRatio = image.naturalWidth / image.naturalHeight
  const baseSourceWidth = imageAspectRatio > frameAspectRatio ? image.naturalHeight * frameAspectRatio : image.naturalWidth
  const baseSourceHeight = imageAspectRatio > frameAspectRatio ? image.naturalHeight : image.naturalWidth / frameAspectRatio
  const sourceWidth = baseSourceWidth / position.scale
  const sourceHeight = baseSourceHeight / position.scale
  const sourceX = ((image.naturalWidth - sourceWidth) * position.x) / 100
  const sourceY = ((image.naturalHeight - sourceHeight) * position.y) / 100
  const canvas = document.createElement('canvas')

  canvas.width = 1080
  canvas.height = 1920

  const context = canvas.getContext('2d')
  if (!context) return dataUrl

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

function buildPaidAnalysisHeaders(paymentInstallId: string | null): HeadersInit | undefined {
  return paymentInstallId
    ? {
        'x-mogging-mobile-install-id': paymentInstallId,
      }
    : undefined
}

function clampFrameScale(value: number) {
  return Math.max(1, Math.min(3, Math.round(value * 100) / 100))
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for cropping'))
    image.src = src
  })
}

function readImageFile(file: File) {
  return new Promise<AnalysisDraftImage>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image file'))
        return
      }

      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: reader.result,
        hairColor: null,
        skinColor: null,
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
