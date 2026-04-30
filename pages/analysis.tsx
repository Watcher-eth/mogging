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
    try {
      setCheckoutLoading(true)
      setError(null)
      await saveAnalysisDraft({
        images,
        gender,
        savedAt: Date.now(),
      })
      const checkout = await apiPost<CheckoutResponse>('/api/payments/checkout', {
        imageCount: images.length,
      })
      window.location.href = checkout.url
    } catch (checkoutError) {
      setError(checkoutError instanceof ApiClientError ? checkoutError.message : 'Unable to start payment')
      setCheckoutLoading(false)
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
      <div className="grid min-h-[calc(100svh-5rem)] gap-10 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
        <div className="flex flex-col justify-center">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Analysis //</p>
          <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[0.92] tracking-[-0.06em] sm:text-6xl">
            Generating your facial assessment
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
            Your uploaded image is being evaluated against the research-weighted rubric.
          </p>
          <div className="mt-10">
            <AnalysisTimeline
              isUnlocked={isUnlocked}
              onPaymentRequired={onPaymentRequired}
            />
          </div>
          <div className="mt-10 max-w-xl">
            <ProgressBar progress={isUnlocked ? progress : 24} />
          </div>
        </div>

        <div className="grid place-items-center">
          <MosaicImage imageSrc={imageSrc} />
        </div>
      </div>

      <AnalysisPaymentDialog
        error={checkoutError}
        loading={checkoutLoading}
        open={paymentDialogOpen}
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
    }, 4_200)

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
    }, 1_200)

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
            className="relative pl-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
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
                  initial={{ height: 0, opacity: 0, y: -8 }}
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -10 }}
                  transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
                >
                  <TextLoop interval={2.6} transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}>
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
  const src = imageSrc || previewPhotoUrl
  const permutation = mosaicPermutations[phase % mosaicPermutations.length]

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((current) => current + 1)
    }, 1_350)

    return () => clearInterval(timer)
  }, [])

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
              opacity: sourceIndex === 4 ? 0.92 : 0.78,
              scale: sourceIndex === 4 ? 1.02 : 1,
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
      <div className="pointer-events-none absolute inset-0 bg-white/10" />
    </div>
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
  return (
    <div className="grid min-h-[520px] gap-8 lg:grid-cols-[0.7fr_1.3fr]">
      <div className="flex flex-col justify-center">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Results //</p>
        <h2 className="mt-3 text-5xl font-semibold tracking-[-0.06em] sm:text-7xl">
          {primaryScore?.toFixed(1) ?? '--'}
        </h2>
        <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
          Your report is ready. Share the result or start a new assessment.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onOpenShare}>
            <Share2 className="size-4" aria-hidden="true" />
            Share result
          </Button>
          <Button variant="outline" onClick={onReset}>
            New analysis
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {results.map((result, index) => (
          <div key={result.analysis.id} className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-[112px_1fr]">
            <img className="aspect-square w-full rounded-md object-cover sm:w-28" src={result.photo.imageUrl} alt={`Analyzed image ${index + 1}`} />
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Image {index + 1}</p>
                  <p className="text-sm text-muted-foreground">{result.analysis.tier || 'Assessment complete'}</p>
                </div>
                <Badge variant="secondary">{result.analysis.pslScore?.toFixed(1) ?? '--'}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <Score label="Harmony" value={result.analysis.harmonyScore} />
                <Score label="Dimorphism" value={result.analysis.dimorphismScore} />
                <Score label="Angularity" value={result.analysis.angularityScore} />
              </div>
              {result.analysis.tierDescription ? (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{result.analysis.tierDescription}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
