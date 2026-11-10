import type { FaceLandmarksPayload, NormalizedPoint as Point } from './mobile-overlay-engine/landmarks'

type Path = Point[]
export type DetailGuide = { id: string; category: string; label: string; detail: string; match: RegExp; stroke: 'dotted' | 'dashed' | 'solid'; paths: (face: FaceLandmarksPayload) => Path[] }
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const curve = (a: Point, b: Point, c: Point): Path => Array.from({ length: 25 }, (_, i) => mix(mix(a,b,i/24),mix(b,c,i/24),i/24))
function frame(face: FaceLandmarksPayload) {
  const { leftPupil: left, rightPupil: right } = face.anchors
  if (!left || !right) return
  const ratio = face.image.height / face.image.width
  const dx = right.x-left.x, dy = (right.y-left.y)*ratio, span = Math.hypot(dx,dy)
  if (span < .025 || Math.abs(face.quality?.yawRadians ?? 0) > .5) return
  const u = { x: dx/span, y: dy/span/ratio }, v = { x: -dy/span, y: dx/span/ratio }
  return { span, move: (p: Point, x: number, y: number): Point => ({ x:p.x+span*(u.x*x+v.x*y), y:p.y+span*(u.y*x+v.y*y) }) }
}
export function visibleFaceSides(face:FaceLandmarksPayload):Array<'left'|'right'> {
  const {noseTip,leftCheek,rightCheek}=face.anchors
  if(Math.abs(face.quality?.yawRadians??0)<.55||!noseTip||!leftCheek||!rightCheek)return ['left','right']
  const ratio=face.image.height/face.image.width,distance=(p:Point)=>Math.hypot(p.x-noseTip.x,(p.y-noseTip.y)*ratio)
  return [distance(leftCheek)>distance(rightCheek)?'left':'right']
}
export function jawOutline(face:FaceLandmarksPayload):Path[] {
  const sides=visibleFaceSides(face)
  if(sides.length===2)return face.contours?.jawline?.length?[face.contours.jawline]:[]
  const path=jawSides(face)[sides[0]==='left'?0:1]
  return path?[path]:[]
}
const visibleJawSides=(face:FaceLandmarksPayload)=>visibleFaceSides(face).flatMap(side=>{const path=jawSides(face)[side==='left'?0:1];return path?[path]:[]})
export function jawSides(face: FaceLandmarksPayload): Path[] {
  const jaw=face.contours?.jawline,chin=face.anchors.chin
  if(!jaw||jaw.length<5||!chin||!jaw.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return []
  const ratio=face.image.height/face.image.width
  const middle=jaw.reduce((best,p,i)=>Math.hypot(p.x-chin.x,(p.y-chin.y)*ratio)<Math.hypot(jaw[best].x-chin.x,(jaw[best].y-chin.y)*ratio)?i:best,0)
  if(middle===0||middle===jaw.length-1)return []
  const sides=[jaw.slice(0,middle+1),jaw.slice(middle).reverse()],left=face.anchors.leftCheek??face.anchors.jawLeft
  if(left)sides.sort((a,b)=>Math.hypot(a[0].x-left.x,(a[0].y-left.y)*ratio)-Math.hypot(b[0].x-left.x,(b[0].y-left.y)*ratio))
  return sides
}
export function jawCorner(face:FaceLandmarksPayload,side:'left'|'right') {
  const path=jawSides(face)[side==='left'?0:1],anchor=face.anchors[side==='left'?'jawLeft':'jawRight']
  if(!path||path.length<5||!anchor)return
  const ratio=face.image.height/face.image.width,distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,(a.y-b.y)*ratio)
  const nearest = path.reduce((best, p, i) => distance(p, anchor) < distance(path[best], anchor) ? i : best, 0)
  const reach = Math.max(.018, distance(path[0], path.at(-1)!) * .16)
  let best: { index: number; start: number; end: number; score: number } | undefined
  for (let index = Math.max(1, nearest - 2); index <= Math.min(path.length - 2, nearest + 2); index++) {
    const vertex = path[index]
    let start = index - 1, end = index + 1
    while (start > 0 && distance(path[start], vertex) < reach) start--
    while (end < path.length - 1 && distance(path[end], vertex) < reach) end++
    const before = distance(path[start], vertex), after = distance(path[end], vertex)
    if (Math.min(before, after) < reach * .55) continue
    const chord = distance(path[start], path[end])
    const cosine = (before ** 2 + after ** 2 - chord ** 2) / (2 * before * after)
    const score = cosine - distance(vertex, anchor) / reach * .55
    if (!best || score > best.score) best = { index, start, end, score }
  }
  if (!best) return
  const { index, start, end } = best
  return { from: path[start], vertex: path[index], to: path[end], arms: [path.slice(start, index + 1), path.slice(index, end + 1)] }
}
function eyeEdge(face: FaceLandmarksPayload, upper: boolean, offset: number): Path[] {
  const f = frame(face)
  if (!f) return []
  return (['leftEye','rightEye'] as const).flatMap(key => {
    const points = face.contours?.[key] ?? []
    if (points.length < 6) return []
    const side = key === 'leftEye' ? 'left' : 'right'
    const inner = face.anchors[side === 'left' ? 'leftEyeInner' : 'rightEyeInner']
    const outer = face.anchors[side === 'left' ? 'leftEyeOuter' : 'rightEyeOuter']
    if (!inner || !outer) return []
    const ratio = face.image.height / face.image.width
    const [start, end] = inner.x < outer.x ? [inner, outer] : [outer, inner]
    const dx = end.x - start.x, dy = (end.y - start.y) * ratio
    const span = Math.hypot(dx, dy)
    if (span < .01) return []
    const horizontal = (p: Point) => ((p.x - start.x) * dx + (p.y - start.y) * ratio * dy) / span
    const vertical = (p: Point) => (-(p.x - start.x) * dy + (p.y - start.y) * ratio * dx) / span
    const edge = points.filter(p => upper ? vertical(p) < 0 : vertical(p) > 0)
      .filter(p => horizontal(p) > 0 && horizontal(p) < span)
      .sort((a, b) => horizontal(a) - horizontal(b))
    if (edge.length < 2) return []
    const margin = span * offset * 2
    return [[start, ...edge.map(p => {
      const lift = margin * Math.sin(Math.PI * horizontal(p) / span)
      return { x: p.x - dy / span * lift, y: p.y + dx / span * lift / ratio }
    }), end]]
  })
}
function gonial(face: FaceLandmarksPayload): Path[] {
  return visibleFaceSides(face).flatMap(side=>{const corner=jawCorner(face,side);if(!corner)return [];const {from,vertex,to}=corner;return [...corner.arms,curve(mix(vertex,from,.35),mix(from,to,.25),mix(vertex,to,.35))]})
}
function cheekPath(face: FaceLandmarksPayload, side: 'left' | 'right', under: boolean): Path {
  const contours = face.contours
  const split = contours?.[`${side}${under ? 'Submalar' : 'Cheekbone'}`]
  const legacy = contours?.cheekbones
  // The legacy mesh stores both cheeks in one chain. Only read the known ends.
  const path = split?.length ? split : !under && legacy?.length === 54
    ? side === 'left' ? legacy.slice(0, 5) : legacy.slice(-4).reverse()
    : []
  return path.length >= 3 && path.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? path : []
}

export function cheekArches(face: FaceLandmarksPayload, under = false): Path[] {
  return visibleFaceSides(face).map(side => cheekPath(face, side, under)).filter(path => path.length)
}

export function cheekboneRegions(face: FaceLandmarksPayload) {
  return visibleFaceSides(face).flatMap(side => {
    const ridge = cheekPath(face, side, false), lower = cheekPath(face, side, true)
    if (!ridge.length || !lower.length) return []
    return [{ id: `${side}-cheek`, points: [...ridge, ...lower.toReversed()] }]
  })
}

const underCheekArches = (face: FaceLandmarksPayload) => cheekArches(face, true)
function cheekFrames(face: FaceLandmarksPayload): Path[] {
  const ratio = face.image.height / face.image.width
  return cheekArches(face).flatMap(path => {
    const start = path[0], end = path.at(-1)!
    const dx = end.x - start.x, dy = (end.y - start.y) * ratio
    const length = Math.hypot(dx, dy)
    if (length < .01) return [path]
    const offset = { x: -dy * .08, y: dx * .08 / ratio }
    return [path, ...[start, end].map(p => [
      { x: p.x - offset.x, y: p.y - offset.y },
      { x: p.x + offset.x, y: p.y + offset.y },
    ])]
  })
}
function smileLines(face: FaceLandmarksPayload): Path[] {
  const f=frame(face),base=face.contours?.noseBase
  if (!f || !base || base.length<5) return []
  return ([-1,1] as const).flatMap(side=>{
    const mouth=side<0?face.anchors.mouthLeft:face.anchors.mouthRight
    if (!mouth) return []
    const nose=base[side<0?0:base.length-1]
    return [curve(f.move(nose,side*.035,.02),f.move(mix(nose,mouth,.55),side*.12,0),f.move(mouth,side*.09,.09))]
  })
}
function mouthCreases(face: FaceLandmarksPayload): Path[] {
  const f=frame(face)
  if (!f) return []
  return ([-1,1] as const).flatMap(side=>{
    const p=side<0?face.anchors.mouthLeft:face.anchors.mouthRight
    return p?[curve(f.move(p,side*.015,0),f.move(p,side*.07,.035),f.move(p,side*.055,.1))]:[]
  })
}
function thirds(face: FaceLandmarksPayload): Path[] {
  const { leftBrow,rightBrow,chin }=face.anchors, base=face.contours?.noseBase, f=frame(face)
  if (!f || !leftBrow || !rightBrow || !chin || !base?.[3]) return []
  const brow=mix(leftBrow,rightBrow,.5),nose=base[3]
  return [brow,nose,chin].map(p=>[f.move(p,-.73,0),p,f.move(p,.73,0)]).concat([[f.move(brow,.8,0),f.move(nose,.8,0),f.move(chin,.8,0)]])
}
export const facialDetailGuides: DetailGuide[] = [
  { id:'detail.jaw-frame',category:'jaw',label:'Jawline frame',detail:'Paired contour frames follow the visible jaw sides toward the detected chin.',match:/jaw(?:line)? fram/i,stroke:'solid',paths:visibleJawSides },
  { id:'detail.cheek-area',category:'cheeks',label:'Upper cheek area',detail:'Frames the visible cheek surface between the upper and lower mesh tracks.',match:/upper cheek area|cheekbone area/i,stroke:'solid',paths:face=>cheekboneRegions(face).map(({points})=>[...points,points[0]]) },
  { id:'detail.cheek-frame',category:'cheeks',label:'Cheekbone frame',detail:'Detected cheekbone arcs receive short framing caps at their ends.',match:/cheekbone fram/i,stroke:'solid',paths:cheekFrames },
  { id:'detail.under-cheekbones',category:'cheeks',label:'Under cheekbone',detail:'A guide below each detected cheekbone arc frames the under-cheekbone region without estimating tissue depth.',match:/under.?cheekbone|submalar/i,stroke:'dashed',paths:underCheekArches },
  { id:'detail.cheek-levels',category:'cheeks',label:'Cheekbone / lower contour',detail:'Paired upper and lower guides distinguish the cheekbone arc from the region below it.',match:/cheek.*(?:upper and lower|levels)/i,stroke:'dotted',paths:face=>[...cheekArches(face),...underCheekArches(face)] },
  { id:'detail.jaw-offset',category:'jaw',label:'Bilateral jaw trace',detail:'Two dotted traces follow the detected jaw sides without moving their coordinates.',match:/bilateral jaw|jaw(?:line)? trac\w*|jawline|jaw outline/i,stroke:'dotted',paths:visibleJawSides },
  { id:'detail.under-eyes',category:'eyes',label:'Under-eye contours',detail:'Fine paired curves follow the lower-eye region using the detected eye contours.',match:/eye bags?|under.eye|tear trough/i,stroke:'dotted',paths:face=>eyeEdge(face,false,.12) },
  { id:'detail.gonial',category:'jaw',label:'Jaw-angle outline',detail:'Short arms and a small arc highlight each visible jaw turn; this is a 2D guide.',match:/gonial|jaw angle|angle of the jaw/i,stroke:'solid',paths:gonial },
  { id:'detail.dimorphism',category:'face-shape',label:'Facial shape relationships',detail:'Compares brow, cheek and jaw contours without assigning a gender or an ideal face.',match:/dimorph\w*|masculin\w*|feminin\w*/i,stroke:'dashed',paths:face=>[...cheekArches(face),...jawSides(face),...(face.contours?.leftBrow?[face.contours.leftBrow]:[]),...(face.contours?.rightBrow?[face.contours.rightBrow]:[])] },
  { id:'detail.cheekbones',category:'cheeks',label:'Zygomatic arch map',detail:'Paired curves follow the detected upper-cheek landmarks from the outer face inward.',match:/zygomatic|cheekbone map|map.*cheekbones|cheekbone contour/i,stroke:'dotted',paths:cheekArches },
  { id:'detail.eye-creases',category:'eyes',label:'Eyelid crease guides',detail:'Light paired guides show the upper-lid fold region relative to the detected eyes.',match:/eye(?:lid)? creases?|lid folds?/i,stroke:'dashed',paths:face=>eyeEdge(face,true,-.08) },
  { id:'detail.mouth-creases',category:'mouth',label:'Mouth-corner creases',detail:'Small curved guides sit just outside the detected mouth corners.',match:/mouth creases?|lip creases?|mouth.corner creases?/i,stroke:'solid',paths:mouthCreases },
  { id:'detail.smile-lines',category:'mouth',label:'Smile-line guides',detail:'Landmark-based curves show the nasolabial region from the nose towards the mouth corners.',match:/smile lines?|nasolabial/i,stroke:'dotted',paths:smileLines },
  { id:'detail.facial-thirds',category:'proportions',label:'Facial division guides',detail:'Shows brow-to-nose and nose-to-chin divisions; a true upper third needs a verified hairline.',match:/facial thirds|face thirds|facial divisions|thirds.*dimensions/i,stroke:'dashed',paths:thirds },
]
