import type { FaceLandmarksPayload, NormalizedPoint as Point } from '@/lib/analysis/landmarks'
type FaceGeometry = Pick<FaceLandmarksPayload,'anchors'|'contours'|'confidence'|'quality'|'image'>
import type { PortraitWarp } from './video-portrait-effects'

export function measuredProportionWarp(face: FaceGeometry, kind: 'thirds' | 'width', amount: number): PortraitWarp | undefined {
  const a=face.anchors,{leftPupil:left,rightPupil:right,chin}=a, nose=face.contours?.noseBase?.[3]
  if (face.confidence<.75 || Math.abs(face.quality?.yawRadians??0)>.3 || !left || !right || !chin || !nose || !a.leftBrow || !a.rightBrow) return
  const ratio=face.image.height/face.image.width,dx=right.x-left.x,dy=(right.y-left.y)*ratio,span=Math.hypot(dx,dy)
  if (span<.03 || !Number.isFinite(amount)) return
  const u={x:dx/span,y:dy/span/ratio},v={x:-dy/span,y:dx/span/ratio}
  const clamp=(value:number)=>Math.max(-span*.02,Math.min(span*.02,value))*Math.max(-1,Math.min(1,amount))
  const brow={x:(a.leftBrow.x+a.rightBrow.x)/2,y:(a.leftBrow.y+a.rightBrow.y)/2}
  const vertical=(p:Point,q:Point)=>(q.x-p.x)*(-dy/span)+(q.y-p.y)*ratio*(dx/span)
  if (kind==='thirds') {
    const mid=vertical(brow,nose),lower=vertical(nose,chin)
    if (mid<=0 || lower<=0) return
    // Demonstrate movement towards this photograph's middle division, never an ideal score.
    const delta=clamp((mid-lower)*.18)
    return {mode:'drag',axis:'both',regions:[{x:chin.x,y:chin.y,rx:span*.8,ry:span*.65/ratio}],strengths:[0],shifts:[{x:v.x*delta,y:v.y*delta}]}
  }
  if (!a.jawLeft || !a.jawRight || !a.leftCheek || !a.rightCheek) return
  const horizontal=(p:Point,q:Point)=>(q.x-p.x)*u.x+(q.y-p.y)*ratio*(dy/span)
  const jaw=horizontal(a.jawLeft,a.jawRight),cheeks=horizontal(a.leftCheek,a.rightCheek)
  if (jaw<=0 || cheeks<=0) return
  const delta=clamp((cheeks-jaw)*.06)
  return {mode:'drag',axis:'both',regions:[a.jawLeft,a.jawRight].map(p=>({x:p.x,y:p.y,rx:span*.55,ry:span*.6/ratio})),strengths:[0,0],shifts:[{x:-u.x*delta,y:-u.y*delta},{x:u.x*delta,y:u.y*delta}]}
}

export type Freckle = {x:number;y:number;rx:number;ry:number;opacity:number;rotation:number}
export function naturalFreckleField(face: FaceGeometry): Freckle[] {
  const {leftPupil:left,rightPupil:right,noseTip:nose}=face.anchors
  if(face.confidence<.75 || !left || !right || !nose || Math.abs(face.quality?.yawRadians??0)>.4) return []
  const ratio=face.image.height/face.image.width,dx=right.x-left.x,dy=(right.y-left.y)*ratio,span=Math.hypot(dx,dy)
  if(span<.03) return []
  let seed=Math.round((nose.x+left.y+right.x)*1e7)>>>0
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const dots:Freckle[]=[]
  for(let i=0;i<190;i++){
    // Nonuniform clusters bridge the nose and upper cheeks; no eye, lip or hair pixels.
    const side=random()<.5?-1:1,x=side*(.1+random()*.67),y=.18+random()*.3
    const density=Math.exp(-(((y-.31)/.16)**2))*(1-Math.abs(x)*.35)
    if(random()>density*.77)continue
    const radius=span*(.0028+random()**2*.007)
    const center={x:(left.x+right.x)/2+dx*x-dy*y,y:(left.y+right.y)/2+(dy*x+dx*y)/ratio}
    if(center.x<0 || center.x>1 || center.y<0 || center.y>1)continue
    dots.push({...center,rx:radius,ry:radius*(.65+random()*.7)/ratio,opacity:.09+random()*.22,rotation:random()*Math.PI})
  }
  return dots
}
const textures=new WeakMap<object,HTMLCanvasElement>()
export function drawNaturalFreckles(ctx: CanvasRenderingContext2D,image: HTMLCanvasElement|HTMLImageElement,face:FaceGeometry,amount:number) {
  if(!amount)return
  let texture=textures.get(image)
  if(!texture){
    texture=document.createElement('canvas');texture.width=image.width;texture.height=image.height
    const brush=texture.getContext('2d')
    if(!brush)return
    for(const dot of naturalFreckleField(face)){
      brush.save();brush.translate(dot.x*image.width,dot.y*image.height);brush.rotate(dot.rotation)
      const rx=dot.rx*image.width,ry=dot.ry*image.height
      brush.scale(rx,ry)
      const color=brush.createRadialGradient(0,0,0,0,0,1)
      color.addColorStop(0,`rgba(106,65,38,${dot.opacity})`);color.addColorStop(.6,`rgba(119,76,45,${dot.opacity*.8})`);color.addColorStop(1,'rgba(119,76,45,0)')
      brush.fillStyle=color;brush.beginPath();brush.arc(0,0,1,0,Math.PI*2);brush.fill();brush.restore()
    }
    textures.set(image,texture)
  }
  ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha*=Math.min(1,Math.max(0,amount));ctx.drawImage(texture,0,0);ctx.restore()
}
