import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getReportProfileOverlay, profileContourOverlay } from '@/lib/creator/profile-report-overlay'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { getProfileSilhouette } from '@/lib/client/profile-silhouette'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import type { AnalysisDraftImage } from '@/lib/client/analysisDraft'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { AnalysisProgress } from './analysis-progress'
import { PhotoEdgeFade } from './photo-edge-fade'
import { ScanRipple } from './scan-ripple'

const profilePasses = [
  { at: 0, label: 'Profile contour', feature: 'jaw' },
  { at: 1300, label: 'Jawline', feature: 'angle' },
  { at: 2650, label: 'Nasal profile', feature: 'nose' },
  { at: 3925, label: 'Chin contour', feature: 'chin' },
] as const
const frontPasses = [
  { at: 5200, label: 'Facial outline', category: 'overall' },
  { at: 6300, label: 'Eye alignment', category: 'eyes' },
  { at: 7350, label: 'Brow contour', category: 'brows' },
  { at: 8400, label: 'Nose and bridge', category: 'nose' },
  { at: 9450, label: 'Lip contour', category: 'mouth' },
  { at: 10500, label: 'Cheek contours', category: 'cheeks' },
  { at: 11550, label: 'Jaw contours', category: 'jaw' },
  { at: 12600, label: 'Facial proportions', category: 'proportions' },
  { at: 13650, label: 'Facial symmetry', category: 'symmetry' },
  { at: 14700, label: 'Skin mapping', category: 'skin' },
] as const
const passes = [...profilePasses, ...frontPasses]
const duration = 16_000
const ease = [.22, 1, .36, 1] as const
const sweepEase = [.42, 0, .24, 1] as const

const focusAnchors: Partial<Record<typeof frontPasses[number]['category'], (keyof FaceLandmarksPayload['anchors'])[]>> = {
  eyes: ['leftPupil', 'rightPupil'],
  brows: ['leftBrow', 'rightBrow'],
  nose: ['noseTip'],
  mouth: ['mouthLeft', 'mouthRight'],
  cheeks: ['leftCheek', 'rightCheek'],
  jaw: ['jawLeft', 'jawRight'],
  proportions: ['forehead', 'chin'],
  symmetry: ['noseBridge', 'chin'],
}

export function DesktopPortraitScan({ front, side, startedAt, onComplete, processing }: {
  front?: AnalysisDraftImage
  side?: AnalysisDraftImage
  startedAt?: number
  onComplete?: () => void
  processing?: { stage: number; label: string }
}) {
  const reduce = useReducedMotion()
  const [initialElapsed] = useState(() => startedAt ? Math.min(duration, Math.max(0, Date.now() - startedAt)) : 0)
  const [cut, setCut] = useState(() => passes.findLastIndex(pass => pass.at <= initialElapsed))
  const showFront = !side || cut >= profilePasses.length

  useEffect(() => {
    const cues = passes.flatMap(({ at }, index) => at > initialElapsed
      ? [window.setTimeout(() => setCut(index), at - initialElapsed)] : [])
    if (onComplete) cues.push(window.setTimeout(onComplete, duration - initialElapsed))
    return () => cues.forEach(window.clearTimeout)
  }, [initialElapsed, onComplete])

  return <div className="desktop-portrait-scan">
    <motion.div layoutId="analysis-portrait" transition={{ layout: { duration: reduce ? 0 : .7, ease } }} className="desktop-scan-stage">
      <div className="desktop-scan-mask">
        <ScanPortrait portrait={side} visible={!showFront} phase={Math.min(cut, profilePasses.length - 1)} side />
        <ScanPortrait portrait={front} visible={showFront} phase={Math.max(0, cut - profilePasses.length)} />
      </div>
    </motion.div>
    <div className="desktop-scan-status">
      <span>{processing ? `${Math.min(processing.stage + 1, 3)} of 3 · Private analysis` : showFront ? '2 of 2 · Front photo' : '1 of 2 · Side photo'}</span>
      {processing ? <AnalysisProgress {...processing} /> : <AnalysisProgress label={passes[cut].label} durationMs={duration - initialElapsed} initialProgress={initialElapsed / duration} />}
    </div>
  </div>
}

function ScanPortrait({ portrait, visible, phase, side = false }: {
  portrait?: AnalysisDraftImage; visible: boolean; phase: number; side?: boolean
}) {
  const reduce = useReducedMotion()
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [outline, setOutline] = useState<NormalizedPoint[] | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const original = portrait?.landmarks
  const measured = original && original.confidence >= .58 ? original : detected
  const landmarks = useMemo(() => enrichFaceLandmarks(measured), [measured])
  const src = portrait?.dataUrl

  useEffect(() => {
    if (!src) return
    let active = true
    if (side) {
      void getProfileSilhouette(src).then(value => { if (active) setOutline(value) })
    } else if (!measured) {
      void getReportImageLandmarks(src, src).then(value => { if (active) setDetected(value) })
    }
    return () => { active = false }
  }, [src, side, measured])

  const feature = side ? profilePasses[phase].feature : undefined
  const category = side ? undefined : frontPasses[phase].category
  const activeAnchors = category ? focusAnchors[category] : undefined
  const seconds = (side ? frontPasses[0].at : duration - frontPasses[0].at) / 1000
  const preset = useMemo(() => {
    if (category) return getReportOverlayPreset(category)
    if (!image || !feature) return null
    const measuredPreset = landmarks ? getReportProfileOverlay(image, landmarks, feature, true) : null
    return measuredPreset ?? (outline ? profileContourOverlay(feature, silhouettePass(outline, feature)) : null)
  }, [category, feature, image, landmarks, outline])

  if (!src) return null

  return <motion.div className="desktop-scan-photo" data-ripple-reveal={!side && !reduce || undefined} initial={false}
    style={{ '--desktop-scan-ratio': image ? image.width / image.height : 9 / 16 } as CSSProperties}
    animate={{ opacity: side || reduce ? (visible ? 1 : 0) : 1, '--scan-reveal': visible ? '126%' : '0%' }}
    transition={{ duration: reduce ? 0 : .78, delay: !reduce && side && !visible ? .34 : 0, ease }}
    aria-hidden={!visible}>
    <motion.div className="absolute inset-0" initial={false}
      animate={reduce ? undefined : { scale: visible ? [1.01, 1.045, 1.02] : 1.01, x: visible ? [side ? 2 : -3, 0] : 0 }}
      transition={{ duration: visible ? seconds : .75, ease: sweepEase }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={side ? 'Side profile' : 'Front portrait'} draggable={false} onLoad={({ currentTarget: photo }) => {
        setImage({ src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
      }} />
      <AnimatePresence>
        {visible && image && preset && (side || landmarks) && <FaceOverlay key={feature ?? category}
          preset={preset} landmarks={landmarks} image={image} fit="contain"
          appearance="scan-detail" categoryId={category} fadeDurations={{ enter: .19, exit: .22 }} />}
      </AnimatePresence>
      {visible && !reduce && activeAnchors?.map(key => {
        const point = landmarks?.anchors[key]
        return point && <motion.span key={`${category}-${key}`} className="desktop-scan-anchor" aria-hidden="true"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          initial={{ opacity: 0, scale: .65 }} animate={{ opacity: [0, .78, 0], scale: [.65, 1, 1.85] }}
          transition={{ duration: .85, times: [0, .35, 1], ease }} />
      })}
    </motion.div>
    <PhotoEdgeFade />
    {visible && image && <ScanRipple key={src} imageSrc={image.src} mode="processing" />}
  </motion.div>
}

// A full side profile may only have a segmented edge. Keep the trace on that
// edge without presenting an anatomical angle from an unmeasured landmark.
function silhouettePass(outline: NormalizedPoint[], feature: typeof profilePasses[number]['feature']) {
  const at = (fraction: number) => Math.round(outline.length * fraction)
  if (feature === 'nose') return [outline.slice(at(.25), at(.68))]
  if (feature === 'chin') return [outline.slice(at(.72))]
  if (feature === 'angle') return [outline.slice(at(.58))]
  return [outline]
}
