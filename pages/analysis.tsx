import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  CreditCard,
  Gem,
  Loader2,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  clearAnalysisDraft,
  loadAnalysisDraft,
  saveAnalysisDraft,
  type AnalysisDraftImage,
} from '@/lib/client/analysisDraft'
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
    metrics: Record<string, unknown>
    failureReason?: string | null
  }
  deduped: boolean
}

type CheckoutResponse = {
  url: string
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
    title: 'Overall score',
    subtitle: 'Final calibrated facial assessment',
    scoreLabel: 'Overall',
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createPreviewAnalysisResult(image: AnalysisDraftImage, index: number): AnalysisResponse {
  const baseScore = 7.6 - index * 0.2

  return {
    photo: {
      id: `preview-photo-${image.id}`,
      imageUrl: image.dataUrl,
      imageHash: `preview-${image.id}`,
    },
    analysis: {
      id: `preview-analysis-${image.id}`,
      status: 'complete',
      pslScore: baseScore,
      harmonyScore: baseScore + 0.2,
      dimorphismScore: baseScore - 0.1,
      angularityScore: baseScore - 0.3,
      percentile: 88 - index * 4,
      tier: 'Preview report',
      tierDescription: 'Temporary preview result for reviewing the analysis UI and motion flow before reconnecting checkout.',
      metrics: {},
      failureReason: null,
    },
    deduped: false,
  }
}

export default function AnalysisPage() {
  const router = useRouter()
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

  const primaryResult = results[0]
  const primaryScore = primaryResult?.analysis.pslScore ?? null
  const canStart = images.length > 0 && step === 'upload'

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
    event.target.value = ''
  }

  async function startPseudoAnalysis() {
    if (!canStart) return

    setError(null)
    setAnalysisUnlocked(false)
    setPaymentDialogOpen(false)
    setProgress(18)
    setStep('actual-analysis')
  }

  async function startCheckout() {
    setCheckoutLoading(true)
    setError(null)

    await wait(320)

    setCheckoutLoading(false)
    setAnalysisUnlocked(true)
    setPaymentDialogOpen(false)
    setStep('actual-analysis')
    setProgress(30)

    void runPreviewAnalysis()
  }

  async function runPreviewAnalysis() {
    const draftImages = images.length > 0 ? images : selectedImage ? [selectedImage] : []

    for (const progressValue of [40, 52, 64, 76, 88, 100]) {
      await wait(3_200)
      setProgress(progressValue)
    }

    if (draftImages.length === 0) return

    setResults(draftImages.map(createPreviewAnalysisResult))
    setStep('results')
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

  async function createShare() {
    if (!primaryResult) return

    try {
      setShareLoading(true)
      const response = await apiPost<ShareResponse>('/api/share/analysis', {
        analysisId: primaryResult.analysis.id,
        includeLeaderboard: true,
      })
      const url = `${window.location.origin}/share/${response.share.token}`
      setShareUrl(url)
      await navigator.clipboard.writeText(url).catch(() => null)
      toast.success('Share link copied')
    } catch (shareError) {
      toast.error(shareError instanceof ApiClientError ? shareError.message : 'Unable to create share link')
    } finally {
      setShareLoading(false)
    }
  }

  function removeImage(id: string) {
    setImages((current) => {
      const nextImages = current.filter((image) => image.id !== id)
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
    setImages((current) => {
      return [
        ...current,
        {
          id: imageId,
          name: image.name,
          dataUrl: image.dataUrl,
        },
      ].slice(0, 3)
    })
    setSelectedImageId(imageId)
  }

  return (
    <div className="min-h-[calc(100svh-5rem)] w-full bg-white">
      <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handleFiles} />

      <section className="min-h-[calc(100svh-5rem)] overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          {step === 'intro' ? (
            <ScreenMotion key="intro">
              <IntroScreen onBegin={() => setStep('upload')} />
            </ScreenMotion>
          ) : null}

          {step === 'upload' ? (
            <ScreenMotion key="upload">
              <UploadScreen
                images={images}
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
                    setStep('intro')
                    setShareUrl(null)
                  }}
                />
              </ProcessScreen>
            </ScreenMotion>
          ) : null}
        </AnimatePresence>
      </section>

      <ShareSheet
        open={shareOpen}
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
    <div className="grid min-h-[calc(100svh-5rem)] gap-10 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 xl:gap-24 2xl:gap-32">
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

        <div>
          <Button className="h-11 w-full justify-between rounded-sm font-mono text-[11px] uppercase" onClick={onBegin}>
            Begin assessment
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          <p className="mt-6 max-w-sm text-xs leading-5 text-muted-foreground">
            By clicking begin, you agree that the uploaded images can be used to generate your private report.
          </p>
        </div>
      </aside>

      <div className="relative min-h-[560px] overflow-hidden bg-zinc-200 lg:min-h-0">
        <img className="absolute inset-0 h-full w-full object-cover object-center" src={previewPhotoUrl} alt="Facial assessment preview" />
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
    </div>
  )
}

function UploadScreen({
  canStart,
  images,
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
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
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
                  <img className="h-full w-full object-cover" src={image.dataUrl} alt={image.name} />
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
    <div className="grid min-h-[calc(100svh-5rem)] place-items-center p-4 sm:p-8">
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-xl'}`}>{children}</div>
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
          <MosaicImage imageSrc={imageSrc} />
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

function MosaicImage({ imageSrc }: { imageSrc: string | null }) {
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
        {mode === 'annotated' ? <MosaicAnnotations key="mosaic-annotations" /> : null}
      </AnimatePresence>
    </div>
  )
}

function MosaicAnnotations() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
    >
      <MosaicCallout
        className="left-[52%] top-[57%]"
        height={88}
        label="Chin height"
        value="[ 5 CM ]"
      />
      <MosaicCallout
        className="left-[29%] top-[32%]"
        height={70}
        label="Eye line"
        value="[ balanced ]"
      />
      <MosaicCallout
        className="left-[62%] top-[43%]"
        height={62}
        label="Nose axis"
        value="[ centered ]"
      />
    </motion.div>
  )
}

function MosaicCallout({
  className,
  height,
  label,
  textSide = 'right',
  value,
}: {
  className: string
  height: number
  label: string
  textSide?: 'left' | 'right'
  value: string
}) {
  const textPositionClass = textSide === 'left'
    ? 'right-7 justify-items-end text-right'
    : 'left-7 justify-items-start text-left'

  return (
    <div className={`absolute ${className}`}>
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
          <img className="absolute inset-0 h-full w-full object-cover object-center" src={paymentDialogImageUrl} alt="Analysis preview" />
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
  primaryScore,
  results,
  onOpenShare,
  onReset,
}: {
  primaryScore: number | null
  results: AnalysisResponse[]
  onOpenShare: () => void
  onReset: () => void
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(reportCategories[0]?.id ?? 'overall')
  const primaryResult = results[0]
  const activeCategory = reportCategories.find((category) => category.id === activeCategoryId) ?? reportCategories[0]
  const activeIndex = reportCategories.findIndex((category) => category.id === activeCategory.id)
  const imageSrc = primaryResult?.photo.imageUrl ?? previewPhotoUrl
  const score = primaryScore ?? primaryResult?.analysis.pslScore ?? 0
  const categoryScore = getReportCategoryScore(activeCategory.id, primaryResult)

  return (
    <div className="grid min-h-[calc(100svh-5rem)] gap-12 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:justify-between lg:gap-20 xl:gap-28">
      <section className="grid gap-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory.id}
            className="grid gap-4 lg:grid-cols-[minmax(0,0.98fr)_minmax(280px,0.72fr)] lg:items-stretch"
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(8px)' }}
            transition={{ duration: 0.56, ease: [0.23, 1, 0.32, 1] }}
          >
            <ReportImagePanel category={activeCategory} imageSrc={imageSrc} />
            <ReportDetailPanel category={activeCategory} score={categoryScore} />
          </motion.div>
        </AnimatePresence>
      </div>

      <aside className="flex min-h-[calc(100svh-9rem)] flex-col justify-between bg-black p-5 text-white lg:sticky lg:top-24">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-white/45">Final analysis //</p>
          <h2 className="mt-3 text-5xl font-semibold leading-none tracking-[-0.06em]">Your Report</h2>
          <div className="mt-6 grid gap-1.5">
            {reportCategories.map((category, index) => {
              const isActive = category.id === activeCategory.id

              return (
                <button
                  key={category.id}
                  className={`group grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wide transition-colors duration-300 ${
                    isActive ? 'bg-white text-black' : 'text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={() => setActiveCategoryId(category.id)}
                  type="button"
                >
                  <span>[ {String(index + 1).padStart(3, '0')} ]</span>
                  <span>{category.title}</span>
                  <span className={isActive ? 'text-black/50' : 'text-white/25'}>{category.id === 'overall' ? score.toFixed(1) : ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="border border-white/15 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-white/45">Overall score</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-6xl font-semibold leading-none tracking-[-0.06em]">{score.toFixed(1)}</span>
              <span className="pb-1 font-mono text-[10px] uppercase text-white/45">/ 10</span>
            </div>
          </div>
          <button
            className="flex h-12 w-full items-center justify-between bg-white px-4 font-mono text-[11px] uppercase tracking-wide text-black transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0"
            onClick={onOpenShare}
            type="button"
          >
            Share your score
            <Share2 className="size-4" aria-hidden="true" />
          </button>
          <button
            className="h-10 text-left font-mono text-[10px] uppercase tracking-wide text-white/42 transition-colors hover:text-white/70"
            onClick={onReset}
            type="button"
          >
            New analysis
          </button>
        </div>
      </aside>
    </div>
  )
}

function ReportImagePanel({ category, imageSrc }: { category: ReportCategory; imageSrc: string }) {
  return (
    <div className="relative min-h-[640px] overflow-hidden bg-zinc-100">
      <img className="absolute inset-0 h-full w-full object-cover object-center" src={imageSrc} alt={`${category.title} analysis image`} />
      <div className="absolute inset-0 bg-white/5" />
      <ReportOverlay category={category} />
      <div className="absolute inset-x-4 top-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
        <span>[ {category.title} ]</span>
        <span>Active measurement</span>
      </div>
    </div>
  )
}

function ReportOverlay({ category }: { category: ReportCategory }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {category.overlayLines.map((line, index) => (
        <motion.line
          key={`${category.id}-line-${index}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="rgba(255,255,255,0.92)"
          strokeDasharray="1"
          strokeLinecap="round"
          strokeWidth="0.28"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.12 + index * 0.08, duration: 0.82, ease: [0.23, 1, 0.32, 1] }}
        />
      ))}
      {category.overlayPoints.map((point, index) => (
        <motion.circle
          key={`${category.id}-point-${index}`}
          cx={point.x}
          cy={point.y}
          r="0.75"
          fill="white"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.06, duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
        />
      ))}
    </svg>
  )
}

function ReportDetailPanel({ category, score }: { category: ReportCategory; score: number }) {
  return (
    <div className="grid content-start gap-3">
      <div className="border bg-white p-5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{category.scoreLabel}</p>
        <div className="mt-14 flex items-end justify-between">
          <h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{category.title}</h3>
          <span className="font-mono text-xl">{score.toFixed(1)}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{category.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {category.features.map((feature, index) => (
          <motion.div
            key={`${category.id}-${feature.label}`}
            className="min-h-36 border bg-zinc-50 p-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.07, duration: 0.46, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{feature.label}</p>
            <p className="mt-16 text-xl font-semibold tracking-[-0.04em]">{feature.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="min-h-40 border bg-white p-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38, duration: 0.52, ease: [0.23, 1, 0.32, 1] }}
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p>
        <p className="mt-16 text-sm leading-6 text-muted-foreground">
          {category.title} is scored from visible proportions, local symmetry, and how the feature fits the full facial frame.
        </p>
      </motion.div>
    </div>
  )
}

function getReportCategoryScore(categoryId: string, result?: AnalysisResponse) {
  if (!result) return 0

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

  return Math.max(0, Math.min(10, scores[categoryId] ?? overall))
}

function ShareSheet({
  open,
  shareUrl,
  loading,
  onClose,
  onCreate,
}: {
  open: boolean
  shareUrl: string | null
  loading: boolean
  onClose: () => void
  onCreate: () => void
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-50 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close share sheet" type="button" />
          <motion.div
            className="absolute inset-x-0 bottom-0 rounded-t-xl border bg-background p-5 shadow-2xl sm:left-auto sm:right-5 sm:top-20 sm:h-fit sm:w-[380px] sm:rounded-xl"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Share result</h2>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Create a public share link for the primary result.
            </p>
            {shareUrl ? (
              <div className="mt-5 flex items-center gap-2 rounded-md border bg-muted p-2">
                <span className="min-w-0 flex-1 truncate text-sm">{shareUrl}</span>
                <Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                  <Copy className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            <Button className="mt-5 w-full" onClick={onCreate} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
              {shareUrl ? 'Copy again' : 'Create share link'}
            </Button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
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
