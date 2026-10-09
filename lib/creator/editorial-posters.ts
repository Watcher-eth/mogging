import { drawReportOverlay, type ReportOverlay } from './report-overlay'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'
import { getImageTransform, projectImagePoint } from './mobile-overlay-engine/layout'
import { categoryScoreMax, type ContentSlide, type GeneratorImage } from './content-generator'

export type PosterFamily = 'performance' | 'precision' | 'afterimage'
const portraits = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
let assets: Promise<void> | undefined
let brandIcon: HTMLImageElement | undefined
let segmenter: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | undefined
export function posterFamily(template: ContentSlide['templateId']): PosterFamily {
  if (template === 'afterimage') return 'afterimage'
  if (['precision', 'psl', 'score-rows'].includes(template)) return 'precision'
  if (['quiet-editorial', 'editorial', 'paper-editorial', 'score-potential'].includes(template)) return 'afterimage'
  return 'performance'
}
export function loadPosterAssets() {
  return assets ??= Promise.all([
    new FontFace('Poster Brand', 'url(/fonts/Geist-Regular.ttf)', { weight: '400' }),
    new FontFace('Poster Sans', 'url(/fonts/PPFramaText-Variable.woff2)', { weight: '100 900' }),
  ].map(async font => { await font.load(); document.fonts.add(font) }).concat([new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => { brandIcon = image; resolve() }; image.onerror = () => reject(new Error('Brand icon could not be loaded'))
    image.src = '/landing/mogging-logo.png'
  })])).then(() => undefined)
}

async function cutout(image: HTMLImageElement) {
  segmenter ??= (async () => {
    const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/creator-models/selfie-segmenter.tflite' },
      runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    })
  })()
  const detector = await segmenter
  const result = detector.segment(image)
  try {
    const mask = result.confidenceMasks?.at(-1)
    if (!mask) throw new Error('Portrait segmentation returned no foreground mask')
    const alpha = document.createElement('canvas'); alpha.width = mask.width; alpha.height = mask.height
    const alphaCtx = alpha.getContext('2d')!
    const pixels = alphaCtx.createImageData(mask.width, mask.height), values = mask.getAsFloat32Array()
    for (let i = 0; i < values.length; i++) {
      const confidence = Math.max(0, Math.min(1, (values[i] - .15) / .7))
      pixels.data[i * 4 + 3] = Math.round(255 * confidence * confidence * (3 - 2 * confidence))
    }
    alphaCtx.putImageData(pixels, 0, 0)
    const subject = document.createElement('canvas'); subject.width = image.width; subject.height = image.height
    const ctx = subject.getContext('2d')!
    ctx.drawImage(image, 0, 0); ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(alpha, 0, 0, subject.width, subject.height)
    return subject
  } finally { result.close() }
}

function portrait(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height)
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip()
  ctx.drawImage(image, x + (width - image.width * scale) / 2, y + (height - image.height * scale) / 2, image.width * scale, image.height * scale)
  ctx.restore()
}
function wash(ctx: CanvasRenderingContext2D, width: number, height: number, horizontal: boolean, stops: [number,string][]) {
  const gradient = ctx.createLinearGradient(0, 0, horizontal ? width : 0, horizontal ? 0 : height)
  stops.forEach(([position,color]) => gradient.addColorStop(position,color)); ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height)
}
export async function preparePoster(image: HTMLImageElement, width: number, height: number, family: PosterFamily, landmarks: GeneratorImage['landmarks'] = null) {
  const [, subject] = await Promise.all([loadPosterAssets(), cutout(image)])
  const subjectCtx = subject.getContext('2d')!
  const pixels = subjectCtx.getImageData(0, 0, subject.width, subject.height)
  const contrast = family === 'precision' ? 1.48 : family === 'performance' ? 1.42 : 1.08
  const brightness = family === 'performance' ? .98 : 1.04
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722
    const x = (i / 4 % subject.width) / subject.width, y = Math.floor(i / 4 / subject.width) / subject.height
    const keyLight = Math.exp(-(((x - .36) / .48) ** 2 + ((y - .34) / .43) ** 2))
    const exposure = family === 'performance' ? .62 + keyLight * .48 : 1
    const tone = Math.max(0, Math.min(255, ((gray - 128) * contrast + 128) * brightness * exposure))
    pixels.data[i] = tone * (family === 'afterimage' ? .76 : 1)
    pixels.data[i + 1] = tone
    pixels.data[i + 2] = tone * (family === 'afterimage' ? .9 : 1)
  }
  subjectCtx.putImageData(pixels, 0, 0)
  const source = document.createElement('canvas'); source.width = width; source.height = height
  const ctx = source.getContext('2d')!
  ctx.fillStyle = ['performance','afterimage'].includes(family) ? '#080909' : '#ffffff'; ctx.fillRect(0,0,width,height)
  if (family === 'performance') {
    portrait(ctx,subject,0,0,width,height)
    wash(ctx,width,height,false,[[0,'rgba(8,9,9,.15)'],[.16,'rgba(8,9,9,0)'],[.58,'rgba(8,9,9,0)'],[.83,'rgba(8,9,9,.64)'],[1,'rgba(8,9,9,.98)']])
  } else if (family === 'afterimage') {
    const light = ctx.createLinearGradient(0,0,width,height)
    light.addColorStop(0,'#45b6a0'); light.addColorStop(.48,'#0b3d38'); light.addColorStop(1,'#060d10')
    ctx.fillStyle=light; ctx.fillRect(0,0,width,height)
    ctx.save(); ctx.filter=`blur(${width*.016}px)`
    for (let i=12;i>0;i--) {
      ctx.globalAlpha=.12
      portrait(ctx,subject,width*(.22-i*.085),-height*i*.012,width*.95,height)
    }
    ctx.restore()
    portrait(ctx,subject,width*.22,0,width*.95,height)
    wash(ctx,width,height,false,[[0,'rgba(3,27,23,.08)'],[.6,'rgba(3,27,23,.1)'],[1,'rgba(3,18,16,.98)']])
  } else if (family === 'precision') {
    const face = document.createElement('canvas'); face.width = width; face.height = height
    const faceCtx = face.getContext('2d')!
    faceCtx.fillStyle = '#ffffff'; faceCtx.fillRect(0,0,width,height)
    portrait(faceCtx,subject,width*.06,height*.065,width*.88,height*.80)
    ctx.drawImage(face,0,0)
    // A short cluster at the hair, a clear eye line, then one decisive jaw cut.
    const bands = [
      [.17,.012,-.035], [.205,.033,.065], [.253,.009,-.075],
      [.32,.018,.04], [.57,.013,-.045], [.64,.027,.055], [.77,.011,-.025],
    ]
    const anchors = enrichFaceLandmarks(landmarks)?.anchors
    const eyePoints = [anchors?.leftEyeOuter, anchors?.leftEyeInner, anchors?.rightEyeInner, anchors?.rightEyeOuter].filter(point => point != null)
    const transform = getImageTransform(image,{width:width*.88,height:height*.80},'cover')
    const eyeYs = eyePoints.map(point => height*.065 + projectImagePoint(point,image,transform).y)
    const eyeTop = eyeYs.length ? Math.min(...eyeYs)-height*.024 : height*.35
    const eyeBottom = eyeYs.length ? Math.max(...eyeYs)+height*.024 : height*.43
    bands.forEach(([position,thickness,offset]) => {
      const y=height*position, bandHeight=height*thickness
      if (y < eyeBottom && y + bandHeight > eyeTop) return
      ctx.fillStyle='#ffffff'; ctx.fillRect(0,y,width,bandHeight)
      ctx.drawImage(face,0,y,width,bandHeight,width*offset,y,width,bandHeight)
    })
    // Three accents of different lengths form a diagonal rhythm around the face.
    ctx.fillStyle='#161818'
    ctx.fillRect(width*.66,height*.205,width*.34,height*.012)
    ctx.fillRect(0,height*.32,width*.21,height*.008)
    ctx.fillRect(width*.74,height*.64,width*.26,height*.018)

  }
  portraits.set(image,await paperTexture(source,width,height))
}
async function paperTexture(source: HTMLCanvasElement, width: number, height: number) {
  const ctx = source.getContext('2d')!
  const photo = new Image(); photo.src = source.toDataURL(); await photo.decode()
  const { ShaderMount, paperTextureFragmentShader, getShaderNoiseTexture } = await import('@paper-design/shaders')
  const noise = getShaderNoiseTexture(); if (noise) await noise.decode()
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1`
  document.body.appendChild(host)
  let mount: InstanceType<typeof ShaderMount> | undefined
  try {
    mount = new ShaderMount(host, paperTextureFragmentShader, {
      u_image: photo, u_isImage: true, u_imageAspectRatio: width / height, u_noiseTexture: noise,
      u_colorBack: [1,1,1,1], u_colorPaper: [1,1,1,1], u_colorShadow: [.12,.12,.12,1],
      u_blending: .18, u_distortion: 0, u_clip: false, u_angle: 300, u_seed: 17,
      u_roughness: .16, u_roughnessSize: 0, u_roughnessRows: 0,
      u_fiber: 0, u_fiberSize: .2, u_folds: 0, u_foldSizeX: 1, u_foldSizeY: 1, u_foldOffsetX: 0, u_foldOffsetY: 0,
      u_wrinkles: 0, u_wrinkleSize: .5, u_crumples: 0, u_crumpleCount: 6, u_drops: 0,
      u_fit: 2, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: .5, u_originY: .5, u_worldWidth: 0, u_worldHeight: 0,
    }, { preserveDrawingBuffer: true }, 0, 0, 1, width * height)
    // ResizeObserver sets the backing resolution after mounting.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    mount.setFrame(0)
    ctx.drawImage(mount.canvasElement, 0, 0, width, height)
    return source
  } finally { mount?.dispose(); host.remove() }
}

const sans = '"Poster Sans", sans-serif'
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight=400, font=sans, align: CanvasTextAlign='left', maxWidth?: number) {
  ctx.font=`${weight} ${size}px ${font}`; ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='top'
  ctx.fillText(value,x,y,maxWidth)
}
function baselineText(ctx: CanvasRenderingContext2D, value: string, x: number, baseline: number, size: number, color: string, weight=400, align: CanvasTextAlign='left') {
  ctx.font=`${weight} ${size}px ${sans}`; ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='alphabetic'
  ctx.fillText(value,x,baseline)
}
export function drawPoster(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, width: number, height: number, time: number, overlay: ReportOverlay | null = null) {
  const family=posterFamily(slide.templateId), dark=['performance','afterimage'].includes(family), ink=dark?'#f0efea':'#161818', muted=dark?'#a2a4a2':'#6e716d'
  ctx.save(); ctx.fillStyle=dark?'#080909':'#ffffff'; ctx.fillRect(0,0,width,height)
  ctx.globalAlpha=1-Math.pow(1-Math.min(1,time/900),3)
  const art=image&&portraits.get(image); if(art)ctx.drawImage(art,0,0,width,height)
  if (overlay && dark) {
    ctx.save()
    ctx.globalAlpha *= family==='afterimage' ? .64 : .56
    if (family==='afterimage') ctx.translate(width*.22,0)
    const contours: ReportOverlay = {
      ...overlay, dots: [], pointAppearance: 'minimal', ink: family==='afterimage' ? '162,224,207' : '218,222,221',
      primitives: overlay.primitives.filter(primitive => primitive.kind !== 'label' && primitive.kind !== 'region').map(primitive => ({ ...primitive, fillOpacity: 0, strokeWidth: .7, opacity: .85 })),
    }
    if (slide.categoryId === 'jaw') {
      const left = contours.primitives.find(primitive => primitive.id === 'jaw-contour-left')
      const right = contours.primitives.find(primitive => primitive.id === 'jaw-contour-right')
      if (left?.kind === 'line' && right?.kind === 'line') contours.primitives.push({ ...left, id: 'jaw-triangle-base', fromPoint: left.fromPoint, toPoint: right.toPoint, opacity: .5, dashed: true })
    }
    drawReportOverlay(ctx,contours,width*(family==='afterimage' ? .95 : 1),time,false)
    ctx.restore()
  }
  const inset=width*.055, right=width-inset
  ctx.save(); ctx.letterSpacing=`${-width*.00065}px`
  text(ctx,'mogging.com',inset,height*.045,width*.035,ink,400,'"Poster Brand", sans-serif')
  ctx.restore()
  if (brandIcon) {
    const size=width*.041
    ctx.save(); ctx.beginPath(); ctx.roundRect(right-size,height*.044,size,size,size*.31); ctx.clip()
    ctx.drawImage(brandIcon,right-size,height*.044,size,size); ctx.restore()
  }
  if(family==='performance') {
    const baseline=height*.943, score=slide.currentScore||'—', size=width*.145
    baselineText(ctx,score,inset,baseline,size,ink,500)
    const scoreWidth=ctx.measureText(score).width
    baselineText(ctx,'/ 10',inset+scoreWidth+width*.018,baseline,width*.026,muted)
    baselineText(ctx,'FACE ANALYSIS',right,baseline-width*.085,width*.016,muted,400,'right')
    baselineText(ctx,'See what makes',right,baseline-width*.033,width*.027,ink,400,'right')
    baselineText(ctx,'you stand out.',right,baseline,width*.027,ink,400,'right')
  } else if(family==='precision') {
    const score=slide.categoryScores.find(item=>item.categoryId===slide.categoryId)?.value||slide.currentScore
    const baseline=height*.967
    baselineText(ctx,'ANALYSIS',inset,baseline-width*.085,width*.016,muted)
    baselineText(ctx,slide.metricLabel,inset,baseline-width*.02,width*.056,ink,500)
    baselineText(ctx,score||'—',right-width*.085,baseline,width*.115,'#161818',500,'right')
    baselineText(ctx,`/ ${categoryScoreMax(slide.categoryId)}`,right,baseline,width*.021,muted,400,'right')
  } else {
    const baseline=height*.943, size=width*.115
    baselineText(ctx,'See where you can improve.',inset,baseline-width*.19,width*.028,ink,500)
    baselineText(ctx,'CURRENT',inset,baseline-width*.125,width*.017,muted)
    baselineText(ctx,'POTENTIAL',right,baseline-width*.125,width*.017,muted,400,'right')
    baselineText(ctx,slide.currentScore||'—',inset,baseline,size,ink,500)
    baselineText(ctx,slide.potentialScore||'—',right,baseline,size,ink,500,'right')
    baselineText(ctx,'→',width/2,baseline-width*.02,width*.055,'#c7ccca',400,'center')

  }
  ctx.restore()
}
