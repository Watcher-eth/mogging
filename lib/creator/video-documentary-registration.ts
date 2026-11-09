import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import type { GeneratorImage } from './content-generator'
import { faceContourPaths, metricFaceOverlay, narratedFaceMetric } from './face-metric-guides'
import { anglePaths, profileFeatureForText, profileGeometry, type ProfileStudy } from './video-profile'
import profileGuides from '@/public/creator/profile-guides.json'
import type { SemanticBeat } from './video-semantics'

const contours = {
  eyes: ['leftEye', 'rightEye'], brows: ['leftBrow', 'rightBrow'], nose: ['noseBridge', 'noseBase'], lips: ['mouth'],
  jaw: ['jawline'], cheeks: ['leftCheekbone', 'rightCheekbone'], whole: ['faceOutline'],
  symmetry: ['faceOutline'], dimorphism: ['faceOutline'],
} as const
type Section = { paths: NormalizedPoint[][]; label?: string }
export type SurveyPin = { label: string; point: NormalizedPoint }

export function documentarySurveyPins(image: GeneratorImage, feature: SemanticBeat['feature']): SurveyPin[] {
  const face = image.landmarks
  if (!face || face.confidence < .58) return []
  const a = face.anchors
  const pair = (label: string, left?: NormalizedPoint, right?: NormalizedPoint): [string, NormalizedPoint | undefined][] =>
    Math.abs(face.quality?.yawRadians ?? 0) > .55 ? [] : [[label, left], [label, right]]
  const points: [string, NormalizedPoint | undefined][] =
    feature === 'jaw' ? [...pair('Jaw angle', a.jawLeft, a.jawRight), ['Chin', a.chin]]
      : feature === 'eyes' ? pair('Pupil', a.leftPupil, a.rightPupil)
      : feature === 'brows' ? pair('Brow', a.leftBrow, a.rightBrow)
      : feature === 'cheeks' ? pair('Cheek', a.leftCheek, a.rightCheek)
      : feature === 'nose' ? [['Bridge', a.noseBridge], ['Nose tip', a.noseTip]]
      : feature === 'lips' || feature === 'philtrum' ? [['Upper lip', a.upperLip], ['Mouth center', a.mouthCenter]]
      : [['Nose tip', a.noseTip], ['Chin', a.chin]]
  return points.flatMap(([label, point]) => point ? [{ label, point }] : [])
}

export function documentaryRegistration(image: GeneratorImage, beat: SemanticBeat, authored?: ProfileStudy): Section {
  const face = image.landmarks
  const { width, height } = image
  const normalized = (points: NormalizedPoint[]) => points.map(p => ({ x: p.x / width, y: p.y / height }))
  const yaw = Math.abs(face?.quality?.yawRadians ?? 0)
  const saved = (profileGuides as Record<string, { dataUrl: string; side: ProfileStudy['side']; contours: ProfileStudy['contours']; angle?: ProfileStudy['angle'] }>)[image.id]
  const trusted = saved?.dataUrl === image.dataUrl ? saved : undefined
  if (authored || trusted || (beat.view !== 'front' && /profile|three-quarter/i.test(image.id)) || yaw >= .36) {
    const study = authored ?? {
      view: /profile/i.test(image.id) || yaw > .65 ? 'profile' as const : 'three-quarter' as const,
      side: trusted?.side ?? 'right' as const,
      contours: trusted?.contours, angle: trusted?.angle,
      feature: beat.feature === 'eyes' || beat.feature === 'brows' ? beat.feature : profileFeatureForText(beat.quote, beat.feature),
    }
    if (authored || /\bjawline\b/i.test(beat.quote) || ['jaw', 'nose', 'lips', 'eyes', 'brows', 'cheeks'].includes(beat.feature)) {
      try {
        const profile = profileGeometry(image, study)
        return { paths: (profile.angle ? anglePaths(profile.angle) : [profile.contour]).map(normalized) }
      } catch {
        // Without measured or authored registration, leave the record unmarked.
      }
    }
    if (/profile/i.test(image.id) || yaw > .65) return { paths: [] }
  }
  if (!face || face.confidence < .58) return { paths: [] }
  const metric = narratedFaceMetric(beat.quote)
  if (metric) {
    const overlay = metricFaceOverlay({ size: { width, height }, primitives: [], dots: [] }, image, metric.id)
    const paths = overlay.primitives.flatMap(item => item.kind === 'polyline' ? [normalized(item.pixelPoints)] : [])
    if (paths.length) return { paths, label: metric.label }
  }
  const keys = contours[beat.feature as keyof typeof contours] ?? []
  if (beat.feature === 'philtrum' && face.anchors.noseTip && face.anchors.upperLip)
    return { paths: [[face.anchors.noseTip, face.anchors.upperLip]] }
  return { paths: keys.flatMap(key => faceContourPaths(face, key)) }
}
