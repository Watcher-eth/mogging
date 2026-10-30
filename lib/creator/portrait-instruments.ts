import { smoothContour } from './face-treatment'
import { sampleCaptionAppearance, annotationAppearance } from './caption-contrast'
import { isDarkVideoContext, originalVideoContext } from './video-theme'
import { z } from 'zod'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { smoothMotion } from './video-layout'

export const portraitInstrumentSchema = z.object({
  particles: z.enum(['none', 'gather', 'drift', 'swarm']).default('none'),
  trackers: z.enum(['none', 'sparse', 'dense']).default('none'),
  links: z.boolean().default(false), marks: z.boolean().default(false), scan: z.boolean().default(false), trails: z.boolean().default(false),
  strength: z.number().min(0).max(1).default(.65),
}).strict()
export type PortraitInstrument = z.infer<typeof portraitInstrumentSchema>
export const instrumentOwnsGuides = (settings?: PortraitInstrument) => Boolean(settings && (settings.particles !== 'none' || settings.trackers !== 'none' || settings.links || settings.scan))
export const portraitInstruments = [
  { id:'particle-gather', label:'Grain assembly', detail:'Fine source-colour grains gather into the portrait in staggered image layers.', settings:{particles:'gather'} },
  { id:'particle-drift', label:'Directional grain drift', detail:'A tilted boundary releases fine grains into a restrained sideways wind.', settings:{particles:'drift',trails:true} },
  { id:'particle-swarm', label:'Particle bloom', detail:'A cloud of source-colour grains opens and settles back into the photograph.', settings:{particles:'swarm'} },
  { id:'anchor-net', label:'Anchored feature net', detail:'Detected face anchors acquire corner brackets and connect to nearby landmarks.', settings:{trackers:'dense',links:true} },
  { id:'tracker-lock', label:'Sparse tracker locks', detail:'Staggered brackets lock onto detected features with real image-coordinate readouts.', settings:{trackers:'sparse'} },
  { id:'specimen-frame', label:'Faint ruler frame', detail:'Quiet edge ticks and corner crosses frame the portrait without enclosing report scores.', settings:{marks:true} },
  { id:'scan-plane', label:'Feature scan plane', detail:'A faint plane sweeps through the face independently of the tracking net.', settings:{scan:true} },
  { id:'anchor-links', label:'Anchor links only', detail:'Hairlines of varied weight connect detected anchors without tracker brackets or readouts.', settings:{links:true} },
  { id:'grain-trails', label:'Grain trails only', detail:'Fine source-colour streaks peel away from the photograph while the original portrait stays intact.', settings:{trails:true} },
  { id:'instrument-custom', label:'Custom layers', detail:'Choose any combination of tracks, links, scan, trails and frame marks.', settings:{} },
  { id:'particle-atlas', label:'Particle atlas', detail:'Directional image grains, anchored tracking net and a faint graduated frame.', settings:{particles:'drift',trackers:'dense',links:true,marks:true,trails:true} },
] as const

const labelInks = new WeakMap<object, Map<string,string>>()
const anchorNames = ['leftPupil','rightPupil','noseBridge','noseTip','leftCheek','rightCheek','jawLeft','jawRight','chin','upperLip','mouthCenter','forehead'] as const
export function instrumentAnchors(face?: Pick<FaceLandmarksPayload, 'anchors' | 'confidence'> | null, dense = true) {
  if (!face || face.confidence < .58) return []
  const selected = dense ? anchorNames : ['leftPupil','rightPupil','noseTip','chin'] as const
  return selected.flatMap(id => { const point = face.anchors[id]; return point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? [{id,x:point.x,y:point.y}] : [] })
}
export function instrumentLinks(points: Array<{x:number;y:number}>) {
  const edges = new Set<string>()
  points.forEach((a,i) => points.map((b,j)=>({j,d:Math.hypot(a.x-b.x,a.y-b.y)})).filter(b=>b.j!==i&&b.d<.32).sort((a,b)=>a.d-b.d).slice(0,2).forEach(b=>edges.add([Math.min(i,b.j),Math.max(i,b.j)].join(':'))))
  return [...edges].map(edge=>edge.split(':').map(Number) as [number,number])
}
export function trackerAcquisition(timeMs: number, index: number, reduced = false) {
  return reduced ? 1 : smoothMotion((timeMs - index * 105) / 380)
}
export function particleAssembly(timeMs: number, reduced = false) { return reduced ? 1 : smoothMotion(timeMs / 1500) }

type TrackRoute = { id:string; points:Array<{x:number;y:number}>; lengths:number[]; length:number; closed:boolean }
const trackRoutes = new WeakMap<object,TrackRoute[]>()
// Decorative trackers travel on detected contours; they are not anatomical measurements.
export function sampleInstrumentTracks(face: FaceLandmarksPayload | null | undefined,timeMs:number,dense=true,reduced=false) {
  if (!face || face.confidence<.58) return []
  let routes=trackRoutes.get(face)
  if (!routes) {
    const aspect=face.image.height/face.image.width
    routes=(['faceOutline','jawline','leftEye','rightEye','noseBridge'] as const).flatMap(id=>{
      const raw=face.contours?.[id]
      if(!raw || raw.length<3 || raw.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return []
      const closed=Math.hypot(raw[0].x-raw.at(-1)!.x,raw[0].y-raw.at(-1)!.y)<.001
      const points=smoothContour(closed?raw.slice(0,-1):raw,closed)
      const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,(p.y-points[i].y)*aspect))
      const length=lengths.reduce((sum,n)=>sum+n,0)
      return length>0?[{id,points,lengths,length,closed}]:[]
    })
    trackRoutes.set(face,routes)
  }
  const selected=dense?routes.slice(0,4):routes.filter(route=>['faceOutline','jawline','noseBridge'].includes(route.id)).slice(0,3)
  const points=selected.map((route,index)=>{
    const seed=(index+1)*2.399963,phase=(reduced?0:timeMs/(7400+index*1631)+.07*Math.sin(timeMs/(1371+index*233)+seed)+.035*Math.sin(timeMs/(2357+index*419)+seed*1.7))+seed
    const progress=route.closed?((phase%1)+1)%1:(1-Math.cos(phase*Math.PI*2))/2
    let remaining=progress*route.length,segment=0
    while(segment<route.lengths.length-1 && remaining>route.lengths[segment])remaining-=route.lengths[segment++]
    const a=route.points[segment],b=route.points[segment+1],t=remaining/Math.max(.00001,route.lengths[segment])
    return {id:route.id,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,radius:7+(index*5%6),emphasis:reduced?.5:.5+.5*Math.sin(timeMs/(1100+index*371)+seed),opacity:1}
  })
  // Keep every tracker visible. A small continuous separation field prevents
  // nearby paths from piling brackets onto the same eye or jaw corner.
  const aspect=face.image.height/face.image.width
  for(let pass=0;pass<8;pass++) for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
    const a=points[i],b=points[j],dx=b.x-a.x,dy=(b.y-a.y)*aspect,distance=Math.hypot(dx,dy),spacing=.09
    if(distance>=spacing)continue
    const ux=distance>.00001?dx/distance:Math.cos(i+j),uy=distance>.00001?dy/distance:Math.sin(i+j),push=(spacing-distance)*.5
    a.x-=ux*push;a.y-=uy*push/aspect;b.x+=ux*push;b.y+=uy*push/aspect
  }
  return points

}

export function drawPortraitInstruments(ctx: CanvasRenderingContext2D, face: FaceLandmarksPayload | null | undefined, width: number, height: number, settings: PortraitInstrument, timeMs: number, reduced: boolean) {
  const dark = isDarkVideoContext(ctx)
  ctx = originalVideoContext(ctx)
  const points = sampleInstrumentTracks(face,timeMs,settings.trackers !== 'sparse',reduced)
  const transform=ctx.getTransform()
  const unit = 1/Math.max(.01,Math.hypot(transform.a,transform.b)), time = reduced ? 2400 : timeMs
  const ink = '#fff', bounds = instrumentAnchors(face)
  if (!bounds.length) return
  const left = Math.max(.03,Math.min(...bounds.map(p=>p.x))-.1)*width, right = Math.min(.97,Math.max(...bounds.map(p=>p.x))+.1)*width
  const top = Math.max(.03,Math.min(...bounds.map(p=>p.y))-.12)*height, bottom = Math.min(.97,Math.max(...bounds.map(p=>p.y))+.1)*height
  ctx.save(); ctx.strokeStyle=ink; ctx.fillStyle=ink; ctx.lineWidth=1.2*unit; ctx.lineCap='butt'
  if(settings.marks){
    ctx.strokeStyle = ctx.fillStyle = dark ? '#fff' : '#111'
    ctx.globalAlpha *= .2*trackerAcquisition(time,0,reduced)
    ctx.save();ctx.globalAlpha*=.32;ctx.strokeRect(left,top,right-left,bottom-top);ctx.restore();ctx.beginPath()
    for(let i=0;i<=40;i++){
      const length=(i%10===0?19:i%5===0?12:5)*unit, x=left+(right-left)*i/40,y=top+(bottom-top)*i/40
      ctx.moveTo(x,top);ctx.lineTo(x,top-length);ctx.moveTo(x,bottom);ctx.lineTo(x,bottom+length)
      ctx.moveTo(left,y);ctx.lineTo(left-length,y);ctx.moveTo(right,y);ctx.lineTo(right+length,y)
    }
    for(const [x,y] of [[left,top],[right,top],[left,bottom],[right,bottom]]){const d=24*unit;ctx.moveTo(x-d,y);ctx.lineTo(x+d,y);ctx.moveTo(x,y-d);ctx.lineTo(x,y+d)}
    ctx.stroke();ctx.font=`400 ${17*unit}px monospace`;ctx.textAlign='left';ctx.fillText('PORTRAIT / IMAGE SPACE',left,top-39*unit);ctx.textAlign='right';ctx.fillText('2D',right,bottom+44*unit)
  }
  ctx.restore()
  if(settings.scan){
    const phase=reduced?.5:(timeMs%6000)/6000, y=top+(bottom-top)*phase, band=(bottom-top)*.07
    ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip()
    const fade=ctx.createLinearGradient(0,y-band,0,y+band);fade.addColorStop(0,'#ffffff00');fade.addColorStop(.5,'#ffffff12');fade.addColorStop(1,'#ffffff00');ctx.fillStyle=fade;ctx.fillRect(left,y-band,right-left,band*2)
    ctx.strokeStyle='#ffffff66';ctx.lineWidth=unit;ctx.setLineDash([4*unit,7*unit]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.restore()
  }
  if(settings.trackers==='none'&&!settings.links) return
  ctx.save();ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=1.3*unit;ctx.font=`400 ${16*unit}px monospace`;ctx.textAlign='left'
  if(settings.links) for(let a=0;a<points.length;a++) for(let b=a+1;b<points.length;b++) {
    const one=points[a],two=points[b],acquired=trackerAcquisition(time,Math.max(a,b),reduced)
    const distance=Math.hypot(one.x-two.x,(one.y-two.y)*height/width)
    const proximity=smoothMotion((.38-distance)/.2),emphasis=(one.emphasis+two.emphasis)/2
    if(proximity<=0)continue
    ctx.save();ctx.globalAlpha*=(.12+emphasis*.24)*proximity*acquired*one.opacity*two.opacity
    ctx.lineWidth=(.65+proximity*.65+emphasis*.35)*unit;ctx.strokeStyle=`rgb(${210+45*emphasis},${220+35*emphasis},${230+25*emphasis})`
    ctx.beginPath();ctx.moveTo(one.x*width,one.y*height);ctx.lineTo((one.x+(two.x-one.x)*acquired)*width,(one.y+(two.y-one.y)*acquired)*height);ctx.stroke();ctx.restore()
  }
  if(settings.trackers==='none'){ctx.restore();return}
  const labels: Array<{x:number;y:number;w:number;h:number}>=[]
  points.forEach((point,index)=>{
    const amount=trackerAcquisition(time,index,reduced);if(!amount)return
    const x=point.x*width,y=point.y*height,r=(point.radius+(1-amount)*5)*unit,corner=(3+index%3)*unit
    ctx.save();ctx.globalAlpha*=amount*(.45+.45*point.emphasis)*point.opacity;ctx.beginPath()
    for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ctx.moveTo(x+sx*(r-corner),y+sy*r);ctx.lineTo(x+sx*r,y+sy*r);ctx.lineTo(x+sx*r,y+sy*(r-corner))}ctx.stroke()
    ctx.globalAlpha*=.7;ctx.beginPath();ctx.moveTo(x-3*unit,y);ctx.lineTo(x+3*unit,y);ctx.moveTo(x,y-3*unit);ctx.lineTo(x,y+3*unit);ctx.stroke()
    // Keep two moving readouts; the smaller brackets carry the remaining detail.
    if(index%3!==0){ctx.restore();return}
    const label=`${String(index+1).padStart(2,'0')}  ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,w=ctx.measureText(label).width,h=20*unit
    const labelRadius=(point.radius+4)*unit
    const candidates=[{x:x+labelRadius+9*unit,y:y-labelRadius},{x:x-labelRadius-w-9*unit,y:y-labelRadius},{x:x+labelRadius+9*unit,y:y+labelRadius+h}]
    const position=candidates.find(p=>p.x>0&&p.x+w<width&&p.y>h&&!labels.some(b=>p.x<b.x+b.w&&p.x+w>b.x&&p.y-h<b.y+b.h&&p.y>b.y))
    if(position){
      const frame={x:position.x,y:position.y-h,width:w,height:h}
      labels.push({x:frame.x,y:frame.y,w,h})
      let cache=labelInks.get(face!);if(!cache){cache=new Map();labelInks.set(face!,cache)}
      const key=`${dark}/${index}/${width}/${height}/${Math.round(position.x)}/${Math.round(position.y)}`
      let color=cache.get(key)
      if(!color){
        const faceLeft=Math.min(...bounds.map(p=>p.x))*width,faceRight=Math.max(...bounds.map(p=>p.x))*width
        const onFace=frame.x<faceRight&&frame.x+frame.width>faceLeft&&frame.y>top+(bottom-top)*.1&&frame.y<bottom-(bottom-top)*.1
        color=onFace?'#fff':sampleCaptionAppearance(ctx,frame,dark?'#fff':'#111',annotationAppearance).ink
        if(cache.size>96)cache.clear();cache.set(key,color)
      }
      ctx.fillStyle=color;ctx.shadowColor=color==='#fff'?'#000b':'#ffffff80';ctx.shadowBlur=3*unit;ctx.fillText(label,position.x,position.y)
    }
    ctx.restore()
  });ctx.restore()
}

type ParticleRenderer = {canvas:HTMLCanvasElement;gl:WebGLRenderingContext;program:WebGLProgram;texture:WebGLTexture;image?:CanvasImageSource;uniforms:Record<string,WebGLUniformLocation|null>}
let renderer: ParticleRenderer | undefined
const vertex = `precision highp float;
attribute vec2 aUV; uniform sampler2D uPhoto; uniform vec2 uResolution; uniform float uTime,uAssembly,uMode,uStrength,uTrail;
varying vec4 vColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec4 photo=texture2D(uPhoto,aUV);float seed=hash(aUV),luma=dot(photo.rgb,vec3(.2126,.7152,.0722));
 float order=uMode>2.5?seed:(1.0-luma)*.65+seed*.35;
 float settle=smoothstep(order*.32,1.0,uAssembly),flight=1.0-settle;
 vec2 scatter=vec2(sin(seed*63.0),cos(seed*97.0))*(.25+seed*.8)*flight;
 vec2 position=aUV+scatter;
 float edge=smoothstep(.44,.84,aUV.x+(aUV.y-.5)*.38),wind=uMode>1.5&&uMode<2.5?edge*uStrength:0.0;
 float phase=fract(seed+uTime*.065),release=smoothstep(.0,.3,phase)*(1.0-smoothstep(.78,1.0,phase));
 vec2 drift=vec2(phase*.24,sin(seed*31.0+phase*5.0)*.035)*wind*release;
 position+=drift; position-=vec2(.01*uTrail*wind*release,0.0);
 float alpha=photo.a*(1.0-wind*release*.55)*(uTrail>.5?wind*release*.32/uTrail:1.0);
 vColor=vec4(photo.rgb,alpha);
 gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);
 gl_PointSize=max(1.1,uResolution.x/512.0*1.65)*(uTrail>.5?.8:1.0);
}`
const fragment=`precision mediump float;varying vec4 vColor;void main(){float radius=length(gl_PointCoord-.5)*2.0;float alpha=(1.0-smoothstep(.45,1.0,radius))*vColor.a;if(alpha<.015)discard;gl_FragColor=vec4(vColor.rgb,alpha);}`
function particleRenderer(){
  if(renderer&&!renderer.gl.isContextLost())return renderer
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true})
  if(!gl)throw new Error('Image particles need WebGL. Choose a tracker or ruler-frame effect on this device.')
  const shader=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Could not compile image particles.');return shader}
  const program=gl.createProgram()!,vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Could not initialize image particles.')
  gl.useProgram(program)
  const size=512,count=size*1024,points=new Float32Array(count*2)
  const jitter=(seed:number)=>{let value=Math.imul(seed^(seed>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return ((value^(value>>>16))>>>0)/4294967296}
  for(let i=0;i<count;i++){points[i*2]=(i%size+jitter(i*2+1))/size;points[i*2+1]=(Math.floor(i/size)+jitter(i*2+2))/1024}
  const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);const location=gl.getAttribLocation(program,'aUV');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0)
  const texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
  const uniforms=Object.fromEntries(['uPhoto','uResolution','uTime','uAssembly','uMode','uStrength','uTrail'].map(name=>[name,gl.getUniformLocation(program,name)]))
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
  renderer={canvas,gl,program,texture,uniforms};return renderer
}
export function drawPortraitParticles(ctx:CanvasRenderingContext2D,image:HTMLImageElement|HTMLCanvasElement,settings:PortraitInstrument,timeMs:number,reduced:boolean){
  const {canvas,gl,program,uniforms}=particleRenderer(),scale=Math.min(1,1440/Math.max(image.width,image.height))
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale))
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
  gl.viewport(0,0,width,height);gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,renderer!.texture)
  if(renderer!.image!==image){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);renderer!.image=image}
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1i(uniforms.uPhoto,0);gl.uniform2f(uniforms.uResolution,width,height);gl.uniform1f(uniforms.uTime,reduced?0:timeMs/1000);gl.uniform1f(uniforms.uAssembly,particleAssembly(timeMs,reduced));gl.uniform1f(uniforms.uMode,settings.particles==='drift'||settings.particles==='none'?2:settings.particles==='swarm'?3:1);gl.uniform1f(uniforms.uStrength,reduced?0:settings.strength)
  if(settings.trails&&!reduced) for(let pass=1;pass<=3;pass++){gl.uniform1f(uniforms.uTrail,pass);gl.drawArrays(gl.POINTS,0,512*1024)}
  if(settings.particles!=='none'){gl.uniform1f(uniforms.uTrail,0);gl.drawArrays(gl.POINTS,0,512*1024)}
  ctx.drawImage(canvas,0,0,image.width,image.height)
}

export function preparePortraitParticles(image: HTMLImageElement | HTMLCanvasElement) {
  const probe = document.createElement('canvas')
  drawPortraitParticles(probe.getContext('2d')!, image, portraitInstrumentSchema.parse({particles:'gather'}), 2000, true)
}
