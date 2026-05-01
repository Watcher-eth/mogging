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
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  clearAnalysisDraft,
  loadAnalysisDraft,
  type AnalysisDraftImage,
} from '@/lib/client/analysisDraft'
import { extractFaceLandmarksFromDataUrl } from '@/lib/client/faceLandmarks'
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
import { CameraSheet } from '@/components/analysis/camera-sheet'
import { LoginDialog } from '@/components/app/app-shell'
import { SeoHead } from '@/components/app/seo-head'
import { CaptureFrame } from '@/components/analysis/capture-frame'
import { TextLoop } from '@/components/core/text-loop'
import { TextShimmer } from '@/components/core/text-shimmer'

type FlowStep = 'intro' | 'upload' | 'preview-analysis' | 'payment' | 'actual-analysis' | 'results'

type AnalysisResponse = {
  photo: {
    id: string
    imageUrl: string
    imageHash: string
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
}

type AnalysisReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  score: number
  features: AnalysisReportFeature[]
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
}

type ReportOverlayPoint = {
  x: number
  y: number
}

type ReportOverlayLine = {
  x1: number
  y1: number
  x2: number
  y2: number
}

type ReportGuideBox = {
  x: number
  y: number
  width: number
  height: number
  dashed?: boolean
}

type ReportOverlayLabel = {
  title: string
  value: string
  x: number
  y: number
}

type ReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  features: ReportFeature[]
  overlayPoints: ReportOverlayPoint[]
  overlayLines: ReportOverlayLine[]
}

const reportCategories: ReportCategory[] = [
  {
    id: 'eyes',
    title: 'Eyes',
    subtitle: 'Periocular balance and eye-line structure',
    scoreLabel: 'Eye area',
    features: [
      { label: 'Canthal tilt', value: 'Positive' },
      { label: 'Spacing', value: 'Balanced' },
      { label: 'Upper lid', value: 'Defined' },
      { label: 'Symmetry', value: 'High' },
    ],
    overlayPoints: [{ x: 34, y: 39 }, { x: 46, y: 38 }, { x: 56, y: 38 }, { x: 68, y: 39 }],
    overlayLines: [{ x1: 30, y1: 40, x2: 72, y2: 39 }],
  },
  {
    id: 'nose',
    title: 'Nose',
    subtitle: 'Bridge alignment and central facial axis',
    scoreLabel: 'Nasal balance',
    features: [
      { label: 'Bridge', value: 'Straight' },
      { label: 'Tip position', value: 'Centered' },
      { label: 'Width', value: 'Moderate' },
      { label: 'Projection', value: 'Clean' },
    ],
    overlayPoints: [{ x: 51, y: 42 }, { x: 51, y: 52 }, { x: 51, y: 61 }],
    overlayLines: [{ x1: 51, y1: 36, x2: 51, y2: 64 }],
  },
  {
    id: 'mouth',
    title: 'Mouth',
    subtitle: 'Lip shape, width, and lower-third fit',
    scoreLabel: 'Mouth harmony',
    features: [
      { label: 'Width', value: 'Proportional' },
      { label: 'Cupid bow', value: 'Visible' },
      { label: 'Lower lip', value: 'Full' },
      { label: 'Resting line', value: 'Even' },
    ],
    overlayPoints: [{ x: 41, y: 66 }, { x: 51, y: 67 }, { x: 62, y: 66 }],
    overlayLines: [{ x1: 38, y1: 66, x2: 65, y2: 66 }],
  },
  {
    id: 'jaw',
    title: 'Jaw',
    subtitle: 'Mandible definition and chin support',
    scoreLabel: 'Jawline',
    features: [
      { label: 'Gonial angle', value: 'Defined' },
      { label: 'Chin height', value: 'Strong' },
      { label: 'Mandible', value: 'Clear' },
      { label: 'Neck transition', value: 'Clean' },
    ],
    overlayPoints: [{ x: 33, y: 72 }, { x: 50, y: 79 }, { x: 68, y: 72 }],
    overlayLines: [{ x1: 31, y1: 70, x2: 50, y2: 80 }, { x1: 50, y1: 80, x2: 70, y2: 70 }],
  },
  {
    id: 'dimorphism',
    title: 'Dimorphism',
    subtitle: 'Sex-typical cues weighted against harmony',
    scoreLabel: 'Dimorphism',
    features: [
      { label: 'Brow frame', value: 'Moderate' },
      { label: 'Midface', value: 'Refined' },
      { label: 'Lower third', value: 'Structured' },
      { label: 'Soft tissue', value: 'Balanced' },
    ],
    overlayPoints: [{ x: 34, y: 34 }, { x: 66, y: 34 }, { x: 50, y: 78 }],
    overlayLines: [{ x1: 34, y1: 34, x2: 66, y2: 34 }, { x1: 50, y1: 43, x2: 50, y2: 78 }],
  },
  {
    id: 'face-shape',
    title: 'Face shape',
    subtitle: 'Frame, thirds, and silhouette continuity',
    scoreLabel: 'Face shape',
    features: [
      { label: 'Outline', value: 'Oval' },
      { label: 'Upper third', value: 'Balanced' },
      { label: 'Midface', value: 'Compact' },
      { label: 'Lower third', value: 'Defined' },
    ],
    overlayPoints: [{ x: 31, y: 31 }, { x: 69, y: 31 }, { x: 72, y: 58 }, { x: 50, y: 82 }, { x: 28, y: 58 }],
    overlayLines: [{ x1: 31, y1: 31, x2: 69, y2: 31 }, { x1: 69, y1: 31, x2: 72, y2: 58 }, { x1: 72, y1: 58, x2: 50, y2: 82 }, { x1: 50, y1: 82, x2: 28, y2: 58 }, { x1: 28, y1: 58, x2: 31, y2: 31 }],
  },
  {
    id: 'biological-age',
    title: 'Biological age',
    subtitle: 'Visible youthfulness and skin presentation cues',
    scoreLabel: 'Age signal',
    features: [
      { label: 'Skin texture', value: 'Smooth' },
      { label: 'Under-eye', value: 'Fresh' },
      { label: 'Facial fullness', value: 'Youthful' },
      { label: 'Presentation', value: 'Clear' },
    ],
    overlayPoints: [{ x: 38, y: 46 }, { x: 62, y: 46 }, { x: 50, y: 55 }, { x: 50, y: 70 }],
    overlayLines: [{ x1: 38, y1: 46, x2: 62, y2: 46 }, { x1: 50, y1: 45, x2: 50, y2: 70 }],
  },
  {
    id: 'symmetry',
    title: 'Symmetry',
    subtitle: 'Left-right balance across visible landmarks',
    scoreLabel: 'Symmetry',
    features: [
      { label: 'Eye level', value: 'Aligned' },
      { label: 'Nose axis', value: 'Centered' },
      { label: 'Mouth axis', value: 'Level' },
      { label: 'Chin point', value: 'Centered' },
    ],
    overlayPoints: [{ x: 50, y: 31 }, { x: 50, y: 44 }, { x: 50, y: 66 }, { x: 50, y: 80 }],
    overlayLines: [{ x1: 50, y1: 28, x2: 50, y2: 82 }, { x1: 30, y1: 43, x2: 70, y2: 43 }, { x1: 38, y1: 66, x2: 64, y2: 66 }],
  },
  {
    id: 'overall',
    title: 'Overall PSL',
    subtitle: 'Final calibrated PSL assessment',
    scoreLabel: 'PSL score',
    features: [
      { label: 'Harmony', value: 'High' },
      { label: 'Structure', value: 'Strong' },
      { label: 'Balance', value: 'Consistent' },
      { label: 'Percentile', value: 'Upper range' },
    ],
    overlayPoints: [{ x: 50, y: 30 }, { x: 35, y: 43 }, { x: 65, y: 43 }, { x: 50, y: 66 }, { x: 50, y: 81 }],
    overlayLines: [{ x1: 50, y1: 30, x2: 35, y2: 43 }, { x1: 50, y1: 30, x2: 65, y2: 43 }, { x1: 50, y1: 30, x2: 50, y2: 81 }, { x1: 35, y1: 43, x2: 65, y2: 43 }, { x1: 39, y1: 66, x2: 62, y2: 66 }],
  },
]
const reportOverlayYOffset = -12
const reportOverlayCategoryYOffset: Record<string, number> = {
  eyes: -8,
  mouth: -15,
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function AnalysisPage() {
  const router = useRouter()
  const { status } = useSession()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<AnalysisDraftImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other')
  const [step, setStep] = useState<FlowStep>('intro')
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
    if (status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    setError(null)
    setAnalysisUnlocked(false)
    setPaymentDialogOpen(false)
    setProgress(18)
    setStep('actual-analysis')
  }

  function beginAssessment() {
    if (status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    setStep('upload')
  }

  async function startCheckout() {
    if (status !== 'authenticated') {
      setLoginOpen(true)
      return
    }

    setCheckoutLoading(true)
    setError(null)

    await wait(320)

    setCheckoutLoading(false)
    setAnalysisUnlocked(true)
    setPaymentDialogOpen(false)
    setStep('actual-analysis')
    setProgress(30)

    void runActualAnalysis()
  }

  async function runActualAnalysis(draftImages = images) {
    if (draftImages.length === 0) {
      setStep('upload')
      setError('Upload an image before starting analysis.')
      return
    }

    try {
      const analysisResults: AnalysisResponse[] = []

      for (const [index, image] of draftImages.entries()) {
        setProgress(Math.round(30 + (index / draftImages.length) * 62))
        const result = await apiPost<AnalysisResponse>('/api/analyze', {
          imageData: image.dataUrl,
          gender,
          photoType: 'face',
          name: image.name,
          landmarks: image.landmarks ?? null,
        })
        analysisResults.push(result)
      }

      setProgress(100)
      setResults(analysisResults)
      setStep('results')
      await clearAnalysisDraft()
    } catch (analysisError) {
      setStep('actual-analysis')
      setError(analysisError instanceof ApiClientError ? analysisError.message : 'Analysis failed')
    }
  }

  async function toggleBattleOptOut(photoId: string, optOut: boolean) {
    const previousValue = battleOptOutByPhotoId[photoId] ?? false
    setBattleOptOutByPhotoId((current) => ({ ...current, [photoId]: optOut }))
    setBattleOptOutSaving(true)

    try {
      await apiPost<PhotoPrivacyResponse>('/api/photos/privacy', {
        photoId,
        isPublic: !optOut,
      })
      toast.success(optOut ? 'Removed from battle arena' : 'Added to battle arena')
    } catch (privacyError) {
      setBattleOptOutByPhotoId((current) => ({ ...current, [photoId]: previousValue }))
      toast.error(privacyError instanceof ApiClientError ? privacyError.message : 'Unable to update battle setting')
    } finally {
      setBattleOptOutSaving(false)
    }
  }

  const resumeAfterPayment = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      setAnalysisUnlocked(true)
      setPaymentDialogOpen(false)
      setStep('actual-analysis')
      setProgress(28)

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
          landmarks: image.landmarks ?? null,
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
    if (!sessionId) return

    void resumeAfterPayment(sessionId)
  }, [resumeAfterPayment, router.isReady, router.query.checkout, router.query.session_id])

  useEffect(() => {
    if (router.isReady && router.query.checkout === 'cancelled') {
      setStep('actual-analysis')
      setAnalysisUnlocked(false)
      setPaymentDialogOpen(true)
      setError('Payment was cancelled. Your uploaded images are still ready.')
    }
  }, [router.isReady, router.query.checkout])

  useEffect(() => {
    if (!router.isReady) return

    const analysisId = typeof router.query.analysisId === 'string' ? router.query.analysisId : null
    if (!analysisId || loadedAnalysisIdRef.current === analysisId) return

    loadedAnalysisIdRef.current = analysisId
    setError(null)

    void apiGet<AnalysisResponse>(`/api/analysis/${encodeURIComponent(analysisId)}`)
      .then((result) => {
        setResults([result])
        setStep('results')
        setImages([])
        setSelectedImageId(null)
        setShareUrl(null)
        setBattleOptOutByPhotoId({
          [result.photo.id]: false,
        })
      })
      .catch((analysisError) => {
        setStep('intro')
        const message = analysisError instanceof ApiClientError ? analysisError.message : 'Unable to load analysis'
        setError(message)
        toast.error(message)
      })
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
      landmarks: null,
    }

    setImages((current) => {
      return [...current, nextImage].slice(0, 3)
    })
    setSelectedImageId(imageId)
    setLandmarkPendingIds((current) => ({ ...current, [imageId]: true }))
    void enrichImageLandmarks(nextImage)
  }

  async function enrichImageLandmarks(image: AnalysisDraftImage) {
    try {
      const landmarks = await extractFaceLandmarksFromDataUrl(image.dataUrl)
      if (!landmarks) return

      setImages((current) => current.map((currentImage) => (
        currentImage.id === image.id ? { ...currentImage, landmarks } : currentImage
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
        imagePath="/Og2.png"
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
                selectedImageId={selectedImage?.id ?? null}
                canStart={canStart}
                onCamera={() => setCameraOpen(true)}
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
                onPaymentRequired={() => setPaymentDialogOpen(true)}
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
                onPaymentRequired={() => setPaymentDialogOpen(true)}
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
                onPaymentRequired={() => setPaymentDialogOpen(true)}
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
                    setResults([])
                    setBattleOptOutByPhotoId({})
                    setStep('intro')
                    setShareUrl(null)
                  }}
                  battleOptOut={primaryResult ? (battleOptOutByPhotoId[primaryResult.photo.id] ?? false) : false}
                  battleOptOutSaving={battleOptOutSaving}
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
      <CameraSheet
        open={cameraOpen}
        onCapture={addCameraImage}
        onClose={() => setCameraOpen(false)}
        onUpload={() => {
          setCameraOpen(false)
          window.setTimeout(() => uploadInputRef.current?.click(), 160)
        }}
      />
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
      <aside className="flex flex-col justify-between gap-10 lg:pr-16 xl:pr-24 2xl:pr-36">
        <div>
          <div className="flex gap-6 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="underline underline-offset-4">What is it?</span>
            <span className="underline underline-offset-4">All reports</span>
          </div>

          <div className="mt-20 sm:mt-28 lg:mt-40">
            <h1 className="text-balance text-4xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-6xl">
              Introductory Facial Assessment
            </h1>
            <div className="mt-8 grid grid-cols-2 gap-4 font-mono text-[10px] uppercase text-muted-foreground sm:grid-cols-4">
              <Meta label="Edition" value="Introductory" />
              <Meta label="Pages" value="16" />
              <Meta label="Cost" value="$4.99" />
              <Meta label="Assessed today" value="210001" />
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

      <div className="relative min-h-[420px] overflow-hidden bg-zinc-200 sm:min-h-[560px] lg:min-h-0">
        <Image className="object-cover object-center" src={previewPhotoUrl} alt="Facial assessment preview" fill priority sizes="(min-width: 1024px) 46vw, 100vw" />
        <div className="absolute left-1/2 top-1/2 w-[min(42vw,300px)] -translate-x-1/2 -translate-y-1/2 border border-white/80 p-3 text-white shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
          <div className="text-balance text-xl font-medium leading-none tracking-[-0.04em]">
            Facial
            <br />
            Aesthetic
            <br />
            Assessments
          </div>
          <div className="mt-40 grid grid-cols-4 gap-4 font-mono text-[9px] uppercase text-white/85">
            <PreviewMeta label="Name" value="Preview" />
            <PreviewMeta label="Age" value="24" />
            <PreviewMeta label="Gender" value="Face" />
            <PreviewMeta label="Descent" value="Global" />
          </div>
        </div>
      </div>

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
  images,
  isPreparingUploads,
  onCamera,
  onRemove,
  onSelect,
  onStart,
  onUpload,
  previewImage,
  selectedImageId,
}: {
  canStart: boolean
  images: AnalysisDraftImage[]
  isPreparingUploads: boolean
  onCamera: () => void
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
          <Button className="mt-4 h-11 w-full max-w-[260px] justify-between rounded-sm font-mono text-[11px] uppercase" onClick={onStart} disabled={!canStart}>
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
                    showStepIndicator={false}
                    stepLabel="Step 1 of 3"
                    title="Look straight ahead"
                    subtitle={previewImage ? 'Center your face in the frame' : 'Upload or take a photo'}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {images.length > 0 ? (
            <div className="mx-auto grid w-full max-w-[390px] grid-cols-3 gap-2">
              {images.map((image) => (
                <button
                  key={image.id}
                  className={`group relative aspect-square overflow-hidden rounded-md border bg-muted transition-[border-color,box-shadow,transform] duration-200 ease-out hover:scale-[1.01] ${
                    selectedImageId === image.id ? 'border-black shadow-[0_10px_30px_rgba(15,23,42,0.12)]' : 'border-zinc-200'
                  }`}
                  onClick={() => onSelect(image.id)}
                  type="button"
                >
                  <Image className="object-cover" src={image.dataUrl} alt={image.name} fill sizes="126px" unoptimized />
                  <span
                    className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemove(image.id)
                    }}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-center text-sm text-muted-foreground">
          <ul className="grid gap-3">
            <li>▪ Remove your glasses</li>
            <li>▪ Look directly at camera</li>
            <li>▪ Pull hair back</li>
            <li>▪ Keep neutral expression</li>
          </ul>
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
        value="[ balanced ]"
      />
      <MosaicCallout
        className={noseTip ? '' : 'left-[62%] top-[43%]'}
        height={62}
        label="Nose axis"
        style={noseTip ? { left: `${noseTip.x + 4}%`, top: `${noseTip.y - 8}%` } : undefined}
        value="[ centered ]"
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
              We found enough signal to continue. Complete checkout to run the private AI analysis and generate your results.
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
  const [activeCategoryId, setActiveCategoryId] = useState(reportCategories[0]?.id ?? 'overall')
  const primaryResult = results[0]
  const activeCategory = reportCategories.find((category) => category.id === activeCategoryId) ?? reportCategories[0]
  const imageSrc = primaryResult?.photo.imageUrl ?? previewPhotoUrl
  const landmarks = getReportLandmarks(primaryResult)
  const score = getReportOverallScore(primaryResult, primaryScore)
  const categoryScore = getReportCategoryScore(activeCategory.id, primaryResult)
  const activeReportCategory = getReportCategoryData(activeCategory.id, primaryResult)

  return (
    <div className="grid min-h-[calc(100svh-5rem)] gap-8 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:justify-between lg:gap-20 xl:gap-28">
      <aside className="flex flex-col justify-between bg-white p-0 text-black lg:sticky lg:top-24 lg:min-h-[calc(100svh-9rem)]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Final analysis //</p>
          <h2 className="mt-3 text-5xl font-semibold leading-none tracking-[-0.06em]">Your Report</h2>
          <div className="mt-6 grid gap-1.5">
            {reportCategories.map((category, index) => {
              const isActive = category.id === activeCategory.id
              const reportCategory = getReportCategoryData(category.id, primaryResult)
              const categoryTitle = reportCategory?.title ?? category.title

              return (
                <button
                  key={category.id}
                  className={`group grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wide transition-colors duration-300 ${
                    isActive ? 'bg-black text-white' : 'text-muted-foreground hover:bg-zinc-100 hover:text-black'
                  }`}
                  onClick={() => setActiveCategoryId(category.id)}
                  type="button"
                >
                  <span>[ {String(index + 1).padStart(3, '0')} ]</span>
                  <span>{categoryTitle}</span>
                  <span className={isActive ? 'text-white/55' : 'text-black/25'}>{category.id === 'overall' ? score.toFixed(1) : ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        <ReportActions
          battleOptOut={battleOptOut}
          battleOptOutSaving={battleOptOutSaving}
          score={score}
          onBattleOptOutChange={onBattleOptOutChange}
          onOpenShare={onOpenShare}
          onReset={onReset}
          className="hidden lg:grid"
        />
      </aside>

      <section className="grid gap-4 lg:min-h-[calc(100svh-9rem)] lg:gap-6">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,0.98fr)_minmax(280px,0.72fr)] lg:items-stretch">
          <ReportImagePanel category={activeCategory} imageSrc={imageSrc} landmarks={landmarks} />
          <ReportDetailPanel category={activeCategory} reportCategory={activeReportCategory} score={categoryScore} />
        </div>
      </section>

      <ReportActions
        battleOptOut={battleOptOut}
        battleOptOutSaving={battleOptOutSaving}
        score={score}
        onBattleOptOutChange={onBattleOptOutChange}
        onOpenShare={onOpenShare}
        onReset={onReset}
        className="lg:hidden"
      />
    </div>
  )
}

function ReportActions({
  battleOptOut,
  battleOptOutSaving,
  className = '',
  onBattleOptOutChange,
  onOpenShare,
  onReset,
  score,
}: {
  battleOptOut: boolean
  battleOptOutSaving: boolean
  className?: string
  onBattleOptOutChange: (optOut: boolean) => void
  onOpenShare: () => void
  onReset: () => void
  score: number
}) {
  return (
    <div className={`grid gap-3 ${className}`}>
      <div className="border border-zinc-200 p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">PSL score</p>
        <div className="mt-3 flex items-end justify-between">
          <span className="text-6xl font-semibold leading-none tracking-[-0.06em]">{score.toFixed(1)}</span>
          <span className="pb-1 font-mono text-[10px] uppercase text-muted-foreground">/ 8</span>
        </div>
      </div>
      <button
        className="flex h-12 w-full items-center justify-between bg-black px-4 font-mono text-[11px] uppercase tracking-wide text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0"
        onClick={onOpenShare}
        type="button"
      >
        Share report
        <Share2 className="size-4" aria-hidden="true" />
      </button>
      <label className="flex items-start gap-3 border border-zinc-200 px-3 py-3 text-xs leading-5 text-zinc-500">
        <input
          checked={battleOptOut}
          className="mt-0.5 size-4 shrink-0 accent-black"
          disabled={battleOptOutSaving}
          onChange={(event) => onBattleOptOutChange(event.target.checked)}
          type="checkbox"
        />
        <span>I dont want my image to be added to the battle arena</span>
      </label>
      <button
        className="h-10 text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-black"
        onClick={onReset}
        type="button"
      >
        New analysis
      </button>
    </div>
  )
}

function ReportImagePanel({
  category,
  imageSrc,
  landmarks,
}: {
  category: ReportCategory
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
}) {
  return (
    <div className="relative min-h-[520px] overflow-hidden bg-zinc-100 lg:h-full lg:min-h-0">
      <Image className="object-cover object-center" src={imageSrc} alt={`${category.title} analysis image`} fill priority sizes="(min-width: 1024px) 44vw, 100vw" />
      <div className="absolute inset-0 bg-white/5" />
      <AnimatePresence mode="wait">
        <ReportFocusOverlay key={`${category.id}-focus`} category={category} landmarks={landmarks} />
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <ReportOverlay key={category.id} category={category} landmarks={landmarks} />
      </AnimatePresence>
      <div className="absolute inset-x-4 top-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
        <span>[ {category.title} ]</span>
        <span>Active measurement</span>
      </div>
    </div>
  )
}

function ReportFocusOverlay({ category, landmarks }: { category: ReportCategory; landmarks: FaceLandmarksPayload | null }) {
  if (category.id !== 'eyes' && category.id !== 'mouth') return null

  const focusCenter = getLandmarkFocusCenter(category.id, landmarks)
  const yOffset = focusCenter ? 0 : getReportOverlayYOffset(category.id)
  const spotlightX = focusCenter?.x ?? (category.id === 'eyes' ? 50 : 51)
  const spotlightY = (focusCenter?.y ?? (category.id === 'eyes' ? 39 : 66)) + yOffset
  const spotlight = category.id === 'eyes'
    ? `radial-gradient(ellipse_34%_15%_at_${spotlightX}%_${spotlightY}%,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_58%,rgba(0,0,0,0.48)_78%,rgba(0,0,0,0.9)_100%)`
    : `radial-gradient(ellipse_28%_13%_at_${spotlightX}%_${spotlightY}%,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_55%,rgba(0,0,0,0.52)_76%,rgba(0,0,0,0.92)_100%)`

  return (
    <motion.div
      key={`${category.id}-focus`}
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.72, ease: [0.23, 1, 0.32, 1] }}
      style={{ background: spotlight }}
    />
  )
}

function ReportOverlay({ category, landmarks }: { category: ReportCategory; landmarks: FaceLandmarksPayload | null }) {
  const geometry = getReportOverlayGeometry(category, landmarks)
  const label = geometry.label
  const yOffset = geometry.usesLandmarks ? 0 : getReportOverlayYOffset(category.id)

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.44, ease: [0.23, 1, 0.32, 1] }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {geometry.boxes.map((box, index) => (
          <motion.rect
            key={`${category.id}-box-${index}`}
            x={box.x}
            y={box.y + yOffset}
            width={box.width}
            height={box.height}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeDasharray={box.dashed ? '1.2 1.2' : undefined}
            strokeWidth="0.35"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.08 + index * 0.12, duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
          />
        ))}
        {geometry.lines.map((line, index) => (
          <motion.line
            key={`${category.id}-line-${index}`}
            x1={line.x1}
            y1={line.y1 + yOffset}
            x2={line.x2}
            y2={line.y2 + yOffset}
            stroke="rgba(255,255,255,0.88)"
            strokeDasharray={category.id === 'face-shape' || category.id === 'dimorphism' ? '1.3 1.4' : undefined}
            strokeLinecap="round"
            strokeWidth="0.36"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.18 + index * 0.1, duration: 0.92, ease: [0.23, 1, 0.32, 1] }}
          />
        ))}
        {geometry.points.map((point, index) => (
          <motion.g
            key={`${category.id}-point-${index}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.07, duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <circle cx={point.x} cy={point.y + yOffset} r="1.6" fill="none" stroke="rgba(255,255,255,0.72)" strokeDasharray="0.7 0.7" strokeWidth="0.32" vectorEffect="non-scaling-stroke" />
            <circle cx={point.x} cy={point.y + yOffset} r="0.55" fill="white" />
          </motion.g>
        ))}
      </svg>
      <motion.div
        className="absolute grid gap-1 font-mono text-[12px] uppercase tracking-wide text-black"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ delay: 0.58, duration: 0.46, ease: [0.23, 1, 0.32, 1] }}
        style={{ left: `${label.x}%`, top: `${label.y + yOffset}%` }}
      >
        <span className="w-fit bg-white px-2 py-1">{label.title}</span>
        <span className="w-fit bg-white px-2 py-1">{label.value}</span>
      </motion.div>
    </motion.div>
  )
}

function getReportGuideBoxes(category: ReportCategory) {
  if (category.id === 'eyes') {
    return [
      { x: 29, y: 35, width: 18, height: 9 },
      { x: 55, y: 35, width: 18, height: 9 },
      { x: 45, y: 31, width: 10, height: 13, dashed: true },
    ]
  }

  if (category.id === 'mouth') {
    return [{ x: 39, y: 61, width: 25, height: 9 }]
  }

  if (category.id === 'nose') {
    return [{ x: 45, y: 39, width: 12, height: 24, dashed: true }]
  }

  return []
}

function getReportOverlayGeometry(category: ReportCategory, landmarks: FaceLandmarksPayload | null): {
  boxes: ReportGuideBox[]
  lines: ReportOverlayLine[]
  points: ReportOverlayPoint[]
  label: ReportOverlayLabel
  usesLandmarks: boolean
} {
  const landmarkGeometry = landmarks ? getLandmarkOverlayGeometry(category, landmarks) : null
  if (landmarkGeometry) return { ...landmarkGeometry, usesLandmarks: true }

  return {
    boxes: getReportGuideBoxes(category),
    lines: category.overlayLines,
    points: category.overlayPoints,
    label: getReportOverlayLabel(category),
    usesLandmarks: false,
  }
}

function getLandmarkOverlayGeometry(category: ReportCategory, landmarks: FaceLandmarksPayload) {
  const anchors = landmarks.anchors

  if (landmarks.confidence < 0.5) return null

  if (category.id === 'eyes') {
    const leftOuter = toPercentPoint(anchors.leftEyeOuter)
    const leftInner = toPercentPoint(anchors.leftEyeInner)
    const rightInner = toPercentPoint(anchors.rightEyeInner)
    const rightOuter = toPercentPoint(anchors.rightEyeOuter)
    const leftPupil = toPercentPoint(anchors.leftPupil)
    const rightPupil = toPercentPoint(anchors.rightPupil)
    const eyePoints = compactPoints([leftOuter, leftInner, rightInner, rightOuter, leftPupil, rightPupil])
    if (eyePoints.length < 4 || !leftOuter || !leftInner || !rightInner || !rightOuter) return null

    const leftBox = boxFromPoints([leftOuter, leftInner], 6, 5)
    const rightBox = boxFromPoints([rightInner, rightOuter], 6, 5)
    const bridgeBox = boxFromPoints([leftInner, rightInner], 3, 7)

    return {
      boxes: [leftBox, rightBox, { ...bridgeBox, dashed: true }],
      lines: [{ x1: leftOuter.x, y1: leftOuter.y, x2: rightOuter.x, y2: rightOuter.y }],
      points: eyePoints,
      label: { title: 'Eyes distance', value: '[ measured ]', x: Math.min(78, rightInner.x + 4), y: rightInner.y + 7 },
    }
  }

  if (category.id === 'nose') {
    const bridge = toPercentPoint(anchors.noseBridge)
    const tip = toPercentPoint(anchors.noseTip)
    if (!bridge || !tip) return null

    return {
      boxes: [{ ...boxFromPoints([bridge, tip], 5, 3), dashed: true }],
      lines: [{ x1: bridge.x, y1: bridge.y - 4, x2: tip.x, y2: tip.y + 3 }],
      points: [bridge, tip],
      label: { title: 'Nose axis', value: '[ centered ]', x: Math.min(78, tip.x + 6), y: tip.y },
    }
  }

  if (category.id === 'mouth') {
    const left = toPercentPoint(anchors.mouthLeft)
    const right = toPercentPoint(anchors.mouthRight)
    const center = toPercentPoint(anchors.mouthCenter)
    if (!left || !right) return null

    return {
      boxes: [boxFromPoints([left, right], 5, 5)],
      lines: [{ x1: left.x, y1: left.y, x2: right.x, y2: right.y }],
      points: compactPoints([left, center, right]),
      label: { title: 'Lips fullness', value: '[ measured ]', x: Math.min(78, right.x + 4), y: right.y - 1 },
    }
  }

  if (category.id === 'jaw') {
    const left = toPercentPoint(anchors.jawLeft)
    const chin = toPercentPoint(anchors.chin)
    const right = toPercentPoint(anchors.jawRight)
    if (!left || !chin || !right) return null

    return {
      boxes: [],
      lines: [{ x1: left.x, y1: left.y, x2: chin.x, y2: chin.y }, { x1: chin.x, y1: chin.y, x2: right.x, y2: right.y }],
      points: [left, chin, right],
      label: { title: 'Jaw angle', value: '[ measured ]', x: Math.min(78, right.x + 2), y: right.y },
    }
  }

  if (category.id === 'dimorphism') {
    const leftBrow = toPercentPoint(anchors.leftBrow)
    const rightBrow = toPercentPoint(anchors.rightBrow)
    const leftJaw = toPercentPoint(anchors.jawLeft)
    const rightJaw = toPercentPoint(anchors.jawRight)
    const chin = toPercentPoint(anchors.chin)
    const nose = toPercentPoint(anchors.noseTip)
    if (!leftBrow || !rightBrow || !leftJaw || !rightJaw || !chin) return null

    return {
      boxes: [],
      lines: [
        { x1: leftBrow.x, y1: leftBrow.y, x2: rightBrow.x, y2: rightBrow.y },
        { x1: leftJaw.x, y1: leftJaw.y, x2: chin.x, y2: chin.y },
        { x1: chin.x, y1: chin.y, x2: rightJaw.x, y2: rightJaw.y },
        ...(nose ? [{ x1: nose.x, y1: nose.y - 9, x2: nose.x, y2: chin.y }] : []),
      ],
      points: compactPoints([leftBrow, rightBrow, leftJaw, rightJaw, chin, nose]),
      label: { title: 'Dimorphism', value: '[ measured ]', x: Math.min(78, rightBrow.x + 4), y: rightBrow.y + 8 },
    }
  }

  if (category.id === 'face-shape') {
    const forehead = toPercentPoint(anchors.forehead)
    const leftJaw = toPercentPoint(anchors.jawLeft)
    const rightJaw = toPercentPoint(anchors.jawRight)
    const chin = toPercentPoint(anchors.chin)
    const leftBrow = toPercentPoint(anchors.leftBrow)
    const rightBrow = toPercentPoint(anchors.rightBrow)
    if (!forehead || !leftJaw || !rightJaw || !chin) return null

    return {
      boxes: [],
      lines: [
        ...(leftBrow && rightBrow ? [{ x1: leftBrow.x, y1: leftBrow.y, x2: rightBrow.x, y2: rightBrow.y }] : []),
        { x1: forehead.x, y1: forehead.y, x2: rightJaw.x, y2: rightJaw.y },
        { x1: rightJaw.x, y1: rightJaw.y, x2: chin.x, y2: chin.y },
        { x1: chin.x, y1: chin.y, x2: leftJaw.x, y2: leftJaw.y },
        { x1: leftJaw.x, y1: leftJaw.y, x2: forehead.x, y2: forehead.y },
      ],
      points: compactPoints([forehead, leftJaw, rightJaw, chin, leftBrow, rightBrow]),
      label: { title: 'Face shape', value: '[ measured ]', x: Math.min(78, rightJaw.x + 3), y: rightJaw.y - 5 },
    }
  }

  if (category.id === 'biological-age') {
    const leftEye = toPercentPoint(anchors.leftEyeInner)
    const rightEye = toPercentPoint(anchors.rightEyeInner)
    const nose = toPercentPoint(anchors.noseTip)
    const mouth = toPercentPoint(anchors.mouthCenter)
    const chin = toPercentPoint(anchors.chin)
    if (!leftEye || !rightEye || !nose || !mouth) return null

    return {
      boxes: [boxFromPoints([leftEye, rightEye], 9, 6)],
      lines: [
        { x1: leftEye.x, y1: leftEye.y, x2: rightEye.x, y2: rightEye.y },
        { x1: nose.x, y1: nose.y, x2: mouth.x, y2: mouth.y },
        ...(chin ? [{ x1: mouth.x, y1: mouth.y, x2: chin.x, y2: chin.y }] : []),
      ],
      points: compactPoints([leftEye, rightEye, nose, mouth, chin]),
      label: { title: 'Age signal', value: '[ measured ]', x: Math.min(78, rightEye.x + 6), y: rightEye.y + 8 },
    }
  }

  if (category.id === 'symmetry' || category.id === 'overall') {
    const forehead = toPercentPoint(anchors.forehead)
    const nose = toPercentPoint(anchors.noseTip)
    const chin = toPercentPoint(anchors.chin)
    const mouthLeft = toPercentPoint(anchors.mouthLeft)
    const mouthRight = toPercentPoint(anchors.mouthRight)
    const leftEye = toPercentPoint(anchors.leftEyeOuter)
    const rightEye = toPercentPoint(anchors.rightEyeOuter)
    if (!forehead || !nose || !chin) return null

    return {
      boxes: [],
      lines: [
        { x1: forehead.x, y1: forehead.y, x2: chin.x, y2: chin.y },
        ...(leftEye && rightEye ? [{ x1: leftEye.x, y1: leftEye.y, x2: rightEye.x, y2: rightEye.y }] : []),
        ...(mouthLeft && mouthRight ? [{ x1: mouthLeft.x, y1: mouthLeft.y, x2: mouthRight.x, y2: mouthRight.y }] : []),
      ],
      points: compactPoints([forehead, nose, chin, leftEye, rightEye]),
      label: { title: category.id === 'overall' ? 'PSL score' : 'Symmetry', value: '[ measured ]', x: Math.min(78, nose.x + 7), y: nose.y },
    }
  }

  return null
}

function getReportOverlayLabel(category: ReportCategory) {
  const labels: Record<string, { title: string; value: string; x: number; y: number }> = {
    eyes: { title: 'Eyes distance', value: '[ 3 cm ]', x: 58, y: 46 },
    nose: { title: 'Nose axis', value: '[ centered ]', x: 58, y: 52 },
    mouth: { title: 'Lips fullness', value: '[ 5 cm ]', x: 66, y: 62 },
    jaw: { title: 'Jaw angle', value: '[ defined ]', x: 60, y: 73 },
    dimorphism: { title: 'Dimorphism', value: '[ balanced ]', x: 59, y: 48 },
    'face-shape': { title: 'Face shape', value: '[ oval ]', x: 61, y: 34 },
    'biological-age': { title: 'Age signal', value: '[ youthful ]', x: 59, y: 55 },
    symmetry: { title: 'Symmetry', value: '[ high ]', x: 58, y: 46 },
    overall: { title: 'PSL score', value: '[ calibrated ]', x: 58, y: 51 },
  }

  return labels[category.id] ?? labels.overall
}

function getReportLandmarks(result?: AnalysisResponse) {
  return parseFaceLandmarksPayload(result?.analysis.landmarks)
}

function getLandmarkFocusCenter(categoryId: string, landmarks: FaceLandmarksPayload | null) {
  if (!landmarks || landmarks.confidence < 0.5) return null

  if (categoryId === 'eyes') {
    return midpointPercent(toPercentPoint(landmarks.anchors.leftPupil), toPercentPoint(landmarks.anchors.rightPupil))
      ?? midpointPercent(toPercentPoint(landmarks.anchors.leftEyeOuter), toPercentPoint(landmarks.anchors.rightEyeOuter))
  }

  if (categoryId === 'mouth') {
    return toPercentPoint(landmarks.anchors.mouthCenter)
      ?? midpointPercent(toPercentPoint(landmarks.anchors.mouthLeft), toPercentPoint(landmarks.anchors.mouthRight))
  }

  return null
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

function compactPoints(points: Array<ReportOverlayPoint | null | undefined>) {
  return points.filter((point): point is ReportOverlayPoint => Boolean(point))
}

function boxFromPoints(points: ReportOverlayPoint[], paddingX: number, paddingY: number): ReportGuideBox {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: Math.max(0, minX - paddingX),
    y: Math.max(0, minY - paddingY),
    width: Math.min(100, maxX + paddingX) - Math.max(0, minX - paddingX),
    height: Math.min(100, maxY + paddingY) - Math.max(0, minY - paddingY),
  }
}

function getReportOverlayYOffset(categoryId: string) {
  return reportOverlayCategoryYOffset[categoryId] ?? reportOverlayYOffset
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
    return Math.max(0, Math.min(8, reportCategory.score))
  }

  const score = fallbackScore ?? result?.analysis.pslScore ?? 0
  return Math.max(0, Math.min(8, score))
}

function ReportDetailPanel({
  category,
  reportCategory,
  score,
}: {
  category: ReportCategory
  reportCategory: AnalysisReportCategory | null
  score: number
}) {
  const title = reportCategory?.title ?? category.title
  const subtitle = reportCategory?.subtitle ?? category.subtitle
  const scoreLabel = reportCategory?.scoreLabel ?? category.scoreLabel
  const features = reportCategory?.features?.length ? reportCategory.features : category.features
  const scoreMax = category.id === 'overall' ? 8 : 10
  const explanation = reportCategory?.explanation
    ?? `${category.title} is scored from visible proportions, local symmetry, and how the feature fits the full facial frame.`

  return (
    <div className="grid h-full gap-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={category.id}
          className="grid h-full grid-rows-[auto_1fr_auto] gap-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
        >
      <div className="border bg-white p-5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{scoreLabel}</p>
        <div className="mt-14 flex items-end justify-between">
          <h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{title}</h3>
          <span className="font-mono text-xl">{score.toFixed(1)} <span className="text-[10px] uppercase text-muted-foreground">/ {scoreMax}</span></span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {features.map((feature, index) => (
          <motion.div
            key={`${category.id}-${feature.label}`}
            className="flex min-h-0 flex-col justify-between border bg-zinc-50 p-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.07, duration: 0.46, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{feature.label}</p>
            <p className="pt-10 text-xl font-semibold tracking-[-0.04em]">{feature.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="border bg-white p-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38, duration: 0.52, ease: [0.23, 1, 0.32, 1] }}
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p>
        <p className="mt-10 text-sm leading-6 text-muted-foreground">
          {explanation}
        </p>
      </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function getReportCategoryScore(categoryId: string, result?: AnalysisResponse) {
  if (!result) return 0
  const reportCategory = getReportCategoryData(categoryId, result)
  if (typeof reportCategory?.score === 'number') {
    return Math.max(0, Math.min(categoryId === 'overall' ? 8 : 10, reportCategory.score))
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
    'biological-age': harmony + 0.3,
    symmetry: harmony,
    overall,
  }

  return Math.max(0, Math.min(categoryId === 'overall' ? 8 : 10, scores[categoryId] ?? overall))
}

const instagramLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/3840px-Instagram_logo_2016.svg.png'
const xLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/X_logo.jpg/1280px-X_logo.jpg'
const shareFeatureCategoryIds = ['eyes', 'nose', 'jaw']

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
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null)
  const [renderedImageBlob, setRenderedImageBlob] = useState<Blob | null>(null)
  const [renderingImage, setRenderingImage] = useState(false)
  const [shareActionLoading, setShareActionLoading] = useState<string | null>(null)
  const hasRequestedShareRef = useRef(false)

  useEffect(() => {
    if (!open || !result) return

    let cancelled = false
    setRenderingImage(true)

    void renderShareImage(result, shareUrl)
      .then(({ blob, url }) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        setRenderedImageBlob(blob)
        setRenderedImageUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return url
        })
      })
      .catch(() => {
        if (!cancelled) toast.error('Unable to prepare share image')
      })
      .finally(() => {
        if (!cancelled) setRenderingImage(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, result, shareUrl])

  useEffect(() => {
    return () => {
      if (renderedImageUrl) URL.revokeObjectURL(renderedImageUrl)
    }
  }, [renderedImageUrl])

  useEffect(() => {
    if (!open) {
      hasRequestedShareRef.current = false
      return
    }

    if (shareUrl || loading || hasRequestedShareRef.current) return
    hasRequestedShareRef.current = true
    void onCreate()
  }, [loading, onCreate, open, shareUrl])

  async function ensureShareUrl() {
    return shareUrl ?? await onCreate()
  }

  async function handleCopyLink() {
    const url = await ensureShareUrl()
    if (!url) return

    await navigator.clipboard.writeText(url).catch(() => null)
    toast.success('Share link copied')
  }

  async function handleNetworkShare(network: 'instagram' | 'x') {
    const url = await ensureShareUrl()
    if (!url || !result) return

    setShareActionLoading(network)
    try {
      const file = renderedImageBlob
        ? new File([renderedImageBlob], 'mogging-report.png', { type: 'image/png' })
        : null
      const canShareFile = Boolean(file && navigator.canShare?.({ files: [file] }))

      if (canShareFile && file) {
        await navigator.share({
          title: 'My Mogging report',
          text: `PSL score ${formatShareScore(result.analysis.pslScore)} / 8`,
          url,
          files: [file],
        })
        return
      }

      if (network === 'x') {
        const text = `My Mogging report: PSL ${formatShareScore(result.analysis.pslScore)} / 8`
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
      }

      if (renderedImageUrl) {
        downloadShareImage(renderedImageUrl)
        toast.success(network === 'instagram' ? 'Share image downloaded' : 'Share image downloaded for your post')
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
            className="absolute inset-x-0 bottom-0 max-h-[92svh] overflow-y-auto border border-zinc-200 bg-white p-5 text-black shadow-2xl sm:left-auto sm:right-5 sm:top-20 sm:h-fit sm:w-[430px]"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Share report //</p>
                <h2 className="mt-2 text-3xl font-semibold leading-none tracking-[-0.055em]">Your Score Card</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-5 overflow-hidden border border-zinc-200 bg-zinc-100">
              {renderedImageUrl ? (
                <Image className="aspect-[4/5] w-full object-cover" src={renderedImageUrl} alt="Shareable report card preview" width={1080} height={1350} unoptimized />
              ) : (
                <div className="grid aspect-[4/5] place-items-center text-center">
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
                logoUrl={instagramLogoUrl}
                onClick={() => void handleNetworkShare('instagram')}
              >
                Share to Instagram
              </ShareNetworkButton>
              <ShareNetworkButton
                disabled={loading || renderingImage}
                loading={shareActionLoading === 'x'}
                logoUrl={xLogoUrl}
                onClick={() => void handleNetworkShare('x')}
              >
                Share to X
              </ShareNetworkButton>
              <button
                className="flex h-12 w-full items-center justify-between border border-zinc-200 bg-white px-4 text-left font-mono text-[11px] uppercase tracking-wide text-black transition-colors hover:bg-zinc-50 disabled:opacity-60"
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

            {renderedImageUrl ? (
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-black"
                onClick={() => downloadShareImage(renderedImageUrl)}
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
  logoUrl,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  logoUrl: string
  onClick: () => void
}) {
  return (
    <button
      className="flex h-12 w-full items-center justify-between bg-black px-4 text-left font-mono text-[11px] uppercase tracking-wide text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60"
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-3">
        <span className="grid size-6 shrink-0 place-items-center overflow-hidden bg-white">
          <Image className="object-cover" src={logoUrl} alt="" width={24} height={24} sizes="24px" />
        </span>
        {children}
      </span>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
    </button>
  )
}

async function renderShareImage(result: AnalysisResponse, shareUrl: string | null) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')

  const image = await loadShareImage(getCanvasSafeImageUrl(result.photo.imageUrl))
  drawCoverImage(context, image, canvas.width, canvas.height)
  drawShareImageOverlay(context, result, shareUrl, canvas.width, canvas.height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Unable to render share image'))
        return
      }

      resolve(nextBlob)
    }, 'image/png', 0.95)
  })

  return {
    blob,
    url: URL.createObjectURL(blob),
  }
}

function getCanvasSafeImageUrl(imageUrl: string) {
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('/')) return imageUrl
  return `/api/share/image-proxy?src=${encodeURIComponent(imageUrl)}`
}

function loadShareImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load share image'))
    image.src = src
  })
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  const x = (width - drawWidth) / 2
  const y = (height - drawHeight) / 2
  context.drawImage(image, x, y, drawWidth, drawHeight)
}

function drawShareImageOverlay(
  context: CanvasRenderingContext2D,
  result: AnalysisResponse,
  shareUrl: string | null,
  width: number,
  height: number
) {
  const landmarks = getReportLandmarks(result)
  const categories = shareFeatureCategoryIds
    .map((categoryId) => reportCategories.find((category) => category.id === categoryId))
    .filter((category): category is ReportCategory => Boolean(category))
  const score = result.analysis.pslScore ?? 0

  context.save()
  const gradient = context.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0.28)')
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.02)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.82)')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  categories.forEach((category, index) => {
    drawShareGeometry(context, getReportOverlayGeometry(category, landmarks), category, result, index, width, height)
  })

  context.fillStyle = 'rgba(255,255,255,0.92)'
  context.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText('MOGGING REPORT', 52, 72)
  context.font = '700 148px ui-sans-serif, system-ui, sans-serif'
  context.fillText(score.toFixed(1), 52, height - 150)
  context.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText('/ 8 PSL', 292, height - 164)
  context.font = '700 28px ui-sans-serif, system-ui, sans-serif'
  context.fillText(result.analysis.tier || 'Facial assessment', 56, height - 92)

  const featureText = categories
    .map((category) => {
      const reportCategory = getReportCategoryData(category.id, result)
      return `${reportCategory?.title ?? category.title}: ${reportCategory?.features?.[0]?.value ?? category.features[0]?.value ?? 'measured'}`
    })
    .join('  /  ')
  context.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillStyle = 'rgba(255,255,255,0.72)'
  context.fillText(featureText.slice(0, 84), 56, height - 48)

  if (shareUrl) {
    context.textAlign = 'right'
    context.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillText(new URL(shareUrl).host.toUpperCase(), width - 52, height - 48)
    context.textAlign = 'left'
  }
  context.restore()
}

function drawShareGeometry(
  context: CanvasRenderingContext2D,
  geometry: ReturnType<typeof getReportOverlayGeometry>,
  category: ReportCategory,
  result: AnalysisResponse,
  index: number,
  width: number,
  height: number
) {
  const yOffset = geometry.usesLandmarks ? 0 : getReportOverlayYOffset(category.id)
  const scaleX = width / 100
  const scaleY = height / 100

  context.save()
  context.strokeStyle = 'rgba(255,255,255,0.88)'
  context.fillStyle = 'rgba(255,255,255,0.98)'
  context.lineWidth = 3
  context.lineCap = 'round'

  geometry.boxes.forEach((box) => {
    if (box.dashed) context.setLineDash([10, 10])
    context.strokeRect(box.x * scaleX, (box.y + yOffset) * scaleY, box.width * scaleX, box.height * scaleY)
    context.setLineDash([])
  })

  geometry.lines.forEach((line) => {
    context.beginPath()
    context.moveTo(line.x1 * scaleX, (line.y1 + yOffset) * scaleY)
    context.lineTo(line.x2 * scaleX, (line.y2 + yOffset) * scaleY)
    context.stroke()
  })

  geometry.points.forEach((point) => {
    const x = point.x * scaleX
    const y = (point.y + yOffset) * scaleY
    context.beginPath()
    context.arc(x, y, 8, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.arc(x, y, 3.5, 0, Math.PI * 2)
    context.fill()
  })

  const labelX = Math.min(width - 360, geometry.label.x * scaleX)
  const labelY = Math.min(height - 250, Math.max(110, (geometry.label.y + yOffset) * scaleY))
  const reportCategory = getReportCategoryData(category.id, result)
  const labelTitle = reportCategory?.title ?? category.title
  const labelValue = reportCategory?.features?.[0]?.value ?? (geometry.label.value.replace(/[[\]]/g, '').trim() || 'measured')

  drawSharePill(context, `[ 00${index + 1} ] ${labelTitle}`, labelX, labelY)
  drawSharePill(context, labelValue, labelX, labelY + 44)
  context.restore()
}

function drawSharePill(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  context.save()
  context.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace'
  const metrics = context.measureText(text)
  context.fillStyle = 'rgba(255,255,255,0.92)'
  context.fillRect(x, y, metrics.width + 28, 34)
  context.fillStyle = 'rgba(0,0,0,0.92)'
  context.fillText(text.toUpperCase(), x + 14, y + 24)
  context.restore()
}

function formatShareScore(score: number | null) {
  return typeof score === 'number' ? score.toFixed(1) : '--'
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="opacity-60">{label} /</div>
      <div className="mt-1 text-foreground/80">{value}</div>
    </div>
  )
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/55">{label} /</div>
      <div className="mt-1 text-white/90">{value}</div>
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
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
