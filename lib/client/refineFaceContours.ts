import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'

type Point = {x:number;y:number}
type Pixels = {width:number;height:number;data:Uint8ClampedArray}
const quantile=(values:number[],fraction:number)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*fraction)]

// Fit the visible hair boundary inside a small detector-registered search band.
// The eye contour bounds that band, so eyelids cannot become an eyebrow.
export function refinePhotographedContours(face:FaceLandmarksPayload,pixels:Pixels):FaceLandmarksPayload {
  const {leftPupil,rightPupil}=face.anchors
  if(!leftPupil||!rightPupil||!face.contours)return face
  const toPixel=(p:NormalizedPoint)=>({x:p.x*pixels.width,y:p.y*pixels.height})
  const a=toPixel(leftPupil),b=toPixel(rightPupil),span=Math.hypot(b.x-a.x,b.y-a.y)
  if(span<30)return face
  const ux=(b.x-a.x)/span,uy=(b.y-a.y)/span
  const local=(p:NormalizedPoint)=>{const q=toPixel(p);return{x:q.x*ux+q.y*uy,y:-q.x*uy+q.y*ux}}
  const world=(p:Point)=>({x:(p.x*ux-p.y*uy)/pixels.width,y:(p.x*uy+p.y*ux)/pixels.height})
  const luminance=(x:number,y:number)=>{
    const px=Math.round(x*ux-y*uy),py=Math.round(x*uy+y*ux)
    if(px<0||py<0||px>=pixels.width||py>=pixels.height)return 255
    const i=(py*pixels.width+px)*4
    return pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722
  }
  const bounds=(path:Point[],x:number)=>{
    const hits:number[]=[]
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i]
      if((a.x<=x&&b.x>x)||(b.x<=x&&a.x>x))hits.push(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x))
    }
    return hits.length>=2?[Math.min(...hits),Math.max(...hits)]:undefined
  }
  const contours={...face.contours},anchors={...face.anchors}
  for(const side of ['left','right'] as const){
    const key=side==='left'?'leftBrow':'rightBrow',raw=contours[key]
    if(!raw||raw.length<8||raw[0].x!==raw.at(-1)!.x||raw[0].y!==raw.at(-1)!.y)continue
    const ring=raw.map(local),eye=(contours[side==='left'?'leftEye':'rightEye']??[]).map(local)
    const minX=Math.min(...ring.map(p=>p.x)),maxX=Math.max(...ring.map(p=>p.x)),width=maxX-minX
    const radius=Math.max(4,Math.min(24,span*.12)),step=Math.max(1.5,width/60)
    const skin:number[]=[],hair:number[]=[]
    for(let x=minX+step;x<maxX;x+=step){
      const edge=bounds(ring,x)
      if(!edge)continue
      skin.push(luminance(x,edge[0]-radius*.8),luminance(x,edge[1]+radius*.8))
      for(let y=edge[0];y<=edge[1];y+=2)hair.push(luminance(x,y))
    }
    if(skin.length<8||hair.length<8)continue
    const light=quantile(skin,.8),dark=quantile(hair,.2)
    if(light-dark<22)continue
    const threshold=dark+(light-dark)*.48,top:Point[]=[],bottom:Point[]=[]
    for(let x=minX-radius*.45;x<=maxX+radius*.45;x+=step){
      const edge=bounds(ring,Math.max(minX+.01,Math.min(maxX-.01,x)))
      if(!edge)continue
      const eyeEdge=bounds(eye,x),first=Math.floor(edge[0]-radius),last=Math.ceil(Math.min(edge[1]+radius,eyeEdge?eyeEdge[0]-2:Infinity))
      const runs:Array<{top:number;bottom:number}>=[]
      let start:number|undefined
      for(let y=first;y<=last+1;y++){
        const value=(luminance(x-1,y)+luminance(x,y)+luminance(x+1,y))/3
        if(y<=last&&value<threshold){start??=y;continue}
        if(start!==undefined&&y-start>=2)runs.push({top:start-.5,bottom:y-.5})
        start=undefined
      }
      const center=(edge[0]+edge[1])/2
      const score=(run:typeof runs[number])=>Math.abs((run.top+run.bottom)/2-center)-Math.min(edge[1]-edge[0],run.bottom-run.top)*.25
      const run=runs.toSorted((a,b)=>score(a)-score(b))[0]
      if(!run||Math.abs((run.top+run.bottom)/2-center)>radius||run.top<=first-.5||run.bottom>last-.5)continue
      top.push({x,y:run.top});bottom.push({x,y:run.bottom})
    }
    if(top.length<12||top.at(-1)!.x-top[0].x<width*.72)continue
    if(top.slice(1).some((p,i)=>p.x-top[i].x>Math.max(step*4,Math.min(radius,width*.12))))continue
    // A local median removes individual hair noise without reshaping the arch.
    const settle=(path:Point[])=>path.map((p,i)=>({...p,y:quantile(path.slice(Math.max(0,i-2),i+3).map(q=>q.y),.5)}))
    const upper=settle(top),lower=settle(bottom),outline=[...upper,...lower.reverse()].map(world)
    contours[key]=[...outline,outline[0]]
    if(anchors[key]) {const expected=local(anchors[key]!);anchors[key]=world(upper.reduce((best,p)=>Math.abs(p.x-expected.x)<Math.abs(best.x-expected.x)?p:best))}
  }
  const jaw=contours.jawline
  if(jaw&&jaw.length>=9){
    const sample=(x:number,y:number)=>{const px=Math.max(0,Math.min(pixels.width-1,Math.round(x))),py=Math.max(0,Math.min(pixels.height-1,Math.round(y))),i=(py*pixels.width+px)*4;return [pixels.data[i],pixels.data[i+1],pixels.data[i+2]]}
    const radius=Math.max(3,Math.min(8,span*.035))
    const offsets=jaw.map((p,i)=>{
      const a=toPixel(jaw[Math.max(0,i-1)]),b=toPixel(jaw[Math.min(jaw.length-1,i+1)]),q=toPixel(p),length=Math.hypot(b.x-a.x,b.y-a.y)
      if(length<1)return { point: q, nx: 0, ny: 0, shift: 0 }
      const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length
      let best=0,bestScore=20
      for(let d=-radius;d<=radius;d++){
        const inner=sample(q.x+nx*(d-2),q.y+ny*(d-2)),outer=sample(q.x+nx*(d+2),q.y+ny*(d+2))
        const contrast=Math.sqrt(inner.reduce((sum,v,c)=>sum+(v-outer[c])**2,0)/3),score=contrast-Math.abs(d)*2
        if(score>bestScore){best=d;bestScore=score}
      }
      return { point: q, nx, ny, shift: best }
    })
    const fitted = offsets.map(({ point, nx, ny, shift }, i) => {
      // An isolated texture edge should not pull a single jaw point off the silhouette.
      const adjacent = offsets.slice(Math.max(0, i - 1), i + 2).map(sample => sample.shift)
      const median = quantile(adjacent, .5)
      const settled = Math.max(median - 2, Math.min(median + 2, shift))
      return {
        x: Math.max(0, Math.min(1, (point.x + nx * settled) / pixels.width)),
        y: Math.max(0, Math.min(1, (point.y + ny * settled) / pixels.height)),
      }
    })
    const replacements=new Map(jaw.map((p,i)=>[`${p.x},${p.y}`,fitted[i]]))
    contours.jawline=fitted
    if(contours.faceOutline)contours.faceOutline=contours.faceOutline.map(p=>replacements.get(`${p.x},${p.y}`)??p)
    for(const key of ['jawLeft','jawRight','chin'] as const){const p=anchors[key];if(p)anchors[key]=replacements.get(`${p.x},${p.y}`)??p}
  }
  return {...face,contours,anchors}
}
