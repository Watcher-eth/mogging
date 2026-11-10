import { Images, RotateCcw, ScanFace } from '@/components/ui/mogging-glyphs'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { AnalysisDraftImage } from '@/lib/client/analysisDraft'
import { CaptureFrame, type CaptureFrameImagePosition } from './capture-frame'
import { DesktopStep, type DesktopCaptureStep } from './desktop-onboarding'
import { desktopCaptureViewport } from './face-guide'
import { DesktopCaptureExample, DesktopCaptureOval } from './desktop-capture-oval'
import { getProfileSilhouette } from '@/lib/client/profile-silhouette'
import { PhotoEdgeFade } from './photo-edge-fade'
import { CaptureLesson } from './capture-lesson'
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { isFaceLandmarksUsable, type FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { AnalysisProgress } from './analysis-progress'
import { ScanRipple } from './scan-ripple'
import { TextMorph } from 'torph/react'

const captureEase = [.22, 1, .36, 1] as const
const frontScanMs = 4000
const frontSweepMs = 2500
const overallOverlay = getReportOverlayPreset('overall')

const copy = {
  front: ['Add your front photo.', 'Look straight ahead, keep the camera at eye level, and use even light.'],
  side: ['Add a side profile.', 'Turn fully to one side and keep your forehead, nose, chin, and ear in frame.'],
  review: ['Review your framing.', 'Keep the face centered. Drag the portrait or adjust the zoom if needed.'],
} as const

export function DesktopCapture({ step, direction, images, selected, position, photoStatus, frontLandmarksPending, canSubmit, consent, submitLabel = 'Scan my photos', setupSteps, error, onPosition, onSelect, onBack, onContinue, onChooseFront, onChooseSide, onCamera, onRemove }: {
  step: DesktopCaptureStep
  direction: 1 | -1
  images: AnalysisDraftImage[]
  selected?: AnalysisDraftImage
  position: CaptureFrameImagePosition
  photoStatus: string | null
  frontLandmarksPending: boolean
  canSubmit: boolean
  consent?: ReactNode
  submitLabel?: string
  setupSteps?: Parameters<typeof DesktopStep>[0]['setupSteps']
  error: string | null
  onPosition: (value: CaptureFrameImagePosition) => void
  onSelect: (id: string) => void
  onBack?: () => void
  onContinue: () => void
  onChooseFront: () => void
  onChooseSide: () => void
  onCamera: () => void
  onRemove: (id: string) => void
}) {
  const reduce = useReducedMotion()
  const [title, description] = copy[step]
  const isReview = step === 'review'
  const isSide = step === 'side'
  const loadingPhoto = Boolean(photoStatus)
  const [advancedFrontId, setAdvancedFrontId] = useState<string>()
  const [unreadableFrontId, setUnreadableFrontId] = useState<string>()
  const portrait = isReview ? selected : images.find(image => isSide ? image.view === 'side' : image.view !== 'side')
  const front = step === 'front' ? portrait : undefined
  const unreadable = Boolean(front && front.id === unreadableFrontId)
  const scanFront = Boolean(front && front.id !== advancedFrontId && !unreadable)
  const replace = (isReview ? portrait?.view === 'side' : isSide) ? onChooseSide : onChooseFront
  const fit = isReview && (position.scale !== 1 || position.x !== 50 || position.y !== 50) ? 'cover' : 'contain'
  const submitScan = isReview || Boolean(isSide && portrait)
  const continueLabel = loadingPhoto ? 'Preparing photo' : submitScan ? submitLabel
    : scanFront ? 'Scanning photo' : portrait ? 'Continue' : isSide ? 'Choose side photo' : 'Choose front photo'
  const actionIcon = loadingPhoto ? undefined : submitScan || scanFront ? ScanFace : portrait ? undefined : Images
  useEffect(() => {
    if (portrait?.view === 'side' && !portrait.landmarks) void getProfileSilhouette(portrait.dataUrl)
  }, [portrait])


  function advance() {
    if (front) setAdvancedFrontId(front.id)
    onContinue()
  }

  return <DesktopStep step={step} setupSteps={setupSteps} direction={direction} title={title} description={description} onBack={onBack}
    onContinue={isReview || portrait ? advance : replace} continueLabel={continueLabel}
    actionIcon={actionIcon}
    secondaryAction={portrait && !front && <button type="button" className="desktop-replace-photo" onClick={replace} disabled={loadingPhoto} aria-label="Replace photo"><RotateCcw size={18} /></button>}
    busy={loadingPhoto} disabled={scanFront || unreadable || (submitScan && !canSubmit)} bareMedia
    media={<div className="desktop-capture-media">
      <div className="desktop-capture-preview" data-front-photo={Boolean(front && !loadingPhoto) || undefined}>
        <AnimatePresence initial={false} mode="popLayout">
          {photoStatus ? <motion.div key="loading" className="desktop-capture-loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .22 }}>
            <CaptureSkull />
            <AnalysisProgress label={photoStatus} />
          </motion.div> : front ? <motion.div key={`front-${front.id}`} className="desktop-front-photo"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .32 }}>
            <FrontPhotoPreview portrait={front} scanning={scanFront} landmarksPending={frontLandmarksPending} unreadable={unreadable}
              onAdvance={advance} onRedo={replace} onImageError={() => setUnreadableFrontId(front.id)} />
          </motion.div> : portrait ? <motion.div key={portrait.id} className="desktop-capture-image"
            initial={{ opacity: 0, scale: reduce ? 1 : 1.018 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .38, ease: [.22, 1, .36, 1] }}>
            <CaptureFrame bare imageFit={fit} className="!aspect-[4/5] !w-full !max-w-none !rounded-none !bg-transparent !shadow-none"
              viewport={desktopCaptureViewport} landmarks={portrait.landmarks} imageSrc={portrait.dataUrl}
              imageAlt={portrait.view === 'side' ? 'Your side profile' : 'Your front photo'}
              imagePosition={isReview ? position : undefined} onImagePositionChange={isReview ? onPosition : undefined}
              showStepIndicator={false} scanOnLoad={!isReview} />
            <PhotoEdgeFade />
            <span className="desktop-capture-corners" aria-hidden="true" />
          </motion.div> : null}
        </AnimatePresence>
        {!portrait && !loadingPhoto && <><DesktopCaptureExample side={isSide} /><DesktopCaptureOval side={isSide} /></>}
        {!isReview && !front && <CaptureLesson key={step} side={isSide} />}
        {!isReview && !portrait && !loadingPhoto && <div className="desktop-capture-empty">
          <span>{isSide ? 'Full side profile' : 'Face the camera'}</span>
          <div className="desktop-capture-buttons">
            <button type="button" onClick={replace} aria-label="Open photo gallery" className="desktop-capture-gallery"><Images size={21} /></button>
            <button type="button" onClick={onCamera} aria-label="Open camera" className="desktop-capture-shutter"><span /></button>
          </div>
        </div>}
      </div>
    </div>}>
    {isReview && portrait && <div className="desktop-framing-controls">
      {images.length > 1 && <div className="assessment-view-switch" role="group" aria-label="Review photos">{images.map((image, index) => <button key={image.id} type="button" aria-pressed={image.id === portrait.id} onClick={() => onSelect(image.id)} disabled={loadingPhoto}>
        {image.view === 'side' ? 'Side profile' : index === 0 ? 'Front photo' : `Photo ${index + 1}`}
      </button>)}</div>}
      <label>Zoom <input className="analysis-zoom-slider" type="range" min="1" max="3" step=".01" disabled={loadingPhoto} value={position.scale}
        onChange={event => onPosition({ ...position, scale: Number(event.target.value) })} /></label>
      <div className="desktop-capture-actions"><button type="button" disabled={loadingPhoto} onClick={() => onRemove(portrait.id)}>Remove photo</button></div>
    </div>}
    {submitScan && consent}
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
  </DesktopStep>
}

function FrontPhotoPreview({ portrait, scanning, landmarksPending, unreadable, onAdvance, onRedo, onImageError }: {
  portrait: AnalysisDraftImage
  scanning: boolean
  landmarksPending: boolean
  unreadable: boolean
  onAdvance: () => void
  onRedo: () => void
  onImageError: () => void
}) {
  const present = useIsPresent()
  const reduce = useReducedMotion()
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<AnalysisDraftImage['landmarks']>(null)
  const [sweepDone, setSweepDone] = useState(false)
  const advance = useEffectEvent(onAdvance)
  const measured = isFaceLandmarksUsable(portrait.landmarks) ? portrait.landmarks ?? null : detected ?? null
  const landmarks = useMemo(() => enrichFaceLandmarks(measured), [measured])
  const camera = image && landmarks ? frontPhotoFraming(image, landmarks) : undefined

  useEffect(() => {
    if (!image || measured || !present || landmarksPending) return
    let active = true
    void getReportImageLandmarks(portrait.dataUrl, image.src).then(result => {
      if (active) setDetected(result)
    })
    return () => { active = false }
  }, [image, landmarksPending, measured, portrait.dataUrl, present])

  useEffect(() => {
    if (!present || !scanning) return
    const sweep = window.setTimeout(() => setSweepDone(true), frontSweepMs)
    // Navigation has its own deadline, even when detection or the canvas stalls.
    const finish = window.setTimeout(() => advance(), frontScanMs)
    return () => { window.clearTimeout(sweep); window.clearTimeout(finish) }
  }, [present, scanning])

  return <>
    <div className="desktop-front-photo-frame">
      <div className="desktop-front-photo-window">
        <motion.div className="absolute inset-0" initial={false}
          animate={camera ?? { scale: 1, x: '0%', y: '0%' }}
          transition={{ duration: reduce ? 0 : .85, ease: captureEase }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portrait.dataUrl} alt="Your front photo" draggable={false} onLoad={({ currentTarget: photo }) => {
            setImage({ src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
          }} onError={onImageError} />
          {image && scanning && !sweepDone && <ScanRipple imageSrc={image.src} durationMs={frontSweepMs} imageRatio={image.width / image.height} />}
          {image && landmarks && (sweepDone || !scanning) && <FaceOverlay image={image} landmarks={landmarks} preset={overallOverlay}
            categoryId="overall" appearance="scan-detail" fit="contain" fadeDurations={{ enter: .4, exit: .2 }} />}
        </motion.div>
        <PhotoEdgeFade />
      </div>
      <span className="desktop-capture-corners" aria-hidden="true" />
    </div>
    <div className="desktop-front-photo-status">
      {scanning ? <AnalysisProgress durationMs={frontScanMs} label={!sweepDone || (landmarksPending && !landmarks)
        ? 'Mapping your face…' : landmarks ? 'Drawing your face map…' : 'Preparing side capture…'} />
        : <p role="status"><TextMorph>{unreadable ? 'Couldn’t open this photo. Try another.' : 'Front photo ready.'}</TextMorph></p>}
    </div>
    <button type="button" className="desktop-replace-photo" onClick={onRedo} aria-label="Redo photo">
      <RotateCcw size={16} aria-hidden="true" />
    </button>
  </>
}

function frontPhotoFraming(image: LoadedImage, landmarks: FaceLandmarksPayload) {
  const { forehead, chin, leftCheek, rightCheek } = landmarks.anchors
  const points = landmarks.contours?.faceOutline ?? [forehead, chin, leftCheek, rightCheek]
  const placement = getImageTransform(image, { width: 1, height: 1 }, 'contain')
  const outline = points.flatMap(point => point ? [projectImagePoint(point, image, placement)] : [])
  if (outline.length < 2) return undefined
  const left = Math.min(...outline.map(point => point.x)), right = Math.max(...outline.map(point => point.x))
  const top = Math.min(...outline.map(point => point.y)), bottom = Math.max(...outline.map(point => point.y))
  const scale = Math.max(.84, Math.min(4.5, .74 / Math.max(right - left, bottom - top, .01)))
  return { scale, x: `${(1 - left - right) * scale * 50}%`, y: `${(1 - top - bottom) * scale * 50}%` }
}

function CaptureSkull() {
  return <div className="desktop-capture-skull" aria-hidden="true"><svg viewBox="0 0 150 172" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M75 16c-31 0-54 21-54 51 0 23 9 32 19 38l4 22 12 7 4 17h30l4-17 12-7 4-22c10-6 19-15 19-38 0-30-23-51-54-51Z" />
      <path d="M37 88c0-13 8-20 19-16l9 5c5 5 2 17-7 20-11 5-21 1-21-9Zm76 0c0-13-8-20-19-16l-9 5c-5 5-2 17 7 20 11 5 21 1 21-9ZM75 90l-8 19 8 5 8-5-8-19ZM51 122l11 5h26l11-5m-42 16h36m-28-10v17m10-17v17m10-17v17" />
      <path d="M27 66h96M75 27v26M30 104l19 7m71-7-19 7" strokeDasharray="2 5" opacity=".55" />
    </g>
  </svg></div>
}
