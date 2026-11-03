import { reportPortraitProjection } from './report-portrait'
import { visibleFaceSides, facialDetailGuides, jawOutline, cheekArches } from './facial-detail-guides'
import registry from '@/lib/analysis-v2/rubric-registry.json'
import type { FaceLandmarksPayload, FaceAnchorKey, FaceContourKey, NormalizedPoint } from './mobile-overlay-engine/landmarks'
import type { ReportOverlay } from './report-overlay'
import { projectImagePoint } from './mobile-overlay-engine/layout'

type Point = NormalizedPoint
type Path = Point[]
type Guide = { match: RegExp; paths: (face: FaceLandmarksPayload) => Path[] }
const valid = (point: Point | undefined): point is Point => Boolean(point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
const line = (from?: Point, to?: Point): Path[] => valid(from) && valid(to) ? [[from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, to]] : []
const anchors = (...pairs: Array<[FaceAnchorKey, FaceAnchorKey]>) => (face: FaceLandmarksPayload) => pairs.flatMap(([from, to]) => line(face.anchors[from], face.anchors[to]))
// Preserve detector topology. Never close an open brow or bridge a broken path.
export const faceContourPaths = (face: FaceLandmarksPayload, key: FaceContourKey): Path[] => {
  const side=key.startsWith('left')?'left':key.startsWith('right')?'right':undefined
  if(side&&!visibleFaceSides(face).includes(side))return []
  const points=face.contours?.[key]
  if (!points || points.length<3 || !points.every(valid)) return []
  const ratio=face.image.height/face.image.width
  const span=face.anchors.leftPupil && face.anchors.rightPupil ? Math.hypot(face.anchors.leftPupil.x-face.anchors.rightPupil.x,(face.anchors.leftPupil.y-face.anchors.rightPupil.y)*ratio) : .2
  if (points.slice(1).some((p,i)=>Math.hypot(p.x-points[i].x,(p.y-points[i].y)*ratio)>span*1.5)) return []
  const brow=key==='leftBrow'||key==='rightBrow'
  const gap=Math.hypot(points[0].x-points.at(-1)!.x,(points[0].y-points.at(-1)!.y)*ratio)
  return [brow&&points.length>=6&&gap>0&&gap<span*.25?[...points,points[0]]:points]
}
export function faceContourEdge(face: FaceLandmarksPayload,key: FaceContourKey,upper: boolean): Path[] {
  const points=faceContourPaths(face,key)[0],a=face.anchors.leftPupil,b=face.anchors.rightPupil
  if (!points || !a || !b) return []
  if ((key==='leftBrow' || key==='rightBrow') && points.length<=5) return upper?[points]:[]
  const ratio=face.image.height/face.image.width,angle=Math.atan2((b.y-a.y)*ratio,b.x-a.x)
  const local=(p:Point)=>({x:p.x*Math.cos(angle)+p.y*ratio*Math.sin(angle),y:-p.x*Math.sin(angle)+p.y*ratio*Math.cos(angle)})
  const closed=points.length>3&&points[0].x===points.at(-1)!.x&&points[0].y===points.at(-1)!.y
  if(!closed)return upper?[points]:[]
  const ring=points.slice(0,-1),mapped=ring.map(local)
  const left=mapped.reduce((best,p,i)=>p.x<mapped[best].x?i:best,0),right=mapped.reduce((best,p,i)=>p.x>mapped[best].x?i:best,0)
  const walk=(direction:number)=>{const path:Point[]=[];for(let i=left;path.length<=ring.length;i=(i+direction+ring.length)%ring.length){path.push(ring[i]);if(i===right)break}return path}
  const paths=[walk(1),walk(-1)],mean=(path:Point[])=>path.reduce((sum,p)=>sum+local(p).y,0)/path.length
  paths.sort((a,b)=>mean(a)-mean(b))
  return paths[upper?0:1].length>=3?[paths[upper?0:1]]:[]
}
const outlines = (...keys: FaceContourKey[]) => (face: FaceLandmarksPayload) => keys.flatMap(key=>faceContourPaths(face,key))
function extent(face: FaceLandmarksPayload, key: FaceContourKey, axis: 'x' | 'y') {
  const points = faceContourPaths(face, key)[0]
  if (!points) return []
  const first = points.reduce((best, point) => point[axis] < best[axis] ? point : best)
  const last = points.reduce((best, point) => point[axis] > best[axis] ? point : best)
  return first === last ? [] : line(first, last)
}
const extents = (axis: 'x' | 'y', ...keys: FaceContourKey[]) => (face: FaceLandmarksPayload) => keys.flatMap(key => extent(face, key, axis))
const lid = (upper: boolean, ...keys: FaceContourKey[]) => (face: FaceLandmarksPayload) => keys.flatMap(key=>faceContourEdge(face,key,upper))
const both = (...draws: Guide['paths'][]) => (face: FaceLandmarksPayload) => draws.flatMap(draw => draw(face))
const tilt = (face: FaceLandmarksPayload) => (['left', 'right'] as const).flatMap(side => {
  const inner = face.anchors[`${side}EyeInner`], outer = face.anchors[`${side}EyeOuter`]
  return inner && outer ? [[inner, outer, { x: outer.x, y: inner.y }, inner]] : []
})
const centerLine = (face: FaceLandmarksPayload) => anchors(['forehead', 'chin'])(face)
const definitions: Record<string, Guide> = {
  ...Object.fromEntries(facialDetailGuides.map(guide => [guide.id, guide])),
  'eyes.spacing': { match: /pupil.*(?:spacing|distance)|eye spacing/i, paths: both(anchors(['leftPupil', 'rightPupil']), anchors(['leftCheek', 'rightCheek'])) },
  'eyes.inner-gap': { match: /inner.eye|intercanthal|eye gap/i, paths: both(anchors(['leftEyeInner', 'rightEyeInner']), extents('x', 'leftEye', 'rightEye')) },
  'eyes.aspect': { match: /eye.*(?:aspect|width.*height)|aspect ratio/i, paths: both(extents('x', 'leftEye', 'rightEye'), extents('y', 'leftEye', 'rightEye')) },
  'eyes.canthal-tilt': { match: /canthal|eye tilt/i, paths: tilt },
  'eyes.opening': { match: /eye opening|eye aperture/i, paths: extents('y', 'leftEye', 'rightEye') },
  'eyes.shape': { match: /eye shape/i, paths: outlines('leftEye', 'rightEye') },
  'eyes.upper-lid': { match: /upper.?lid|eyelids?/i, paths: lid(true, 'leftEye', 'rightEye') },
  'eyes.lower-sclera': { match: /lower.?lid|sclera/i, paths: lid(false, 'leftEye', 'rightEye') },
  'brows.eye-distance': { match: /brow.*(?:distance|spacing|separation|gap)|brow.to.eye/i, paths: anchors(['leftBrow', 'leftPupil'], ['rightBrow', 'rightPupil']) },
  'brows.length': { match: /brow length/i, paths: both(extents('x', 'leftBrow', 'rightBrow'), extents('x', 'leftEye', 'rightEye')) },
  'brows.thickness': { match: /brow thickness/i, paths: extents('y', 'leftBrow', 'rightBrow') },
  'brows.arch': { match: /brow arch|brow contour/i, paths: outlines('leftBrow', 'rightBrow') },
  'brows.tail': { match: /brow tail/i, paths: face => outlines('leftBrow', 'rightBrow')(face).map(points => points.filter(point => point.x < .5 ? point.x <= (face.anchors.leftBrow?.x ?? 0) : point.x >= (face.anchors.rightBrow?.x ?? 1))).filter(points => points.length >= 3) },
  'nose.width': { match: /nose width|nasal width|alar width/i, paths: extents('x', 'noseBase') },
  'nose.eye-gap-ratio': { match: /nose.*(?:eye gap|inner.eye)|nose.eye/i, paths: both(extents('x', 'noseBase'), anchors(['leftEyeInner', 'rightEyeInner'])) },
  'nose.length': { match: /nose length|nasal length/i, paths: anchors(['noseBridge', 'noseTip']) },
  'nose.bridge-width': { match: /bridge width/i, paths: both(extents('x', 'noseBridge'), extents('x', 'noseBase')) },
  'nose.bridge': { match: /nasal bridge|nose bridge/i, paths: outlines('noseBridge') },
  'nose.nostril-visibility': { match: /nostril/i, paths: outlines('noseBase') },
  'mouth.width': { match: /mouth width|lip width/i, paths: both(anchors(['mouthLeft', 'mouthRight']), extents('x', 'noseBase')) },
  'mouth.lip-ratio': { match: /lip ratio|upper and lower lips|lip proportions/i, paths: anchors(['upperLip', 'mouthCenter'], ['mouthCenter', 'lowerLip']) },
  'mouth.pupil-ratio': { match: /mouth.*pupil|mouth.eye|mouth.*eye.*ratio/i, paths: anchors(['mouthLeft', 'mouthRight'], ['leftPupil', 'rightPupil']) },
  'mouth.fullness': { match: /(?:full(?:er)?|thin(?:ner)?|plump(?:er)?) lips?|lip fullness|lip height/i, paths: both(anchors(['upperLip', 'lowerLip']), outlines('mouth')) },
  'mouth.cupid-bow': { match: /cupid|upper lip/i, paths: lid(true, 'mouth') },
  'mouth.contour': { match: /lip contour|mouth outline|lip outline/i, paths: outlines('mouth') },
  'jaw.width': { match: /jaw.*(?:width|broad)|lower frame width/i, paths: anchors(['jawLeft', 'jawRight'], ['leftCheek', 'rightCheek']) },
  'jaw.height': { match: /chin height|lower.face height/i, paths: anchors(['lowerLip', 'chin']) },
  'jaw.chin-shape': { match: /chin shape|chin contour|chin taper/i, paths: face => {
    const chin = face.anchors.chin
    const jaw = faceContourPaths(face, 'jawline')[0]
    if (!valid(chin) || !jaw || jaw.length < 5) return []
    const ratio = face.image.height / face.image.width
    const distance = (p: Point) => Math.hypot(p.x - chin.x, (p.y - chin.y) * ratio)
    const center = jaw.reduce((best, point, i) => distance(point) < distance(jaw[best]) ? i : best, 0)
    const reach = Math.max(1, Math.round(jaw.length * .11))
    return [jaw.slice(Math.max(0, center - reach), center + reach + 1)]
  } },
  'jaw.jaw-shape': { match: /jaw contour|jaw shape|jawline|jaw outline/i, paths: jawOutline },
  'cheeks.width': { match: /cheek(?:bone)?s?.*(?:width|wide|broad)|upper (?:frame )?width/i, paths: anchors(['leftCheek', 'rightCheek'], ['leftEyeOuter', 'rightEyeOuter']) },
  'cheeks.height': { match: /cheek.*height|cheek.*position/i, paths: anchors(['leftEyeOuter', 'leftCheek'], ['rightEyeOuter', 'rightCheek']) },
  'cheeks.midface': { match: /midface|mid.face/i, paths: both(anchors(['noseBridge', 'mouthCenter']), anchors(['leftCheek', 'rightCheek'])) },
  'cheeks.contour': { match: /cheek contour|cheek surfaces?|cheek outline/i, paths: cheekArches },
  'face.taper': { match: /face taper|lower.face taper|frame.*narrows/i, paths: anchors(['chin', 'noseTip']) },
  'face.shape': { match: /face shape|face outline|face frame/i, paths: face => {
    const {noseTip,leftCheek,rightCheek}=face.anchors
    if (!noseTip || !leftCheek || !rightCheek) return []
    const left=Math.abs(noseTip.x-leftCheek.x),right=Math.abs(noseTip.x-rightCheek.x)
    // A projected oval crosses the nose on turned faces. Show the observed lower frame instead.
    return Math.max(left,right)>Math.min(left,right)*1.65 ? jawOutline(face) : faceContourPaths(face,'faceOutline')
  } },
  'proportions.vertical-alignment': { match: /vertical alignment|facial midline/i, paths: anchors(['noseBridge', 'noseTip'], ['noseTip', 'mouthCenter'], ['mouthCenter', 'chin']) },
  'proportions.width-hierarchy': { match: /width hierarchy|width relationships/i, paths: anchors(['leftCheek', 'rightCheek'], ['jawLeft', 'jawRight'], ['mouthLeft', 'mouthRight']) },
  'proportions.eye-mouth-height': { match: /eye.*mouth.*height|eye.to.mouth/i, paths: anchors(['leftPupil', 'mouthLeft'], ['rightPupil', 'mouthRight'], ['mouthCenter', 'chin']) },
  'symmetry.eyes-height': { match: /eye.*height.*symmetr|eye alignment|eye level/i, paths: anchors(['leftEyeOuter', 'rightEyeOuter'], ['leftEyeInner', 'rightEyeInner']) },
  'symmetry.brows-height': { match: /brow.*symmetr|brow alignment|brow level/i, paths: anchors(['leftBrow', 'rightBrow']) },
  'symmetry.nose-axis': { match: /nose axis|nose alignment/i, paths: both(centerLine, anchors(['noseBridge', 'noseTip'])) },
  'symmetry.mouth-height': { match: /mouth symmetry|mouth alignment|mouth corner/i, paths: anchors(['mouthLeft', 'mouthRight']) },
  'symmetry.chin-axis': { match: /chin axis|chin alignment/i, paths: both(centerLine, anchors(['mouthCenter', 'chin'])) },
}
export const faceMetricGuides = [...registry.categories.flatMap(category => category.rubrics.filter(metric => definitions[metric.id]).map(metric => ({
  id: metric.id, category: category.id === 'face' ? 'face-shape' : category.id, label: metric.name,
  detail: `Show ${metric.name.toLowerCase()} with guides registered to the photographed feature.`,
}))), ...facialDetailGuides ]
export const faceMetricAreas = registry.categories.filter(category => faceMetricGuides.some(metric => metric.category === (category.id === 'face' ? 'face-shape' : category.id))).map(category => ({ id: category.id === 'face' ? 'face-shape' : category.id, label: category.title }))
export function narratedFaceMetric(text: string, category?: string) {
  return faceMetricGuides.filter(metric => (!category || metric.category === category) && definitions[metric.id].match.test(text))
    .sort((a, b) => (text.match(definitions[b.id].match)?.[0].length ?? 0) - (text.match(definitions[a.id].match)?.[0].length ?? 0))[0]
}
export function metricFaceOverlay(base: ReportOverlay, source: { width: number; height: number; landmarks?: FaceLandmarksPayload | null }, metricId: string): ReportOverlay {
  const face = source.landmarks, definition = definitions[metricId]
  const empty = { ...base, primitives: [], dots: [], measurement: undefined }
  if (!face || face.confidence < .58 || !definition) return empty
  const transform = reportPortraitProjection(source, base.size, base.portraitCrop)
  const primitives = definition.paths(face).filter(points => points.length >= 2 && points.every(valid)).map((points, index) => ({
    id: `metric-${metricId}-${index}`, kind: 'polyline' as const, points: [], closed: false,
    pixelPoints: points.map(point => projectImagePoint(point, source, transform)),
  }))
  return { ...empty, primitives }
}
