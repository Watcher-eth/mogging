import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { useWebStep } from '@/hooks/use-web-step'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { markScanCoverage, scanRingSize } from '@/lib/client/scan-coverage'
import type { createWebCameraPoseReader } from '@/lib/client/faceLandmarks'

type Reader = Awaited<ReturnType<typeof createWebCameraPoseReader>>
type Phase = 'ready' | 'countdown' | 'front' | 'scan' | 'done'
const emptyRing = Array<boolean>(scanRingSize).fill(false)
const ease = [.23, 1, .32, 1] as const

export function GuidedWebCapture({ videoRef, cameraReady, error, onClose, onUpload, takeFrontPhoto, onComplete, analyticsEnabled = false }: {
  analyticsEnabled?: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  cameraReady: boolean
  error: string | null
  onClose: () => void
  onUpload: () => void
  takeFrontPhoto: () => string | null
  onComplete: (dataUrl: string) => void
}) {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const [phase, setPhase] = useState<Phase>('ready')
  useWebStep(`capture.${phase}`, analyticsEnabled)
  const [countdown, setCountdown] = useState(3)
  const [covered, setCovered] = useState(emptyRing)
  const [guidance, setGuidance] = useState('')
  const [direction, setDirection] = useState<ReturnType<typeof missingDirection> | null>(null)
  const [reader, setReader] = useState<Reader>()
  const [modelError, setModelError] = useState(false)
  const front = useRef<{ image: string; yaw: number; pitch: number } | null>(null)
  const actions = useRef({ takeFrontPhoto, onComplete })
  useEffect(() => { actions.current = { takeFrontPhoto, onComplete } }, [takeFrontPhoto, onComplete])

  useEffect(() => {
    if (!cameraReady) return
    let active = true
    const timeout = window.setTimeout(() => { if (active) setModelError(true) }, 12000)
    void import('@/lib/client/faceLandmarks').then(module => module.createWebCameraPoseReader()).then(read => {
      if (active) { setReader(() => read); setModelError(false) }
    }).catch(() => { if (active) setModelError(true) }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout) }
  }, [cameraReady])

  useEffect(() => {
    if (phase !== 'countdown') return
    const timer = window.setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1)
      else setPhase('front')
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, phase])

  useEffect(() => {
    if (!reader || (phase !== 'front' && phase !== 'scan')) return
    let stableAt: number | null = null
    let previous: { yaw: number; pitch: number } | null = null
    let lastAdvance = performance.now()
    let hinted = false
    const coverage = [...emptyRing]
    const sample = () => {
      const video = videoRef.current
      if (!video?.videoWidth || video.readyState < 2 || document.hidden) { stableAt = null; return }
      const now = performance.now()
      const pose = reader(video)
      const fit = Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight)
      const visibleWidth = video.videoWidth * fit / Math.max(1, video.clientWidth)
      const visibleHeight = video.videoHeight * fit / Math.max(1, video.clientHeight)
      if (pose.status !== 'found' || pose.height * visibleHeight < .16 ||
          Math.abs((pose.centerX - .5) * visibleWidth) > .23 ||
          Math.abs(.04 + (pose.centerY - .5) * visibleHeight) > .2) {
        stableAt = null
        setGuidance(pose.status === 'multiple' ? 'Only one face in the frame' : 'Position your face in the oval')
        return
      }
      if (phase === 'front') {
        if (Math.max(Math.abs(pose.yaw), Math.abs(pose.pitch), Math.abs(pose.roll)) > 10) {
          stableAt = null
          previous = null
          setGuidance('Look straight at the camera')
          return
        }
        setGuidance('Hold still…')
        if (previous && Math.hypot(previous.yaw - pose.yaw, previous.pitch - pose.pitch) > 4) stableAt = null
        previous = pose
        stableAt ??= now
        if (now - stableAt < 650) return
        const image = actions.current.takeFrontPhoto()
        if (!image) return
        front.current = { image, yaw: pose.yaw, pitch: pose.pitch }
        setGuidance('')
        setPhase('scan')
        return
      }
      if (!front.current) return
      const advanced = markScanCoverage(coverage, pose.yaw - front.current.yaw, pose.pitch - front.current.pitch)
      if (advanced) {
        setCovered([...coverage])
        setDirection(null)
        lastAdvance = now
      } else if (!hinted && now - lastAdvance > 1200 && coverage.filter(Boolean).length >= 24) {
        hinted = true
        setDirection(missingDirection(coverage))
      }
      setGuidance('')
      if (coverage.every(Boolean)) setPhase('done')
    }
    const timer = window.setInterval(() => {
      try { sample() } catch { setModelError(true); window.clearInterval(timer) }
    }, 95)
    return () => window.clearInterval(timer)
  }, [phase, reader, videoRef])

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(() => {
      if (front.current) actions.current.onComplete(front.current.image)
    }, reduced ? 0 : 320)
    return () => window.clearTimeout(timer)
  }, [phase, reduced])

  const percent = Math.round(covered.filter(Boolean).length / covered.length * 100)
  const message = error ?? (modelError ? 'Face detection is unavailable. Choose a library photo to continue.'
    : !reader ? 'Preparing your camera…'
    : phase === 'ready' ? 'Tap the shutter when you’re ready to pose'
    : phase === 'countdown' ? 'Pose, look straight ahead and hold still'
    : phase === 'done' ? 'Scan complete'
    : phase === 'scan' ? `${guidance || 'Gently tilt your head in a small circle'} · ${percent}%`
    : guidance || 'Position your face in the oval')

  return <div className="guided-scan">
    <video ref={videoRef} autoPlay muted playsInline className={cameraReady ? "is-ready" : undefined} />
    <div className="guided-scan-shade" aria-hidden="true" />
    <motion.button type="button" whileTap={reduced ? undefined : { scale: .94 }} className="guided-scan-close" onClick={() => { feedback(); onClose() }} aria-label="Close camera"><X size={22} /></motion.button>
    <MobileCaptureChrome />
    <MobileCaptureRing covered={covered} />
    <AnimatePresence initial={false}>
      {phase === 'countdown' && <motion.strong className="guided-scan-count" key={countdown} initial={reduced ? false : { opacity: 0, scale: 1.14 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2, ease }} aria-label={`Capture starts in ${countdown}`}>{countdown}</motion.strong>}
      {direction && phase === 'scan' && <motion.div className="guided-scan-direction" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.span animate={reduced ? undefined : { x: [0, direction.x * 5, 0], y: [0, direction.y * 5, 0] }} transition={{ duration: .56, repeat: 1 }}>{direction.arrow}</motion.span>
        Turn head {direction.label}
      </motion.div>}
    </AnimatePresence>
    <div className="guided-scan-copy">
      <p role="status">{message}</p>
      {!error && !modelError && <small>{phase === 'ready' || phase === 'countdown' ? 'Your photo will be taken after the countdown.' : phase === 'front' ? 'Hold your pose until your photo is captured.' : 'Your front photo is used for your evaluation.'}</small>}
    </div>
    <div className="guided-scan-dock">
      <motion.button type="button" whileTap={reduced ? undefined : { scale: .94 }} className="guided-scan-library" onClick={() => { feedback(); onUpload() }} aria-label="Choose from library"><ImagePlus size={22} /></motion.button>
      <button type="button" className="guided-scan-shutter" aria-label={phase === 'ready' ? 'Start face scan' : 'Cancel face scan'} disabled={!reader || !!error || modelError || phase === 'done'} onClick={() => {
        feedback()
        if (phase === 'ready') { setPhase('countdown'); return }
        front.current = null
        setCountdown(3)
        setCovered(emptyRing)
        setDirection(null)
        setGuidance('')
        setPhase('ready')
      }}><span>{phase !== 'ready' && <X size={22} />}</span></button>
    </div>
  </div>
}

export function MobileCaptureChrome() {
  return <div className="mobile-capture-chrome">
    <header><h1>Capture</h1><span>Face capture</span></header>
    <div><span>[ 001 ] Front image</span><span>Align face</span></div>
  </div>
}

export function MobileCaptureRing({ covered = emptyRing }: { covered?: boolean[] }) {
  return (
    <svg className="guided-scan-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {covered.map((filled, index) => {
        const angle = index / covered.length * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle)
        const y = Math.sin(angle)
        return <line key={index} x1={50 + x * 25} y1={46 + y * 17.75} x2={50 + x * (filled ? 28 : 27)} y2={46 + y * (filled ? 19.2 : 18.7)} strokeWidth="1.8" vectorEffect="non-scaling-stroke" className={filled ? 'is-filled' : undefined} />
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
