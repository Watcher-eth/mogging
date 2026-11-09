import type { FaceLandmarksPayload, NormalizedPoint } from './mobile-overlay-engine/landmarks'
import type { OverlayPreset, OverlayPrimitive } from './mobile-overlay-engine/schema'
import { anglePaths, profileGeometry, type ProfileStudy } from './video-profile'
import type { ProfileSilhouette } from '@/lib/client/profile-silhouette'
import { segmentedProfileNose } from '@/lib/client/profile-photo-guides'
import { cheekArches, jawSides, visibleProfileSide } from './facial-detail-guides'
import { sampleProfileGuides, sampleProfilePhoto } from './profile-report-sample'

export function profileContourOverlay(feature: ProfileStudy['feature'], paths: NormalizedPoint[][]): OverlayPreset | null {
  const primitives = paths.filter(points => points.length >= 2).map((points, index) => ({
    id: `${feature}-${index}`,
    kind: 'polyline' as const,
    points: points.map(point => ({ point })),
    strokeWidth: .32,
    opacity: .9,
    animation: { delay: index * 65, duration: 850, entrance: 'draw' as const },
  }))
  return primitives.length ? { id: `profile-${feature}`, footer: '[ PROFILE ]', primitives } : null
}

export function getReportProfileOverlay(
  image: { src: string; width: number; height: number },
  landmarks: FaceLandmarksPayload,
  feature: ProfileStudy['feature'],
  includeAngle = false,
) {
  if (landmarks.source === 'demo-static') return null
  try {
    const { contour, angle } = profileGeometry({
      id: 'profile', name: 'Side photo', dataUrl: image.src, width: image.width, height: image.height,
      landmarks: { ...landmarks, source: landmarks.source }, status: 'ready',
    }, { view: 'profile', side: (landmarks.quality?.yawRadians ?? 0) > 0 ? 'left' : 'right', feature })
    const paths = includeAngle && angle ? [contour, ...anglePaths(angle)] : [contour]
    return profileContourOverlay(feature, paths.map(path => path.map(point => ({ x: point.x / image.width, y: point.y / image.height }))))
  } catch {
    return null
  }
}

type Point = NormalizedPoint
type ProfileAngle = { from: Point; vertex: Point; to: Point }
type SideGuides = Partial<Record<'outline' | 'eye' | 'brow' | 'nose' | 'lips' | 'jaw' | 'cheek' | 'lowerCheek' | 'ear' | 'hair' | 'levels', Point[]>>
  & { jawAngle?: ProfileAngle; facing?: 'left' | 'right' }

function visibleLips(face: FaceLandmarksPayload, side: 'left' | 'right', outline?: Point[]) {
  const mouth = face.contours?.mouth
  const { upperLip, lowerLip, mouthLeft, mouthRight } = face.anchors
  const corner = side === 'left' ? mouthLeft : mouthRight
  if (!mouth || mouth.length < 6 || !upperLip || !lowerLip || !corner) return
  const ring = mouth[0].x === mouth.at(-1)?.x && mouth[0].y === mouth.at(-1)?.y ? mouth.slice(0, -1) : mouth
  const nearest = (point: Point) => ring.reduce((best, p, i) => {
    const distance = (q: Point) => Math.hypot((q.x - point.x) * face.image.width, (q.y - point.y) * face.image.height)
    return distance(p) < distance(ring[best]) ? i : best
  }, 0)
  const top = nearest(upperLip), bottom = nearest(lowerLip), edge = nearest(corner)
  if (top === bottom || edge === top || edge === bottom) return
  const steps = (bottom - top + ring.length) % ring.length
  const forward = (edge - top + ring.length) % ring.length < steps
  const path = Array.from({ length: (forward ? steps : ring.length - steps) + 1 },
    (_, index) => ring[(top + ring.length + (forward ? index : -index)) % ring.length])
  // Bring only the two anterior lip tips to the photographed edge. A distant
  // silhouette is often a moustache or an unreliable segmentation.
  for (const index of [0, path.length - 1]) {
    const point = path[index]
    const match = outline?.reduce((best, p) => Math.abs(p.y - point.y) < Math.abs(best.y - point.y) ? p : best)
    if (match && Math.abs(match.y - point.y) < .01 && Math.abs(match.x - point.x) < .035) {
      path[index] = { x: match.x, y: point.y }
    }
  }
  return path
}

const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function rowBounds(polygon: Point[], y: number) {
  const hits = polygon.flatMap((a, index) => {
    const b = polygon[(index + 1) % polygon.length]
    return (a.y > y) !== (b.y > y) ? [mix(a, b, (y - a.y) / (b.y - a.y)).x] : []
  })
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] as const : null
}

const skinRowCounts = [3, 4, 5, 5, 4, 3, 2] // 26 dots, denser across the cheekbone.
const skinDotStaggerMs = 28

function profileSkinDots(guide: SideGuides, visibleSkin?: Point[]) {
  const { eye, cheek, lowerCheek, jaw } = guide
  if (!eye?.length || !cheek?.length || !lowerCheek?.length || !jaw?.length) return []
  const eyeBottom = eye.reduce((lowest, point) => point.y > lowest.y ? point : lowest)
  const medial = cheek.at(-1)!, lateral = cheek[0]
  const lowerMedial = lowerCheek.at(-1)!, lowerLateral = lowerCheek[0]
  const jawBottom = jaw.reduce((lowest, point) => point.y > lowest.y ? point : lowest)
  const jawRear = jaw.find(point => point.y > lowerLateral.y && point.y < jawBottom.y) ?? jaw[0]
  const underEye = mix(eyeBottom, medial, .22)
  const jawline = mix(jawRear, jawBottom, .58)
  const bottom = mix(jawline, lowerMedial, .13)
  const eyeLeft = Math.min(...eye.map(point => point.x))
  const eyeRight = Math.max(...eye.map(point => point.x))
  const eyeWidth = eyeRight - eyeLeft
  const patch = [
    underEye, mix(underEye, lateral, .55), mix(lateral, medial, .16),
    mix(lowerLateral, lowerMedial, .12), mix(jawRear, lowerMedial, .15), bottom,
    mix(bottom, lowerMedial, .52), lowerMedial, medial,
  ]
  if (bottom.y - underEye.y < .03) return []
  return skinRowCounts.flatMap((count, row) => {
    const y = row === 0 ? eyeBottom.y + (bottom.y - eyeBottom.y) * .065
      : underEye.y + (bottom.y - underEye.y) * (.05 + row * .14)
    const bounds = row === 0 ? [
      eyeLeft - (guide.facing === 'right' ? eyeWidth * .55 : 0),
      eyeRight + (guide.facing === 'left' ? eyeWidth * .55 : 0),
    ] : rowBounds(patch, y)
    if (!bounds) return []
    const skin = visibleSkin?.length ? rowBounds(visibleSkin, y) : null
    const left = Math.max(bounds[0], skin?.[0] ?? 0)
    const right = Math.min(bounds[1], skin?.[1] ?? 1)
    if (right - left < .012) return []
    const [start, end] = guide.facing === 'right' ? [right, left] : [left, right]
    return Array.from({ length: count }, (_, col) => ({
      x: start + (end - start) * ((col + (row % 2 ? .62 : .38)) / count * .84 + .08), y,
    }))
  })
}

function detectedSideGuides(
  image: { width: number; height: number; src: string },
  landmarks: FaceLandmarksPayload | null,
  silhouette: ProfileSilhouette | null,
): SideGuides {
  const { width, height } = image
  const measured = landmarks && landmarks.source !== 'demo-static' ? { ...landmarks, source: landmarks.source } : null
  const side = measured ? visibleProfileSide(measured, silhouette?.facing) : 'right'
  const normalize = ({ x, y }: Point) => ({ x: x / width, y: y / height })
  const geometry = (feature: ProfileStudy['feature']) => {
    if (!measured) return
    try {
      return profileGeometry({
        id: 'profile', name: 'Side photo', dataUrl: image.src, width, height, landmarks: measured, status: 'ready',
      }, { view: 'profile', side, feature })
    } catch { return }
  }
  const contour = (feature: ProfileStudy['feature']) => geometry(feature)?.contour.map(normalize)
  const anchors = measured?.anchors
  const contours = measured?.contours
  const outline = silhouette?.outline
  const photographed = silhouette?.features
  const jaw = geometry('angle')
  const angle = jaw?.angle
  return {
    outline,
    facing: silhouette?.facing ?? (anchors?.noseTip && anchors.noseBridge && anchors.noseTip.x > anchors.noseBridge.x ? 'right' : 'left'),
    eye: contours?.[`${side}Eye`] ?? photographed?.eye,
    brow: contours?.[`${side}Brow`] ?? photographed?.brow,
    nose: (silhouette ? segmentedProfileNose(silhouette)?.contour : undefined) ?? contour('nose'),
    lips: (measured ? visibleLips(measured, side, outline) : undefined) ?? photographed?.lips,
    jaw: (measured ? jawSides(measured)[side === 'left' ? 0 : 1] : undefined)
      ?? jaw?.contour.map(normalize) ?? photographed?.jaw ?? (outline && outline.slice(Math.floor(outline.length * .72))),
    cheek: (measured ? cheekArches(measured, false, [side])[0] : undefined) ?? photographed?.cheek,
    lowerCheek: (measured ? cheekArches(measured, true, [side])[0] : undefined) ?? photographed?.lowerCheek,
    hair: silhouette?.hair,
    levels: [anchors?.forehead, anchors?.noseBridge, contours?.noseBase?.[3], anchors?.chin]
      .filter((point): point is Point => Boolean(point)),
    jawAngle: angle && { from: normalize(angle.from), vertex: normalize(angle.vertex), to: normalize(angle.to) },
  }
}

export function getSideReportOverlay(
  category: string,
  image: { src: string; width: number; height: number },
  landmarks: FaceLandmarksPayload | null,
  silhouette: ProfileSilhouette | null,
  source: string,
): OverlayPreset | null {
  const guide: SideGuides = source === sampleProfilePhoto ? { ...sampleProfileGuides, facing: 'left' } : detectedSideGuides(image, landmarks, silhouette)
  const primitives: OverlayPrimitive[] = []
  const refs = (points: Point[]) => points.map(point => ({ point }))
  const trace = (id: string, points: Point[] | undefined, pattern: 'solid' | 'dashed' | 'dotted', closed = false) => {
    if (!points || points.length < (closed ? 3 : 2)) return
    primitives.push({
      id, kind: 'polyline', points: refs(points), closed, dashed: pattern === 'dashed', dotted: pattern === 'dotted',
      strokeWidth: pattern === 'solid' ? 1.05 : .85, opacity: pattern === 'dashed' ? .62 : .9,
      animation: { delay: primitives.length * 65, duration: 660, entrance: 'draw' },
    })
  }
  const shade = (id: string, points?: Point[]) => {
    if (!points || points.length < 3) return
    primitives.push({
      id, kind: 'region', points: refs(points), fillOpacity: .13, strokeWidth: .55, opacity: .44,
      animation: { duration: 440 },
    })
  }
  const jawAngle = () => {
    if (!guide.jawAngle) return
    const pixel = ({ x, y }: Point) => ({ x: x * image.width, y: y * image.height })
    const { from, vertex, to } = guide.jawAngle
    const paths = anglePaths({ from: pixel(from), vertex: pixel(vertex), to: pixel(to), degrees: 0 })
    const [upper, lower, arc] = paths.map(path => path.map(({ x, y }) => ({ x: x / image.width, y: y / image.height })))
    trace('jaw-axis-upper', upper, 'dashed')
    trace('jaw-axis-lower', lower, 'dashed')
    trace('jaw-angle', arc, 'solid')
  }

  switch (category) {
    case 'eyes':
      trace('eyelid', guide.eye, 'dotted', true)
      break
    case 'brows':
      shade('brow-area', guide.brow)
      trace('brow-outline', guide.brow, 'dotted', true)
      break
    case 'nose':
      trace('nasal-profile', guide.nose, 'dotted')
      if (guide.nose) trace('nasal-reference', [guide.nose[0], guide.nose.at(-1)!], 'dashed')
      break
    case 'mouth':
    case 'lips':
      shade('lip-area', guide.lips)
      trace('lip-contour', guide.lips, 'dotted', true)
      break
    case 'jaw':
      trace('mandible', guide.jaw, 'dotted')
      jawAngle()
      break
    case 'cheeks':
      if (guide.cheek && guide.lowerCheek) shade('cheek-area', [...guide.cheek, ...guide.lowerCheek.toReversed()])
      trace('cheek-ridge', guide.cheek, 'dotted')
      trace('under-cheek', guide.lowerCheek, 'dotted')
      break
    case 'hair':
      trace('hair-contour', guide.hair, 'dotted', true)
      break
    case 'ears':
      shade('ear-area', guide.ear)
      trace('ear-contour', guide.ear, 'dotted', true)
      break
    case 'skin':
      profileSkinDots(guide, silhouette?.skin).forEach((point, index) => primitives.push({
        id: `skin-dot-${index}`, kind: 'point', at: { point }, radius: 2.65,
        animation: { delay: 85 + index * skinDotStaggerMs, duration: 185, entrance: 'scale' },
      }))
      break
    case 'face':
    case 'face-shape':
      trace('profile-outline', guide.outline, 'dotted')
      trace('jaw-boundary', guide.jaw, 'dotted')
      break
    case 'proportions':
      trace('profile-outline', guide.outline, 'dotted')
      if (guide.levels?.length === 4) {
        const levels = guide.levels
        const left = guide.facing === 'left'
        const xs = levels.map(point => point.x)
        const axis = left ? Math.max(0, Math.min(...xs) - .015) : Math.min(1, Math.max(...xs) + .015)
        trace('vertical-reference', [{ x: axis, y: levels[0].y }, { x: axis, y: levels[3].y }], 'dashed')
        levels.forEach((point, index) => trace(`profile-level-${index}`, [point, { x: axis, y: point.y }], 'dashed'))
      }
      break
    case 'symmetry':
      break
    default:
      trace('profile-outline', guide.outline, 'dotted')
      trace('nasal-profile', guide.nose, 'dotted')
      trace('mandible', guide.jaw, 'dotted')
      trace('cheek-ridge', guide.cheek, 'dashed')
  }
  return primitives.length ? { id: `side-report-${category}`, footer: '[ PROFILE ]', primitives } : null
}
