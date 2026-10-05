import { pslToOverallScore } from '@/lib/analysis/score-scale'
import { trackWebEvent } from '@/lib/analytics/client'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  CreditCard,
  Download,
  Gem,
  Loader2,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { IntroFacePreview } from '@/components/analysis/intro-face-preview'
import { useRouter } from 'next/router'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useSound } from '@web-kits/audio/react'
import useSWR from 'swr'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { selectSound } from '@/lib/audio/sounds'
import {
  clearAnalysisDraft,
  loadAnalysisDraft,
  saveAnalysisDraft,
  type AnalysisDraftImage,
} from '@/lib/client/analysisDraft'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload, type NormalizedPoint } from '@/lib/analysis/landmarks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoginDialog } from '@/components/app/app-shell'
import { SeoHead } from '@/components/app/seo-head'
import { CaptureFrame, type CaptureFrameImagePosition } from '@/components/analysis/capture-frame'
import { TextLoop } from '@/components/core/text-loop'
import { TextShimmer } from '@/components/core/text-shimmer'

const AnalysisReport = dynamic(() => import('@/components/analysis/analysis-report').then((module) => module.AnalysisReport))
const ReportActions = dynamic(() => import('@/components/analysis/analysis-report').then((module) => module.ReportActions))
const CameraSheet = dynamic(() => import('@/components/analysis/camera-sheet').then((module) => module.CameraSheet))

type FlowStep = 'intro' | 'upload' | 'preview-analysis' | 'payment' | 'actual-analysis' | 'results'

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

type AnalysisMetrics = Record<string, unknown> & {
  report?: AnalysisReport | null
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
  categories: AnalysisReportCategory[]
}

type VerifyPaymentResponse = {
  paid: boolean
  sessionId: string
}

type ShareResponse = {
  share: {
    token: string
  }
}

type PhotoPrivacyResponse = {
  photo: {
    id: string
    isPublic: boolean
  }
}

type AppConfig = {
  features: {
    authRequired: boolean
    paidAnalysisRequired: boolean
  }
}

type CheckoutResponse = {
  url: string
}

type ClaimPaymentResponse = {
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
const analysisWebInstallStorageKey = 'mogging:analysis:web-install-id'

const pseudoAnalysisItems = [
  'Detecting facial reference lines',
  'Checking image quality',
  'Mapping proportional landmarks',
  'Preparing private report',
]
const previewPhotoUrl = '/model.png'
const paymentDialogImageUrl = 'https://cdn-blog.prose.com/1/2023/10/Untitled-1-4.jpg'
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
const mosaicPermutations = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [1, 5, 2, 6, 4, 0, 3, 7, 8],
  [6, 1, 3, 2, 4, 7, 0, 8, 5],
  [8, 3, 0, 1, 4, 6, 7, 5, 2],
  [2, 0, 5, 3, 4, 1, 8, 6, 7],
]
const originalMosaicPermutation = mosaicPermutations[0]

type ReportFeature = {
  label: string
  value: string
  measurement?: string
}

type ReportOverlayPoint = {
  x: number
  y: number
}

type ReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  features: ReportFeature[]
}

const reportCategories: ReportCategory[] = [
  {
    id: 'eyes',
    title: 'Eyes',
    subtitle: 'Periocular balance and eye-line structure',
    scoreLabel: 'Eye area',
    features: [
      { label: 'Canthal tilt', value: 'Positive' },
      { label: 'Spacing', value: 'balanced width' },
      { label: 'Upper lid', value: 'defined support' },
      { label: 'Periocular match', value: 'strong signal' },
    ],
  },
  {
    id: 'nose',
    title: 'Nose',
    subtitle: 'Bridge alignment and central facial axis',
    scoreLabel: 'Nasal balance',
    features: [
      { label: 'Bridge', value: 'straight contour' },
      { label: 'Midline drift', value: 'minimal drift' },
      { label: 'Width', value: 'moderate width' },
      { label: 'Bridge projection', value: 'clear contour' },
    ],
  },
  {
    id: 'mouth',
    title: 'Mouth',
    subtitle: 'Lip shape, width, and lower-third fit',
    scoreLabel: 'Mouth harmony',
    features: [
      { label: 'Width', value: 'proportional width' },
      { label: 'Cupid bow', value: 'visible contour' },
      { label: 'Lower lip', value: 'balanced fullness' },
      { label: 'Mouth line tilt', value: 'near level' },
    ],
  },
  {
    id: 'jaw',
    title: 'Jaw',
    subtitle: 'Mandible definition and chin support',
    scoreLabel: 'Jawline',
    features: [
      { label: 'Gonial angle', value: 'defined angle' },
      { label: 'Chin height', value: 'strong support' },
      { label: 'Mandible', value: 'clear edge definition' },
      { label: 'Neck transition', value: 'clear contour' },
    ],
  },
  {
    id: 'dimorphism',
    title: 'Dimorphism',
    subtitle: 'Sex-typical cues weighted against harmony',
    scoreLabel: 'Dimorphism',
    features: [
      { label: 'Brow frame', value: 'moderate structure' },
      { label: 'Midface', value: 'refined proportion' },
      { label: 'Lower third', value: 'structured contour' },
      { label: 'Soft tissue', value: 'balanced fullness' },
    ],
  },
  {
    id: 'face-shape',
    title: 'Face shape',
    subtitle: 'Frame, thirds, and silhouette continuity',
    scoreLabel: 'Face shape',
    features: [
      { label: 'Outline', value: 'oval tendency' },
      { label: 'Upper third', value: 'balanced thirds' },
      { label: 'Midface', value: 'compact proportion' },
      { label: 'Lower third', value: 'defined frame' },
    ],
  },
  {
    id: 'facial-fat',
    title: 'Soft tissue',
    subtitle: 'Visible facial fullness',
    scoreLabel: 'Soft tissue',
    features: [
      { label: 'Cheeks', value: 'balanced fullness' },
      { label: 'Jaw blur', value: 'low blur' },
      { label: 'Under-chin', value: 'lean contour' },
      { label: 'Fullness cue', value: 'low visible fullness' },
    ],
  },
  {
    id: 'biological-age',
    title: 'Human age',
    subtitle: 'Visible age and texture cues',
    scoreLabel: 'Age signal',
    features: [
      { label: 'Texture age cue', value: 'low visible texture' },
      { label: 'Under-eye cue', value: 'low shadowing' },
      { label: 'Facial fullness', value: 'youthful fullness' },
      { label: 'Presentation', value: 'clear capture' },
    ],
  },
  {
    id: 'symmetry',
    title: 'Symmetry',
    subtitle: 'Left-right balance across visible landmarks',
    scoreLabel: 'Symmetry',
    features: [
      { label: 'Eye line tilt', value: 'near level' },
      { label: 'Nose midline', value: 'minimal drift' },
      { label: 'Mouth line tilt', value: 'near level' },
      { label: 'Chin axis', value: 'minor drift' },
    ],
  },
  {
    id: 'overall',
    title: 'Overall',
    subtitle: 'Final calibrated assessment',
    scoreLabel: 'Overall score',
    features: [
      { label: 'Harmony', value: 'strong signal' },
      { label: 'Structure', value: 'strong signal' },
      { label: 'Balance', value: 'consistent baseline' },
      { label: 'Percentile', value: 'upper range' },
    ],
  },
]
export default function AnalysisPage() {
  const router = useRouter()
  const { status } = useSession()
  const playSelect = useSound(selectSound)
  const { data: appConfig } = useSWR<AppConfig>('/api/app-config', apiGet, {
    shouldRetryOnError: false,
  })
  const authRequired = appConfig?.features.authRequired ?? false
  const paidAnalysisRequired = appConfig?.features.paidAnalysisRequired ?? false
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<AnalysisDraftImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other')
  const [step, setStep] = useState<FlowStep>('intro')
  const analyticsFlow = useRef<string>('')
  useEffect(() => {
    analyticsFlow.current ||= crypto.randomUUID()
    trackWebEvent('onboarding_step_viewed', { step, flow_id: analyticsFlow.current, surface: 'web_analysis' })
    if (step === 'payment') trackWebEvent('paywall_viewed', { surface: 'web_analysis', paywall_id: 'web_analysis', paywall_version: '1', flow_id: analyticsFlow.current })
    if (step === 'results') trackWebEvent('report_viewed', { surface: 'web_analysis', flow_id: analyticsFlow.current })
  }, [step])
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<AnalysisResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [analysisUnlocked, setAnalysisUnlocked] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const loadedAnalysisIdRef = useRef<string | null>(null)
  const [battleOptOutByPhotoId, setBattleOptOutByPhotoId] = useState<Record<string, boolean>>({})
  const [battleOptOutSaving, setBattleOptOutSaving] = useState(false)
  const [landmarkPendingIds, setLandmarkPendingIds] = useState<Record<string, boolean>>({})
  const [imageFramePositions, setImageFramePositions] = useState<ImageFramePositions>({})

  const primaryResult = results[0]
  const primaryScore = primaryResult?.analysis.pslScore ?? null
  const isPreparingUploads = Object.values(landmarkPendingIds).some(Boolean)
  const canStart = images.length > 0 && step === 'upload' && !isPreparingUploads

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? images[images.length - 1] ?? null,
    [images, selectedImageId],
  )
  const previewImage = selectedImage?.dataUrl ?? null

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 3 - images.length)
    if (files.length === 0) return

    const nextImages = await Promise.all(files.map(readImageFile))
    const visibleNextImages = nextImages.slice(0, Math.max(0, 3 - images.length))
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

  async function startPseudoAnalysis() {
    if (!canStart) return
    playSelect()
    if (authRequired && status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    const preparedImages = await prepareImagesForAnalysis(images, imageFramePositions)

    setImages(preparedImages)
    setError(null)
    setAnalysisUnlocked(!paidAnalysisRequired)
    setPaymentDialogOpen(false)
    setProgress(18)
    setStep('actual-analysis')

    if (!paidAnalysisRequired) {
      void runActualAnalysis(preparedImages)
    }
  }

  function beginAssessment() {
    if (authRequired && status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    setStep('upload')
  }

  async function startCheckout() {
    if (authRequired && status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    if (!paidAnalysisRequired) {
      setAnalysisUnlocked(true)
      setPaymentDialogOpen(false)
      setStep('actual-analysis')
      setProgress(30)
      void runActualAnalysis()
      return
    }

    setCheckoutLoading(true)
    setError(null)

    try {
      const paymentInstallId = ensureAnalysisWebInstallId()
      await saveAnalysisDraft({
        gender,
        images,
        savedAt: Date.now(),
      })
      const response = await apiPost<CheckoutResponse>('/api/payments/checkout', {
        imageCount: images.length,
        mobileInstallId: paymentInstallId,
      })
      window.location.href = response.url
    } catch (checkoutError) {
      setError(checkoutError instanceof ApiClientError ? checkoutError.message : 'Unable to open checkout')
      setCheckoutLoading(false)
    }
  }

  async function runActualAnalysis(draftImages = images, paymentInstallId: string | null = null) {
    if (draftImages.length === 0) {
      setStep('upload')
      setError('Upload an image before starting analysis.')
      return
    }
    if (paidAnalysisRequired && !paymentInstallId) {
      setStep('payment')
      setPaymentDialogOpen(true)
      setError('Complete checkout before generating your report.')
      return
    }

    const analyticsStarted = Date.now()
    const attemptId = crypto.randomUUID()
    trackWebEvent('evaluation_started', { attempt_id: attemptId, flow_id: analyticsFlow.current, surface: 'web_analysis' })
    try {
      const analysisResults: AnalysisResponse[] = []

      for (const [index, image] of draftImages.entries()) {
        setProgress(Math.round(30 + (index / draftImages.length) * 62))
        const result = await apiPost<AnalysisResponse>('/api/analyze', {
          imageData: image.dataUrl,
          gender,
          photoType: 'face',
          name: image.name,
          hairColor: image.hairColor ?? null,
          skinColor: image.skinColor ?? null,
          landmarks: image.landmarks ?? null,
        }, {
          headers: buildPaidAnalysisHeaders(paymentInstallId),
        })
        analysisResults.push(result)
      }

      setProgress(100)
      setResults(analysisResults)
      trackWebEvent('evaluation_completed', { attempt_id: attemptId, flow_id: analyticsFlow.current, duration_ms: Date.now() - analyticsStarted, surface: 'web_analysis' })
      setStep('results')
      await clearAnalysisDraft()
    } catch (analysisError) {
      trackWebEvent('evaluation_failed', { attempt_id: attemptId, flow_id: analyticsFlow.current, duration_ms: Date.now() - analyticsStarted, reason_code: 'request_failed', surface: 'web_analysis' })
      setStep('actual-analysis')
      setError(analysisError instanceof ApiClientError ? analysisError.message : 'Analysis failed')
    }
  }

  async function toggleBattleOptOut(photoId: string, optOut: boolean) {
    const previousValue = battleOptOutByPhotoId[photoId] ?? !results.find((result) => result.photo.id === photoId)?.photo.isPublic
    setBattleOptOutByPhotoId((current) => ({ ...current, [photoId]: optOut }))
    setBattleOptOutSaving(true)

    try {
      await apiPost<PhotoPrivacyResponse>('/api/photos/privacy', {
        photoId,
        isPublic: !optOut,
      })
      toast.success(optOut ? 'Removed from battle arena and leaderboard' : 'Published to battle arena and leaderboard')
    } catch (privacyError) {
      setBattleOptOutByPhotoId((current) => ({ ...current, [photoId]: previousValue }))
      toast.error(privacyError instanceof ApiClientError ? privacyError.message : 'Unable to update battle setting')
    } finally {
      setBattleOptOutSaving(false)
    }
  }

  const resumeAfterPayment = useCallback(async (sessionId: string, checkoutInstallId: string | null) => {
    try {
      setError(null)
      setAnalysisUnlocked(true)
      setPaymentDialogOpen(false)
      setStep('actual-analysis')
      setProgress(28)
      const paymentInstallId = ensureAnalysisWebInstallId(checkoutInstallId)

      const [verification, draft] = await Promise.all([
        apiGet<VerifyPaymentResponse>(`/api/payments/verify?session_id=${encodeURIComponent(sessionId)}`),
        loadAnalysisDraft(),
      ])

      if (!verification.paid) {
        setStep('payment')
        setError('Payment has not completed yet.')
        return
      }

      if (!draft || draft.images.length === 0) {
        setStep('upload')
        setError('Upload draft expired. Please upload your images again.')
        return
      }

      await apiPost<ClaimPaymentResponse>('/api/payments/claim', {
        sessionId,
        mobileInstallId: paymentInstallId,
      })

      setImages(draft.images)
      setSelectedImageId(draft.images[draft.images.length - 1]?.id ?? null)
      setGender(draft.gender)

      const analysisResults: AnalysisResponse[] = []
      for (const [index, image] of draft.images.entries()) {
        setProgress(Math.round(28 + (index / draft.images.length) * 62))
        const result = await apiPost<AnalysisResponse>('/api/analyze', {
          imageData: image.dataUrl,
          gender: draft.gender,
          photoType: 'face',
          name: image.name,
          hairColor: image.hairColor ?? null,
          skinColor: image.skinColor ?? null,
          landmarks: image.landmarks ?? null,
        }, {
          headers: buildPaidAnalysisHeaders(paymentInstallId),
        })
        analysisResults.push(result)
      }

      setProgress(100)
      setResults(analysisResults)
      setStep('results')
      await clearAnalysisDraft()
      void router.replace('/analysis', undefined, { shallow: true })
    } catch (analysisError) {
      setStep('actual-analysis')
      setError(analysisError instanceof ApiClientError ? analysisError.message : 'Analysis failed after payment')
    }
  }, [router])

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== 'success') return

    const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : null
    const checkoutInstallId = typeof router.query.install_id === 'string' ? router.query.install_id : null
    if (!sessionId) return

    void resumeAfterPayment(sessionId, checkoutInstallId)
  }, [resumeAfterPayment, router.isReady, router.query.checkout, router.query.install_id, router.query.session_id])

  useEffect(() => {
    if (paidAnalysisRequired && router.isReady && router.query.checkout === 'cancelled') {
      setStep('actual-analysis')
      setAnalysisUnlocked(false)
      setPaymentDialogOpen(true)
      setError('Payment was cancelled. Your uploaded images are still ready.')
    }
  }, [paidAnalysisRequired, router.isReady, router.query.checkout])

  useEffect(() => {
    if (!router.isReady) return

    const analysisId = typeof router.query.analysisId === 'string' ? router.query.analysisId : null
    if (!analysisId || loadedAnalysisIdRef.current === analysisId) return

    loadedAnalysisIdRef.current = analysisId
    let cancelled = false
    setError(null)

    void apiGet<AnalysisResponse>(`/api/analysis/${encodeURIComponent(analysisId)}`)
      .then((result) => {
        if (cancelled) return
        setResults([result])
        setStep('results')
        setImages([])
        setSelectedImageId(null)
        setImageFramePositions({})
        setShareUrl(null)
        setBattleOptOutByPhotoId({
          [result.photo.id]: !result.photo.isPublic,
        })
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
      const [{ extractFaceLandmarksFromDataUrl }, { inferHairColorFromDataUrl, inferSkinColorFromDataUrl }] = await Promise.all([
        import('@/lib/client/faceLandmarks'),
        import('@/lib/client/appearance'),
      ])
      const landmarks = await extractFaceLandmarksFromDataUrl(image.dataUrl)
      const [hairColor, skinColor] = await Promise.all([
        inferHairColorFromDataUrl(image.dataUrl, landmarks),
        inferSkinColorFromDataUrl(image.dataUrl, landmarks),
      ])

      setImages((current) => current.map((currentImage) => (
        currentImage.id === image.id ? { ...currentImage, hairColor, skinColor, landmarks } : currentImage
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

  return (
    <div className="min-h-[calc(100svh-5rem)] w-full bg-white">
      <SeoHead
        title="Mogging Analysis"
        description="Upload your face photo and generate a private PSL report with facial feature annotations."
        path="/analysis"
      />
      <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handleFiles} />

      <section className="min-h-[calc(100svh-5rem)] overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          {step === 'intro' ? (
            <ScreenMotion key="intro">
              <IntroScreen onBegin={beginAssessment} />
            </ScreenMotion>
          ) : null}

          {step === 'upload' ? (
            <ScreenMotion key="upload">
              <UploadScreen
                images={images}
                isPreparingUploads={isPreparingUploads}
                previewImage={previewImage}
                imagePosition={selectedImage ? (imageFramePositions[selectedImage.id] ?? defaultFramePosition) : defaultFramePosition}
                selectedImageId={selectedImage?.id ?? null}
                canStart={canStart}
                onCamera={() => setCameraOpen(true)}
                onImagePositionChange={(position) => {
                  if (!selectedImage) return
                  setImageFramePositions((current) => ({ ...current, [selectedImage.id]: position }))
                }}
                onRemove={removeImage}
                onSelect={setSelectedImageId}
                onStart={startPseudoAnalysis}
                onUpload={() => uploadInputRef.current?.click()}
              />
            </ScreenMotion>
          ) : null}

          {step === 'preview-analysis' ? (
            <ScreenMotion key="preview-analysis">
              <ActualAnalysisScreen
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images[0]?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={selectedImage?.landmarks ?? images[0]?.landmarks ?? null}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'payment' ? (
            <ScreenMotion key="payment">
              <ActualAnalysisScreen
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images[0]?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={selectedImage?.landmarks ?? images[0]?.landmarks ?? null}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'actual-analysis' ? (
            <ScreenMotion key="actual-analysis">
              <ActualAnalysisScreen
                checkoutError={error}
                checkoutLoading={checkoutLoading}
                imageSrc={images[0]?.dataUrl ?? previewImage}
                isUnlocked={analysisUnlocked}
                landmarks={selectedImage?.landmarks ?? images[0]?.landmarks ?? null}
                paymentDialogOpen={paymentDialogOpen}
                progress={progress}
                onCheckout={startCheckout}
                onPaymentDialogChange={setPaymentDialogOpen}
                onPaymentRequired={() => {
                  if (paidAnalysisRequired) setPaymentDialogOpen(true)
                }}
              />
            </ScreenMotion>
          ) : null}

          {step === 'results' ? (
            <ScreenMotion key="results">
              <ProcessScreen wide>
                <ResultsStep
                  primaryScore={primaryScore}
                  results={results}
                  onOpenShare={() => setShareOpen(true)}
                  onReset={() => {
                    setImages([])
                    setSelectedImageId(null)
                    setImageFramePositions({})
                    setResults([])
                    setBattleOptOutByPhotoId({})
                    setStep('intro')
                    setShareUrl(null)
                  }}
                  battleOptOut={primaryResult ? (battleOptOutByPhotoId[primaryResult.photo.id] ?? !primaryResult.photo.isPublic) : true}
                  battleOptOutSaving={battleOptOutSaving || primaryResult?.canManage === false}
                  onBattleOptOutChange={(optOut) => {
                    if (!primaryResult) return
                    void toggleBattleOptOut(primaryResult.photo.id, optOut)
                  }}
                />
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
      {cameraOpen ? (
        <CameraSheet
          open={cameraOpen}
          onCapture={addCameraImage}
          onClose={() => setCameraOpen(false)}
          onUpload={() => {
            setCameraOpen(false)
            window.setTimeout(() => uploadInputRef.current?.click(), 160)
          }}
        />
      ) : null}
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        callbackUrl={router.asPath || '/analysis'}
      />
    </div>
  )
}

function ScreenMotion({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="min-h-[calc(100svh-5rem)]"
      initial={{ opacity: 0, y: 18, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.992 }}
      transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  )
}

function IntroScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="grid min-h-[calc(100svh-5rem)] gap-8 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 xl:gap-24 2xl:gap-32">
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
  previewImage,
  selectedImageId,
}: {
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
  previewImage: string | null
  selectedImageId: string | null
}) {
  const uploadButtonClass = 'h-10 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-medium text-black shadow-none hover:bg-zinc-50'

  return (
    <div className="grid min-h-[calc(100svh-5rem)] content-between px-5 py-6 sm:px-10 sm:py-8">
      <div className="grid min-h-[calc(100svh-10rem)] gap-8 lg:grid-cols-[0.76fr_1fr_0.76fr]">
        <div className="flex flex-col justify-center">
          <h1 className="max-w-[240px] text-4xl font-semibold leading-[0.9] tracking-[-0.06em] sm:text-5xl">
            Upload your image
          </h1>
          <p className="mt-5 max-w-[240px] text-sm leading-5 text-muted-foreground">
            Take or upload up to three clear front-facing photos.
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
          <Button className="mt-4 hidden h-11 w-full max-w-[260px] justify-between rounded-sm font-mono text-[11px] uppercase lg:flex" onClick={onStart} disabled={!canStart}>
            {isPreparingUploads ? 'Uploading' : 'Continue'}
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
                    className="max-w-[370px] rounded-[34px]"
                    imageSrc={previewImage}
                    imageAlt="Primary uploaded preview"
                    imagePosition={imagePosition}
                    onEmptyClick={images.length >= 3 ? undefined : onUpload}
                    onImagePositionChange={previewImage ? onImagePositionChange : undefined}
                    onMediaClick={images.length >= 3 ? undefined : onUpload}
                    showStepIndicator={false}
                    stepLabel="Step 1 of 3"
                    title="Look straight ahead"
                    subtitle={previewImage ? 'Center your face in the frame' : 'Upload or take a photo'}
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

          {images.length > 0 ? (
            <div className="mx-auto grid w-full max-w-[760px] grid-cols-[repeat(2,10rem)] justify-center gap-3 sm:grid-cols-[repeat(3,11.5rem)] sm:gap-4">
              {images.map((image) => (
                <UploadThumbnail
                  key={image.id}
                  image={image}
                  isSelected={selectedImageId === image.id}
                  onRemove={onRemove}
                  onSelect={onSelect}
                />
              ))}
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
            {isPreparingUploads ? 'Uploading' : 'Continue'}
            {isPreparingUploads ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <StepRail active={1} />
    </div>
  )
}

const UploadThumbnail = memo(function UploadThumbnail({
  image,
  isSelected,
  onRemove,
  onSelect,
}: {
  image: AnalysisDraftImage
  isSelected: boolean
  onRemove: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`group relative size-40 overflow-hidden rounded-md border bg-muted transition-[border-color,box-shadow,transform] duration-200 ease-out hover:scale-[1.01] sm:size-[11.5rem] ${
        isSelected ? 'border-black shadow-[0_10px_30px_rgba(15,23,42,0.12)]' : 'border-zinc-200'
      }`}
      onClick={() => onSelect(image.id)}
      type="button"
    >
      <img
        alt={image.name}
        className="h-full w-full object-cover"
        decoding="async"
        draggable={false}
        loading="eager"
        src={image.dataUrl}
      />
      <span
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-background/95 opacity-100 shadow-sm transition-colors hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(image.id)
        }}
      >
        <X className="size-3.5" aria-hidden="true" />
      </span>
    </button>
  )
})

function ProcessScreen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid min-h-[calc(100svh-5rem)] ${wide ? '' : 'place-items-center p-4 sm:p-8'}`}>
      <div className={`w-full ${wide ? '' : 'max-w-xl'}`}>{children}</div>
    </div>
  )
}

function StepRail({ active }: { active: 1 | 2 | 3 }) {
  return (
    <div className="font-mono text-[10px] uppercase text-muted-foreground">
      <div className="h-3 overflow-hidden rounded-sm bg-zinc-100">
        <div className="h-full bg-zinc-400" style={{ width: `${(active / 3) * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3">
        <span>[ 001 ] Upload image</span>
        <span className="text-center">[ 002 ] Payment</span>
        <span className="text-right">[ 003 ] Finish</span>
      </div>
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

function ActualAnalysisScreen({
  checkoutError,
  checkoutLoading,
  imageSrc,
  isUnlocked,
  landmarks,
  onCheckout,
  onPaymentDialogChange,
  onPaymentRequired,
  paymentDialogOpen,
  progress,
}: {
  checkoutError: string | null
  checkoutLoading: boolean
  imageSrc: string | null
  isUnlocked: boolean
  landmarks: FaceLandmarksPayload | null
  onCheckout: () => void
  onPaymentDialogChange: (open: boolean) => void
  onPaymentRequired: () => void
  paymentDialogOpen: boolean
  progress: number
}) {
  return (
    <>
      <div className="grid min-h-[calc(100svh-5rem)] gap-12 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[minmax(0,620px)_minmax(0,620px)] lg:items-center lg:justify-between lg:gap-20 xl:gap-28 2xl:gap-40">
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
          </div>
        </div>

        <div className="grid place-items-center lg:justify-items-end">
          <MosaicImage imageSrc={imageSrc} landmarks={landmarks} />
        </div>
      </div>

      <AnalysisPaymentDialog
        error={checkoutError}
        loading={checkoutLoading}
        open={paymentDialogOpen}
        onCheckout={onCheckout}
        onOpenChange={(open) => {
          if (open) onPaymentDialogChange(true)
        }}
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

function MosaicImage({ imageSrc, landmarks }: { imageSrc: string | null; landmarks: FaceLandmarksPayload | null }) {
  const [phase, setPhase] = useState(0)
  const [mode, setMode] = useState<'shuffle' | 'assembled' | 'annotated'>('shuffle')
  const src = imageSrc || previewPhotoUrl
  const permutation = mode === 'shuffle'
    ? mosaicPermutations[(phase % (mosaicPermutations.length - 1)) + 1]
    : originalMosaicPermutation

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((current) => current + 1)
    }, 1_350)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (mode !== 'shuffle') return

    const timer = setTimeout(() => {
      setMode('assembled')
    }, 10_000)

    return () => clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== 'assembled') return

    const timer = setTimeout(() => {
      setMode('annotated')
    }, 1_050)

    return () => clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== 'annotated') return

    const timer = setTimeout(() => {
      setPhase((current) => current + 1)
      setMode('shuffle')
    }, 5_900)

    return () => clearTimeout(timer)
  }, [mode])

  return (
    <div className="relative aspect-[4/5] w-full max-w-[620px] overflow-hidden bg-zinc-100">
      {Array.from({ length: 9 }).map((_, sourceIndex) => {
        const sourceColumn = sourceIndex % 3
        const sourceRow = Math.floor(sourceIndex / 3)
        const targetIndex = permutation[sourceIndex]
        const targetColumn = targetIndex % 3
        const targetRow = Math.floor(targetIndex / 3)

        return (
          <motion.div
            key={sourceIndex}
            className="absolute h-1/3 w-1/3 overflow-hidden border border-white/20 bg-cover bg-no-repeat"
            animate={{
              x: `${targetColumn * 100}%`,
              y: `${targetRow * 100}%`,
              opacity: 1,
              scale: 1,
            }}
            transition={{ type: 'spring', duration: 1.05, bounce: 0.12 }}
            style={{
              backgroundImage: `url(${src})`,
              backgroundPosition: `${sourceColumn * 50}% ${sourceRow * 50}%`,
              backgroundSize: '300% 300%',
              left: 0,
              top: 0,
            }}
          />
        )
      })}
      <AnimatePresence>
        {mode === 'annotated' ? <MosaicAnnotations key="mosaic-annotations" landmarks={landmarks} /> : null}
      </AnimatePresence>
    </div>
  )
}

function MosaicAnnotations({ landmarks }: { landmarks: FaceLandmarksPayload | null }) {
  const anchors = landmarks?.confidence && landmarks.confidence >= 0.5 ? landmarks.anchors : null
  const leftEye = toPercentPoint(anchors?.leftEyeOuter)
  const rightEye = toPercentPoint(anchors?.rightEyeOuter)
  const noseTip = toPercentPoint(anchors?.noseTip)
  const upperLip = toPercentPoint(anchors?.upperLip ?? anchors?.mouthCenter)
  const chin = toPercentPoint(anchors?.chin)
  const eyeMid = midpointPercent(leftEye, rightEye)
  const chinHeight = upperLip && chin ? Math.max(48, Math.min(132, (chin.y - upperLip.y) * 5.2)) : 88

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
    >
      <MosaicCallout
        className={upperLip ? '' : 'left-[52%] top-[57%]'}
        height={chinHeight}
        label="Chin height"
        style={upperLip ? { left: `${upperLip.x}%`, top: `${upperLip.y}%` } : undefined}
        value="[ 5 CM ]"
      />
      <MosaicCallout
        className={eyeMid ? '' : 'left-[29%] top-[32%]'}
        height={70}
        label="Eye line"
        style={eyeMid ? { left: `${eyeMid.x - 8}%`, top: `${eyeMid.y}%` } : undefined}
        value="[ near level ]"
      />
      <MosaicCallout
        className={noseTip ? '' : 'left-[62%] top-[43%]'}
        height={62}
        label="Nose midline"
        style={noseTip ? { left: `${noseTip.x + 4}%`, top: `${noseTip.y - 8}%` } : undefined}
        value="[ minimal drift ]"
      />
    </motion.div>
  )
}

function MosaicCallout({
  className,
  height,
  label,
  style,
  textSide = 'right',
  value,
}: {
  className?: string
  height: number
  label: string
  style?: CSSProperties
  textSide?: 'left' | 'right'
  value: string
}) {
  const textPositionClass = textSide === 'left'
    ? 'right-7 justify-items-end text-right'
    : 'left-7 justify-items-start text-left'

  return (
    <div className={`absolute ${className ?? ''}`} style={style}>
      <motion.span
        className="absolute left-0 top-0 size-2 rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      />
      <motion.span
        className="absolute left-[3px] top-[7px] w-px origin-top bg-white shadow-[0_0_12px_rgba(0,0,0,0.2)]"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.18, duration: 0.72, ease: [0.23, 1, 0.32, 1] }}
        style={{ height }}
      />
      <motion.span
        className="absolute -left-[5px] block h-px w-4 bg-white"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.84, duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        style={{ top: height + 6 }}
      />
      <span className={`absolute top-[48px] grid max-w-[min(38vw,150px)] gap-1 font-mono text-[11px] uppercase tracking-wide text-black ${textPositionClass}`}>
        <span className="relative block overflow-hidden px-2 py-1">
          <motion.span
            className="absolute inset-0 origin-left bg-white"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.02, duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
          />
          <motion.span
            className="relative z-10 block whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.24, duration: 0.2 }}
          >
            {label}
          </motion.span>
        </span>
        <span className="relative block overflow-hidden px-2 py-1">
          <motion.span
            className="absolute inset-0 origin-left bg-white"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.16, duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
          />
          <motion.span
            className="relative z-10 block whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.38, duration: 0.2 }}
          >
            {value}
          </motion.span>
        </span>
      </span>
    </div>
  )
}

function AnalysisPaymentDialog({
  error,
  loading,
  onCheckout,
  onOpenChange,
  open,
}: {
  error: string | null
  loading: boolean
  onCheckout: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-[0_28px_90px_rgba(15,23,42,0.2)] sm:max-w-[500px]">
        <div className="relative h-[330px] overflow-hidden bg-zinc-100">
          <Image className="object-cover object-center" src={paymentDialogImageUrl} alt="Analysis preview" fill sizes="500px" />
          <div className="absolute inset-0 bg-white/5" />
          <PaymentFeatureCallout
            label="Eye line"
            labelX={8}
            labelY={19}
            lineEndX={22}
            lineEndY={21}
            pointX={18}
            pointY={26}
          />
          <PaymentFeatureCallout
            label="Nose curve"
            labelX={63}
            labelY={37}
            lineEndX={63}
            lineEndY={44}
            pointX={55}
            pointY={46}
          />
          <PaymentFeatureCallout
            label="Mouth shape"
            labelX={76}
            labelY={60}
            lineEndX={76}
            lineEndY={63}
            pointX={68}
            pointY={62}
          />
        </div>

        <div className="px-6 pb-6 pt-5">
          <DialogHeader>
            <DialogTitle className="text-3xl leading-none tracking-[-0.055em]">
              Unlock the full facial analysis
            </DialogTitle>
            <DialogDescription className="max-w-md">
              We found enough signal to continue. Complete checkout to run the private advanced analysis and generate your results.
            </DialogDescription>
          </DialogHeader>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <button
            className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full border border-white bg-white px-5 text-base font-semibold shadow-[0_16px_40px_rgba(15,23,42,0.16),inset_0_0_0_1px_rgba(255,255,255,0.9)] transition-[box-shadow,transform] duration-150 ease-out hover:shadow-[0_20px_48px_rgba(15,23,42,0.18),inset_0_0_0_1px_rgba(255,255,255,0.95)] active:scale-[0.98] disabled:opacity-60"
            disabled={loading}
            onClick={onCheckout}
            type="button"
          >
            <RainbowIcon />
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-orange-500 bg-clip-text text-transparent">
              {loading ? 'Opening checkout...' : 'Get your Analysis now'}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PaymentFeatureCallout({
  label,
  labelX,
  labelY,
  lineEndX,
  lineEndY,
  pointX,
  pointY,
}: {
  label: string
  labelX: number
  labelY: number
  lineEndX: number
  lineEndY: number
  pointX: number
  pointY: number
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1={pointX} y1={pointY} x2={lineEndX} y2={lineEndY} stroke="rgba(255,255,255,0.9)" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white shadow-[0_0_0_5px_rgba(255,255,255,0.28),0_3px_10px_rgba(0,0,0,0.18)]"
        style={{ left: `${pointX}%`, top: `${pointY}%` }}
      />
      <span
        className="absolute -translate-y-1/2 whitespace-nowrap rounded-[5px] bg-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-black shadow-[0_7px_18px_rgba(15,23,42,0.14)]"
        style={{ left: `${labelX}%`, top: `${labelY}%` }}
      >
        {label}
      </span>
    </div>
  )
}

function RainbowIcon() {
  return (
    <svg className="size-7 shrink-0" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="analysis-rainbow-icon" x1="4" x2="25" y1="5" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EA5E9" />
          <stop offset="0.46" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <path d="M9 5H6.8A1.8 1.8 0 0 0 5 6.8V9" stroke="url(#analysis-rainbow-icon)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M19 5h2.2A1.8 1.8 0 0 1 23 6.8V9" stroke="url(#analysis-rainbow-icon)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M9 23H6.8A1.8 1.8 0 0 1 5 21.2V19" stroke="url(#analysis-rainbow-icon)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M14 11h5" stroke="url(#analysis-rainbow-icon)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M10 16h8" stroke="url(#analysis-rainbow-icon)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M22 16.5l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.2-.8 2.2-.8.8-2.1Z" fill="url(#analysis-rainbow-icon)" />
    </svg>
  )
}

function ResultsStep({
  battleOptOut,
  battleOptOutSaving,
  onBattleOptOutChange,
  primaryScore,
  results,
  onOpenShare,
  onReset,
}: {
  battleOptOut: boolean
  battleOptOutSaving: boolean
  onBattleOptOutChange: (optOut: boolean) => void
  primaryScore: number | null
  results: AnalysisResponse[]
  onOpenShare: () => void
  onReset: () => void
}) {
  const primaryResult = results[0]
  const landmarks = useMemo(() => getReportLandmarks(primaryResult), [primaryResult])
  const score = getReportOverallScore(primaryResult, primaryScore)
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
  return (
    <AnalysisReport categories={categories} imageSrc={primaryResult?.photo.imageUrl ?? previewPhotoUrl} landmarks={landmarks} score={score} pslScore={primaryScore}>
      <ReportActions battleOptOut={battleOptOut} battleOptOutSaving={battleOptOutSaving} score={score} onBattleOptOutChange={onBattleOptOutChange} onOpenShare={onOpenShare} onReset={onReset} />
    </AnalysisReport>
  )
}

function getReportLandmarks(result?: AnalysisResponse) {
  return parseFaceLandmarksPayload(result?.analysis.landmarks)
}

function toPercentPoint(point?: NormalizedPoint): ReportOverlayPoint | null {
  if (!point) return null

  return {
    x: point.x * 100,
    y: point.y * 100,
  }
}

function midpointPercent(a?: ReportOverlayPoint | null, b?: ReportOverlayPoint | null): ReportOverlayPoint | null {
  if (!a || !b) return null

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
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

  async function ensureShareUrl() {
    return shareUrl ?? await onCreate()
  }

  async function handleCopyLink() {
    const url = await ensureShareUrl()
    if (!url) return

    await navigator.clipboard.writeText(url).catch(() => null)
    toast.success('Share link copied')
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

      const sharedLink = await shareLinkFallback(target, url, result)
      if (sharedLink) return

      if (target !== 'native') {
        await copyText(url)
        window.open(getPlatformShareFallbackUrl(target), '_blank', 'noopener,noreferrer')
        toast.success(`${target === 'instagram' ? 'Instagram' : 'TikTok'} opened. Add the copied link to your story.`)
        return
      }

      if (shareImageUrl) {
        downloadShareImage(shareImageUrl)
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
                <Image className="object-cover" src={shareImageUrl} alt="Shareable report card preview" fill sizes="430px" unoptimized />
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

            <div className="mt-4 flex items-center gap-2 border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{shareUrl ?? 'Creating share link...'}</span>
              {loading ? (
                <Loader2 className="size-4 animate-spin text-zinc-500" aria-hidden="true" />
              ) : (
                <Copy className="size-4 text-zinc-500" aria-hidden="true" />
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
              <button
                className="flex h-12 w-full items-center justify-between rounded-full border border-zinc-200 bg-white px-4 text-left font-mono text-[11px] uppercase tracking-wide text-black transition-colors hover:bg-zinc-50 disabled:opacity-60"
                disabled={loading}
                onClick={() => void handleCopyLink()}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <Copy className="size-5" aria-hidden="true" />
                  Copy link
                </span>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              </button>
            </div>

            {shareImageUrl ? (
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-black"
                onClick={() => downloadShareImage(shareImageUrl)}
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

async function shareLinkFallback(target: 'instagram' | 'tiktok' | 'native', url: string, result: AnalysisResponse) {
  if (!navigator.share) return false

  try {
    await navigator.share({
      title: 'My Mogging report',
      text: `Overall score ${formatShareScore(getReportOverallScore(result))} / 10`,
      url,
    })
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return true
    return false
  }
}

function getPlatformShareFallbackUrl(target: 'instagram' | 'tiktok') {
  if (target === 'instagram') return 'https://www.instagram.com/'
  return 'https://www.tiktok.com/upload'
}

async function copyText(text: string) {
  await navigator.clipboard?.writeText(text).catch(() => null)
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

function ensureAnalysisWebInstallId(preferredInstallId?: string | null) {
  const preferred = preferredInstallId?.trim()
  if (preferred && preferred.length >= 8) {
    window.localStorage.setItem(analysisWebInstallStorageKey, preferred)
    return preferred
  }

  const existing = window.localStorage.getItem(analysisWebInstallStorageKey)
  if (existing && existing.length >= 8) return existing

  const next = `web_analysis_${crypto.randomUUID()}`
  window.localStorage.setItem(analysisWebInstallStorageKey, next)
  return next
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
