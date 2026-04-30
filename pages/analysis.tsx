import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  CreditCard,
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
import { CameraSheet } from '@/components/analysis/camera-sheet'
import { CaptureFrame } from '@/components/analysis/capture-frame'

type FlowStep = 'upload' | 'preview-analysis' | 'payment' | 'actual-analysis' | 'results'

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

export default function AnalysisPage() {
  const router = useRouter()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<AnalysisDraftImage[]>([])
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other')
  const [step, setStep] = useState<FlowStep>('upload')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<AnalysisResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)

  const primaryResult = results[0]
  const primaryScore = primaryResult?.analysis.pslScore ?? null
  const canStart = images.length > 0 && step === 'upload'

  const previewImage = useMemo(() => images[0]?.dataUrl ?? null, [images])

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 3 - images.length)
    if (files.length === 0) return

    const nextImages = await Promise.all(files.map(readImageFile))
    setImages((current) => [...current, ...nextImages].slice(0, 3))
    event.target.value = ''
  }

  async function startPseudoAnalysis() {
    if (!canStart) return

    setError(null)
    setStep('preview-analysis')
    setProgress(0)

    for (let tick = 1; tick <= 50; tick += 1) {
      await wait(100)
      setProgress(tick * 2)
    }

    setStep('payment')
  }

  async function startCheckout() {
    try {
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
    }
  }

  const resumeAfterPayment = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      setStep('actual-analysis')
      setProgress(0)

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
      setGender(draft.gender)

      const analysisResults: AnalysisResponse[] = []
      for (const [index, image] of draft.images.entries()) {
        setProgress(Math.round((index / draft.images.length) * 100))
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
      setStep('payment')
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
      setStep('payment')
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
    setImages((current) => current.filter((image) => image.id !== id))
  }

  function addCameraImage(image: { dataUrl: string; name: string }) {
    setImages((current) => {
      if (current.length >= 3) return current

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          name: image.name,
          dataUrl: image.dataUrl,
        },
      ].slice(0, 3)
    })
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl gap-5 py-2 sm:py-6">
      <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handleFiles} />

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex h-12 items-center justify-between border-b px-4 sm:px-5">
          <div className="text-sm font-semibold tracking-tight">QOVES</div>
          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span>Free facial assessment</span>
            <span className="hidden sm:inline">Menu ▲</span>
          </div>
        </div>

        <div className="grid min-h-[620px] gap-8 p-4 sm:p-5 lg:grid-cols-[0.78fr_1.22fr] lg:p-6">
          <aside className="flex flex-col justify-between gap-8">
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
                  <Meta label="Uploaded" value={`${images.length}/3`} />
                </div>
              </div>
            </div>

            <div>
              <Button className="h-11 w-full justify-between rounded-sm font-mono text-[11px] uppercase" onClick={startPseudoAnalysis} disabled={!canStart}>
                Begin assessment
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="mt-6 max-w-sm text-xs leading-5 text-muted-foreground">
                By clicking begin, you agree that the uploaded images can be used to generate your private report.
              </p>
            </div>
          </aside>

          <div className="grid min-h-[520px] place-items-center overflow-hidden rounded-sm bg-zinc-950 p-4 sm:p-8">
            <CaptureFrame
              imageSrc={previewImage}
              imageAlt="Selected face preview"
              title="Look straight ahead"
              subtitle={previewImage ? 'Center your face in the frame' : 'Upload or take up to three photos'}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex h-12 items-center justify-between border-b px-4 sm:px-5">
          <div className="text-sm font-semibold tracking-tight">QOVES</div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">
            Step {stepIndex(step)} / 05
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'upload' ? (
            <FlowPanel key="upload">
              <UploadStep
                gender={gender}
                images={images}
                onCamera={() => setCameraOpen(true)}
                onGenderChange={setGender}
                onRemove={removeImage}
                onUpload={() => uploadInputRef.current?.click()}
              />
            </FlowPanel>
          ) : null}

          {step === 'preview-analysis' ? (
            <FlowPanel key="preview">
              <PseudoAnalysisStep progress={progress} />
            </FlowPanel>
          ) : null}

          {step === 'payment' ? (
            <FlowPanel key="payment">
              <PaymentStep error={error} imageCount={images.length} onCheckout={startCheckout} />
            </FlowPanel>
          ) : null}

          {step === 'actual-analysis' ? (
            <FlowPanel key="actual">
              <ActualAnalysisStep progress={progress} />
            </FlowPanel>
          ) : null}

          {step === 'results' ? (
            <FlowPanel key="results">
              <ResultsStep
                primaryScore={primaryScore}
                results={results}
                onOpenShare={() => setShareOpen(true)}
                onReset={() => {
                  setImages([])
                  setResults([])
                  setStep('upload')
                  setShareUrl(null)
                }}
              />
            </FlowPanel>
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

function UploadStep({
  gender,
  images,
  onCamera,
  onGenderChange,
  onRemove,
  onUpload,
}: {
  gender: 'male' | 'female' | 'other'
  images: AnalysisDraftImage[]
  onCamera: () => void
  onGenderChange: (gender: 'male' | 'female' | 'other') => void
  onRemove: (id: string) => void
  onUpload: () => void
}) {
  return (
    <div className="grid min-h-[520px] gap-8 lg:grid-cols-[0.75fr_1fr_0.75fr]">
      <div className="flex flex-col justify-center">
        <h2 className="max-w-[220px] text-3xl font-semibold leading-none tracking-[-0.05em] sm:text-4xl">
          Upload your image
        </h2>
        <p className="mt-5 max-w-[230px] text-sm leading-5 text-muted-foreground">
          Use clear photos where you face the camera with neutral expression.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onUpload} variant="outline" disabled={images.length >= 3}>
            <Upload className="size-4" aria-hidden="true" />
            Upload
          </Button>
          <Button onClick={onCamera} variant="outline" disabled={images.length >= 3}>
            <Camera className="size-4" aria-hidden="true" />
            Camera
          </Button>
        </div>
      </div>

      <div className="grid content-center gap-3">
        <div className="mx-auto w-full max-w-[320px] border p-1">
          <div className="flex items-center justify-between border-b px-2 py-2 font-mono text-[10px] uppercase text-muted-foreground">
            <span>Upload //</span>
            <span>{images.length > 0 ? 'Image uploaded successfully' : 'Awaiting image'}</span>
          </div>
          <div className="bg-black p-2">
            <CaptureFrame
              className="max-w-[300px] rounded-[34px]"
              imageSrc={images[0]?.dataUrl}
              imageAlt="Primary uploaded preview"
              title="Look straight ahead"
              subtitle={images[0] ? 'Center your face in the frame' : 'Upload or take a photo'}
            />
          </div>
        </div>

        {images.length > 0 ? (
          <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-2">
            {images.map((image) => (
              <button key={image.id} className="group relative aspect-square overflow-hidden rounded-sm border bg-muted" onClick={() => onRemove(image.id)} type="button">
                <img className="h-full w-full object-cover" src={image.dataUrl} alt={image.name} />
                <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                  <X className="size-3" aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col justify-center gap-6 text-sm text-muted-foreground">
        <ul className="grid gap-3">
          <li>▪ Remove glasses</li>
          <li>▪ Look directly at camera</li>
          <li>▪ Pull hair back</li>
          <li>▪ Keep neutral expression</li>
        </ul>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wide">Gender scoring mode</p>
          <div className="grid grid-cols-3 gap-2">
            {(['male', 'female', 'other'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onGenderChange(option)}
                className={`rounded-md border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  gender === option ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
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

function ActualAnalysisStep({ progress }: { progress: number }) {
  return (
    <CenteredStep
      icon={<Loader2 className="size-6 animate-spin" aria-hidden="true" />}
      eyebrow="Analysis"
      title="Generating your results"
      description="Payment is confirmed. Your private report is being generated now."
    >
      <ProgressBar progress={progress} />
    </CenteredStep>
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

function FlowPanel({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="p-4 sm:p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
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

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value?.toFixed(1) ?? '--'}</div>
    </div>
  )
}

function stepIndex(step: FlowStep) {
  return {
    upload: '01',
    'preview-analysis': '02',
    payment: '03',
    'actual-analysis': '04',
    results: '05',
  }[step]
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
