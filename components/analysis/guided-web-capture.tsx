import { ScanRipple } from './scan-ripple'
import { ensureReady } from '@web-kits/audio'
import { cameraShutterCue, useQuietCue } from '@/lib/audio/sounds'
import { trackWebEvent } from '@/lib/analytics/client'
import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { useWebStep } from '@/hooks/use-web-step'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ImagePlus, ScanFace, X } from '@/components/ui/mogging-glyphs'
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type RefObject, type TouchEvent } from 'react'
import { guidedCameraFrame, guidedFaceAlignment, mobileFaceGuide as guide } from '@/lib/client/guided-camera-frame'
import { markScanCoverage, scanRingSize } from '@/lib/client/scan-coverage'
import type { createWebCameraPoseReader } from '@/lib/client/faceLandmarks'

type Reader = Awaited<ReturnType<typeof createWebCameraPoseReader>>
type Phase = 'ready' | 'countdown' | 'front' | 'scan' | 'done'
const emptyRing = Array<boolean>(scanRingSize).fill(false)
const ease = [.23, 1, .32, 1] as const
const guideStyle = {
  '--face-guide-center': `${guide.centerY * 100}%`,
  '--face-guide-bottom': `${(guide.centerY + guide.height / 2) * 100}%`,
} as CSSProperties

export function GuidedWebCapture({ videoRef, cameraReady, error, onUpload, onClose, takeFrontPhoto, onFrontPhoto, onComplete, analyticsEnabled = false }: {
  analyticsEnabled?: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  cameraReady: boolean
  error: string | null
  onUpload: () => void
  onClose: () => void
  takeFrontPhoto: (zoom: number) => string | undefined
  onFrontPhoto?: (dataUrl: string | null) => void
  onComplete: (dataUrl: string) => void
}) {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const playShutter = useQuietCue(cameraShutterCue)
  const [phase, setPhase] = useState<Phase>('ready')
  const completeStep = useWebStep(`capture.${phase}`, analyticsEnabled)
  const track = (result: string, reason_code?: string) => {
    if (analyticsEnabled) trackWebEvent('face_capture_result', { surface: 'web_analysis', step: `capture.${phase}`, result, reason_code })
  }
  const [countdown, setCountdown] = useState(3)
  const [covered, setCovered] = useState(emptyRing)
  const [guidance, setGuidance] = useState('')
  const [direction, setDirection] = useState<ReturnType<typeof missingDirection> | null>(null)
  const [reader, setReader] = useState<Reader>()
  const [modelError, setModelError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null)
  const frontPose = useRef<{ yaw: number; pitch: number } | null>(null)
  const [showFrameError, setShowFrameError] = useState(false)

  useEffect(() => {
    if (!cameraReady || phase !== 'scan' || reader) return
    let active = true
    const started = performance.now()
    const recordModel = (result: string, reason_code?: string) => {
      if (analyticsEnabled) trackWebEvent('photo_preparation_stage', { surface: 'web_analysis', step: 'capture.face_model', result, reason_code, duration_ms: Math.round(performance.now() - started) })
    }
    const fail = (reason: string) => {
      if (!active) return
      setModelError(true)
      recordModel('failed', reason)
    }
    const timeout = window.setTimeout(() => fail('model_load_timeout'), 8000)
    void import('@/lib/client/faceLandmarks').then(module => module.createWebCameraPoseReader()).then(read => {
      if (active) { setReader(() => read); setModelError(false); recordModel('ready') }
    }).catch(() => fail('model_load_failed')).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout) }
  }, [cameraReady, analyticsEnabled, phase, reader])

  const takeTimedPhoto = useEffectEvent(() => {
    const image = takeFrontPhoto(zoomRef.current)
    if (!image) {
      track('failed', 'frame_unavailable')
      setShowFrameError(true)
      setCountdown(3)
      setPhase('ready')
      return
    }
    setFrontPhoto(image)
    onFrontPhoto?.(image)
    playShutter()
    if (analyticsEnabled) trackWebEvent('face_capture_result', {
      surface: 'web_analysis', step: 'capture.front', result: 'front_saved',
    })
    try {
      const video = videoRef.current
      const pose = video && reader?.(video)
      frontPose.current = pose?.status === 'found' ? pose : null
    } catch {
      frontPose.current = null
    }
    setPhase('front')
  })

  useEffect(() => {
    if (phase !== 'countdown') return
    const timer = window.setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1)
      else takeTimedPhoto()
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, phase])

  useEffect(() => {
    if (!reader || phase !== 'scan') return
    let lastAdvance = performance.now()
    const started = performance.now()
    let warned = false
    const coverage = [...emptyRing]
    const sample = () => {
      const video = videoRef.current
      if (!video?.videoWidth || !video.clientWidth || !video.clientHeight || video.readyState < 2 || document.hidden || pinch.current) return
      const now = performance.now()
      if (!warned && now - started > 8000) {
        warned = true
        if (analyticsEnabled) trackWebEvent('face_capture_result', {
          surface: 'web_analysis', step: 'capture.scan', result: 'stalled', reason_code: 'rotation_incomplete',
        })
      }
      const pose = reader(video)
      const face = pose.status === 'found' ? guidedFaceAlignment(pose, guidedCameraFrame(video, zoomRef.current)) : null
      if (pose.status !== 'found' || !face || face.height < .14 || face.coverage < .55) {
        setGuidance(pose.status === 'multiple' ? 'Only one face in the frame' : face ? alignmentHint(face) : 'Position your face in the oval')
        return
      }
      const origin = frontPose.current ??= { yaw: pose.yaw, pitch: pose.pitch }
      const advanced = markScanCoverage(coverage, pose.yaw - origin.yaw, pose.pitch - origin.pitch)
      if (advanced) {
        setCovered([...coverage])
        setDirection(null)
        lastAdvance = now
      } else if (now - lastAdvance > 1200 && coverage.some(Boolean)) {
        lastAdvance = now
        setDirection(missingDirection(coverage))
      }
      setGuidance('')
      if (coverage.every(Boolean)) setPhase('done')
    }
    const timer = window.setInterval(() => {
      try { sample() } catch {
        if (analyticsEnabled) trackWebEvent('face_capture_result', { surface: 'web_analysis', step: `capture.${phase}`, result: 'failed', reason_code: 'pose_detection_failed' })
        setModelError(true)
        window.clearInterval(timer)
      }
    }, 95)
    return () => window.clearInterval(timer)
  }, [analyticsEnabled, phase, reader, videoRef])

  const completeCapture = useEffectEvent(() => {
    if (frontPhoto) onComplete(frontPhoto)
  })

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(() => completeCapture(), reduced ? 0 : 320)
    return () => window.clearTimeout(timer)
  }, [phase, reduced])

  function updatePinch(event: TouchEvent<HTMLVideoElement>) {
    if (event.touches.length !== 2) {
      pinch.current = null
      return
    }
    const [first, second] = Array.from(event.touches)
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
    if (distance < 1) return
    pinch.current ??= { distance, zoom: zoomRef.current }
    const next = Math.max(1, Math.min(3, pinch.current.zoom * distance / pinch.current.distance))
    zoomRef.current = next
    setZoom(next)
  }

  function restart() {
    track('restarted')
    setFrontPhoto(null)
    onFrontPhoto?.(null)
    frontPose.current = null
    setCountdown(3)
    setCovered(emptyRing)
    setDirection(null)
    setGuidance('')
    setModelError(false)
    setPhase('ready')
  }

  const percent = Math.round(covered.filter(Boolean).length / covered.length * 100)
  const message = !cameraReady ? 'Preparing your camera…'
    : phase === 'ready' ? showFrameError ? 'Couldn’t take the photo. Try again.' : 'Look straight at the camera'
    : phase === 'countdown' ? 'Hold still for the photo'
    : phase === 'front' ? 'Your front photo is ready'
    : phase === 'done' ? percent === 100 ? 'Scan complete' : 'Photo ready'
    : modelError ? 'Your front photo is ready to use.'
    : !reader ? 'Photo taken. Preparing the optional scan…'
    : `${guidance || 'Gently tilt your head in a small circle'} · ${percent}%`

  const reviewing = phase === 'front' || phase === 'scan' || phase === 'done'
  const [loadedFrontPhoto, setLoadedFrontPhoto] = useState<{ src: string; ratio: number }>()
  const showFrontPhoto = frontPhoto && (phase === 'front' || (phase === 'done' && percent < 100))
  const rotating = phase === 'scan' && Boolean(reader) && !modelError
  const aligned = rotating && !guidance
  return <div className="guided-scan" style={guideStyle} data-aligned={aligned || undefined}>
    <video ref={videoRef} autoPlay muted playsInline className={cameraReady ? "is-ready" : undefined}
      style={{ transform: `scale(${-zoom}, ${zoom})` }}
      onTouchStart={updatePinch} onTouchMove={updatePinch} onTouchEnd={updatePinch} onTouchCancel={() => { pinch.current = null }} />
    {showFrontPhoto &&
      // eslint-disable-next-line @next/next/no-img-element
      <img className="guided-scan-front" src={frontPhoto} alt="Your captured front photo" onLoad={({ currentTarget: photo }) => {
        if (frontPhoto && photo.naturalWidth && photo.naturalHeight) setLoadedFrontPhoto({ src: frontPhoto, ratio: photo.naturalWidth / photo.naturalHeight })
      }} />}
    {showFrontPhoto && loadedFrontPhoto && loadedFrontPhoto.src === frontPhoto &&
      <ScanRipple key={frontPhoto} imageSrc={loadedFrontPhoto.src} imageRatio={loadedFrontPhoto.ratio} />}
    <div className="guided-scan-shade" aria-hidden="true" />
    <MobileCaptureChrome label={reviewing && !rotating ? 'Front photo' : undefined} />
    <AnimatePresence>
      {(rotating || (phase === 'done' && percent === 100)) && <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }}
        animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }}>
        <MobileCaptureRing covered={covered} />
      </motion.div>}
      {phase === 'front' && !reduced && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white"
        initial={{ opacity: .55 }} animate={{ opacity: 0 }} transition={{ duration: .19 }} />}
    </AnimatePresence>
    <AnimatePresence initial={false}>
      {phase === 'countdown' && <motion.strong className="guided-scan-count" key={countdown} initial={reduced ? false : { opacity: 0, scale: 1.14 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2, ease }} aria-label={`Capture starts in ${countdown}`}>{countdown}</motion.strong>}
      {direction && rotating && !guidance && <motion.div className="guided-scan-direction" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.span animate={reduced ? undefined : { x: [0, direction.x * 5, 0], y: [0, direction.y * 5, 0] }} transition={{ duration: .56, repeat: 1 }}>{direction.arrow}</motion.span>
        Turn head {direction.label}
      </motion.div>}
    </AnimatePresence>
    {error ? <div className="mobile-capture-permission">
      <h2 role="status">{error}</h2>
      <p>You can continue with a photo from your library.</p>
      <button type="button" className="mobile-capture-primary mx-auto mt-4" onClick={() => { track('library_selected'); onUpload() }}><ImagePlus size={18} /> Choose from library</button>
      <button type="button" className="mt-3 min-h-11 px-3 text-sm text-white/80" onClick={onClose}>Back</button>
    </div> : <>
      <div className="guided-scan-copy" data-reviewing={reviewing || undefined}>
        <p role="status">{message}</p>
        {(phase === 'ready' || phase === 'countdown') && cameraReady && <small>The camera takes your photo when the timer ends.</small>}
        {phase === 'scan' && <small>You can continue with the photo you’ve taken.</small>}
      </div>
      {reviewing ? <div className="guided-scan-review-actions">
        <motion.button type="button" className="mobile-capture-primary" disabled={phase === 'done'}
          whileTap={reduced ? undefined : { scale: .96 }} onClick={() => {
            feedback('action')
            track('front_photo_used')
            completeStep()
            setPhase('done')
          }}><ScanFace size={19} /> Use this photo</motion.button>
        <div className="guided-scan-review-secondary">
          {phase === 'front' && <button type="button" className="guided-scan-secondary" onClick={() => {
            feedback()
            track('rotation_started')
            completeStep()
            setPhase('scan')
          }}>Add guided rotation</button>}
          <button type="button" className="guided-scan-secondary" disabled={phase === 'done'} onClick={restart}>Retake photo</button>
        </div>
      </div> : <div className="guided-scan-dock">
        <motion.button type="button" whileTap={reduced ? undefined : { scale: .94 }} className="guided-scan-library" onClick={() => { track('library_selected'); feedback(); onUpload() }} aria-label="Choose from library"><ImagePlus size={22} /></motion.button>
        <button type="button" className="guided-scan-shutter"
          aria-label={phase === 'ready' ? 'Take photo' : 'Restart capture'}
          disabled={!cameraReady} onClick={() => {
          if (phase === 'ready') {
            void ensureReady().catch(() => {})
            if (analyticsEnabled) trackWebEvent('face_capture_started', { surface: 'web_analysis', step: 'capture.countdown', source: 'camera' })
            completeStep()
            setShowFrameError(false)
            setPhase('countdown')
            return
          }
          restart()
        }}><span>{phase !== 'ready' && <X size={22} />}</span></button>
      </div>}
    </> }
  </div>
}

function alignmentHint(face: ReturnType<typeof guidedFaceAlignment>) {
  if (face.height < .14) return 'Move a little closer'
  if (face.width > guide.width || face.height > guide.height) return 'Move back or pinch to zoom out'
  const x = (face.x - .5) / guide.width
  const y = (face.y - guide.centerY) / guide.height
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'Move a little left' : 'Move a little right'
  return y > 0 ? 'Raise your face slightly' : 'Lower your face slightly'
}

export function MobileCaptureChrome({ label = 'Align face' }: { label?: string }) {
  return <header className="mobile-capture-chrome"><h1>Capture</h1><span>{label}</span></header>
}

export function MobileCaptureRing({ covered = emptyRing }: { covered?: boolean[] }) {
  return (
    <svg className="guided-scan-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {covered.map((filled, index) => {
        const angle = index / covered.length * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle)
        const y = Math.sin(angle)
        const rx = guide.width * 50
        const ry = guide.height * 50
        const cy = guide.centerY * 100
        return <line key={index} x1={50 + x * rx} y1={cy + y * ry} x2={50 + x * (rx + (filled ? 3 : 2))} y2={cy + y * (ry + (filled ? 1.45 : .95))} strokeWidth="1.8" vectorEffect="non-scaling-stroke" className={filled ? 'is-filled' : undefined} />
      })}
    </svg>
  )
}

function missingDirection(coverage: boolean[]) {
  let longest = 0
  let center = 0
  for (let index = 0; index < coverage.length; index++) {
    if (coverage[index] || !coverage[(index + coverage.length - 1) % coverage.length]) continue
    let length = 0
    while (length < coverage.length && !coverage[(index + length) % coverage.length]) length++
    if (length > longest) { longest = length; center = index + (length - 1) / 2 }
  }
  const angle = center / coverage.length * Math.PI * 2
  const x = Math.sin(angle)
  const y = -Math.cos(angle)
  const label = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up')
  return { label, x, y, arrow: { right: '→', left: '←', up: '↑', down: '↓' }[label] }
}
