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
function jawSides(face: FaceLandmarksPayload): Path[] {
  const jaw = face.contours?.jawline, chin = face.anchors.chin
  if (!jaw || jaw.length < 5 || !chin || !face.anchors.leftCheek || !face.anchors.rightCheek) return []
  const middle = jaw.reduce((best,p,i) => Math.hypot(p.x-chin.x,p.y-chin.y)<Math.hypot(jaw[best].x-chin.x,jaw[best].y-chin.y)?i:best,0)
  if (middle===0 || middle===jaw.length-1) return []
  return [[face.anchors.leftCheek,...jaw.slice(0,middle+1)], [face.anchors.rightCheek,...jaw.slice(middle).reverse()]]
}
function offsetJaw(face: FaceLandmarksPayload): Path[] {
  const f = frame(face)
  if (!f) return []
  // Both traces develop from the back towards one shared, slightly lower chin point.
  return jawSides(face).map((side,index) => side.map((p,i) => f.move(p,(index?1:-1)*.035*(1-i/(side.length-1)),.035)))
}
function eyeEdge(face: FaceLandmarksPayload, upper: boolean, offset: number): Path[] {
  const f = frame(face)
  if (!f) return []
  return (['leftEye','rightEye'] as const).flatMap(key => {
    const points = face.contours?.[key] ?? []
    if (points.length < 6) return []
    const mid = (Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2
    const edge = points.filter(p=>upper?p.y<=mid:p.y>=mid).sort((a,b)=>a.x-b.x)
    return edge.length>=3 ? [edge.map((p,i)=>f.move(p,0,offset*Math.sin(Math.PI*i/(edge.length-1))))] : []
  })
}
function gonial(face: FaceLandmarksPayload): Path[] {
  const f = frame(face), chin = face.anchors.chin
  if (!f || !chin) return []
  return (['left','right'] as const).flatMap(side => {
    const jaw = face.anchors[side==='left'?'jawLeft':'jawRight'], cheek = face.anchors[side==='left'?'leftCheek':'rightCheek']
    if (!jaw || !cheek) return []
    const arm = (to: Point) => { const dx=to.x-jaw.x,dy=(to.y-jaw.y)*face.image.height/face.image.width,length=Math.hypot(dx,dy); return length>.001?mix(jaw,to,Math.min(.45,f.span*.24/length)):undefined }
    const a=arm(cheek),b=arm(chin)
    return a&&b?[[jaw,a],[jaw,b],curve(mix(jaw,a,.5),mix(a,b,.35),mix(jaw,b,.5))]:[]
  })
}
function cheekArches(face: FaceLandmarksPayload): Path[] {
  const points = face.contours?.cheekbones ?? []
  // The detector stores the left and right zygomatic arcs at the ends of this contour.
  if (points.length < 14) return []
  return [points.slice(0,7),points.slice(-7).reverse()]
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
  { id:'detail.jaw-offset',category:'jaw',label:'Bilateral jaw trace',detail:'Two dotted traces develop from the back of the jaw and meet just outside the chin.',match:/bilateral jaw|jaw(?:line)? trac\w*|jawline|jaw outline/i,stroke:'dotted',paths:offsetJaw },
  { id:'detail.under-eyes',category:'eyes',label:'Under-eye contours',detail:'Fine paired curves follow the lower-eye region using the detected eye contours.',match:/eye bags?|under.eye|tear trough/i,stroke:'dotted',paths:face=>eyeEdge(face,false,.12) },
  { id:'detail.gonial',category:'jaw',label:'Jaw-angle outline',detail:'Short arms and a small arc highlight each visible jaw turn; this is a 2D guide.',match:/gonial|jaw angle|angle of the jaw/i,stroke:'solid',paths:gonial },
  { id:'detail.dimorphism',category:'face-shape',label:'Facial shape relationships',detail:'Compares brow, cheek and jaw contours without assigning a gender or an ideal face.',match:/dimorph\w*|masculin\w*|feminin\w*/i,stroke:'dashed',paths:face=>[...cheekArches(face),...jawSides(face),...(face.contours?.leftBrow?[face.contours.leftBrow]:[]),...(face.contours?.rightBrow?[face.contours.rightBrow]:[])] },
  { id:'detail.cheekbones',category:'cheeks',label:'Zygomatic arch map',detail:'Paired curves follow the detected upper-cheek landmarks from the outer face inward.',match:/zygomatic|cheekbone map|map.*cheekbones|cheekbone contour/i,stroke:'dotted',paths:cheekArches },
  { id:'detail.eye-creases',category:'eyes',label:'Eyelid crease guides',detail:'Light paired guides show the upper-lid fold region relative to the detected eyes.',match:/eye(?:lid)? creases?|lid folds?/i,stroke:'dashed',paths:face=>eyeEdge(face,true,-.08) },
  { id:'detail.mouth-creases',category:'mouth',label:'Mouth-corner creases',detail:'Small curved guides sit just outside the detected mouth corners.',match:/mouth creases?|lip creases?|mouth.corner creases?/i,stroke:'solid',paths:mouthCreases },
  { id:'detail.smile-lines',category:'mouth',label:'Smile-line guides',detail:'Landmark-based curves show the nasolabial region from the nose towards the mouth corners.',match:/smile lines?|nasolabial/i,stroke:'dotted',paths:smileLines },
  { id:'detail.facial-thirds',category:'proportions',label:'Facial division guides',detail:'Shows brow-to-nose and nose-to-chin divisions; a true upper third needs a verified hairline.',match:/facial thirds|face thirds|facial divisions|thirds.*dimensions/i,stroke:'dashed',paths:thirds },
]
