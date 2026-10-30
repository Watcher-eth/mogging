import { portraitPrintStyles, portraitPrintPaperAlpha, preservePortraitTone, type PortraitPrint } from './portrait-print'
import { drawBrandLockup, type CreatorBrand } from './brand'
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
  ].map(async font => { await font.load(); document.fonts.add(font) }).concat([new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => { brandIcon = image; resolve() }; image.onerror = () => reject(new Error('Brand icon could not be loaded'))
    image.src = '/landing/mogging-logo.png'
  })])).then(() => undefined)
}

export function refinePortraitMask(values: Float32Array, maskWidth: number, maskHeight: number, pixels: Uint8ClampedArray, width: number, height: number) {
  const alpha = new Uint8ClampedArray(width * height)
  const guide = new Uint8ClampedArray(maskWidth * maskHeight * 3)
  for (let row = 0; row < maskHeight; row++) for (let column = 0; column < maskWidth; column++) {
    const source = (Math.min(height - 1, Math.floor((row + .5) * height / maskHeight)) * width + Math.min(width - 1, Math.floor((column + .5) * width / maskWidth))) * 4
    guide.set(pixels.subarray(source, source + 3), (row * maskWidth + column) * 3)
  }
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const horizontal = Math.max(0, Math.min(maskWidth - 1, (column + .5) * maskWidth / width - .5))
    const vertical = Math.max(0, Math.min(maskHeight - 1, (row + .5) * maskHeight / height - .5))
    const left = Math.floor(horizontal), top = Math.floor(vertical), offset = (row * width + column) * 4
    let confidence = 0, total = 0
    for (let down = 0; down < 2; down++) for (let across = 0; across < 2; across++) {
      const index = Math.min(maskHeight - 1, top + down) * maskWidth + Math.min(maskWidth - 1, left + across)
      const distance = (pixels[offset] - guide[index * 3]) ** 2 + (pixels[offset + 1] - guide[index * 3 + 1]) ** 2 + (pixels[offset + 2] - guide[index * 3 + 2]) ** 2
      const weight = (across ? horizontal - left : 1 - horizontal + left) * (down ? vertical - top : 1 - vertical + top) / (1 + distance / 900) ** 2
      confidence += values[index] * weight; total += weight
    }
    const coverage = Math.max(0, Math.min(1, (confidence / Math.max(.000001, total) - .15) / .7))
    alpha[row * width + column] = Math.round(255 * coverage * coverage * (3 - 2 * coverage))
  }
  return alpha
}

// Bounded nearest-sample propagation: linear work, no per-pixel neighbourhood searches.
function nearestMatteSamples(width: number, height: number, limit: number, seed: (index: number) => boolean) {
  const distance = new Uint16Array(width * height).fill(limit + 1)
  const indices = new Int32Array(width * height).fill(-1)
  for (let index = 0; index < indices.length; index++) if (seed(index)) { distance[index] = 0; indices[index] = index }
  const extend = (index: number, neighbour: number) => {
    const next = distance[neighbour] + 1
    if (next <= limit && next < distance[index]) { distance[index] = next; indices[index] = indices[neighbour] }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x
    if (x) extend(index, index - 1)
    if (y) extend(index, index - width)
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const index = y * width + x
    if (x + 1 < width) extend(index, index + 1)
    if (y + 1 < height) extend(index, index + width)
  }
  return { distance, indices }
}

export function refinePortraitEdges(pixels: Uint8ClampedArray, alpha: Uint8ClampedArray, width: number, height: number) {
  // The model owns the silhouette. Colour cleanup must never carve opaque skin,
  // hair or clothing, or use already-corrected pixels as colour references.
  const radius = Math.max(1, Math.min(8, Math.round(Math.max(width, height) / 512)))
  const background = nearestMatteSamples(width, height, radius, index => alpha[index] === 0).indices
  const original = pixels.slice()
  for (let index = 0; index < alpha.length; index++) {
    const offset = index * 4, coverage = alpha[index] / 255
    const back = background[index] * 4
    if (coverage >= .1 && coverage < .98 && original[offset + 3] === 255 && back >= 0) {
      for (let channel = 0; channel < 3; channel++) {
        const colour = original[offset + channel]
        const corrected = (colour - (1 - coverage) * original[back + channel]) / coverage
        pixels[offset + channel] = Math.max(colour - 32, Math.min(colour + 32, corrected))
      }
    }
    pixels[offset + 3] = Math.round(original[offset + 3] * coverage)
  }
}

export async function cutout(image: HTMLImageElement) {
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
    const subject = document.createElement('canvas'); subject.width = image.width; subject.height = image.height
    const ctx = subject.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const source = ctx.getImageData(0, 0, subject.width, subject.height)
    const coverage = refinePortraitMask(mask.getAsFloat32Array(), mask.width, mask.height, source.data, subject.width, subject.height)
    refinePortraitEdges(source.data, coverage, subject.width, subject.height)
    ctx.putImageData(source, 0, 0)
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
export type { PortraitPrint } from './portrait-print'
const printedPortraits = new WeakMap<HTMLCanvasElement | HTMLImageElement, Map<string, Promise<HTMLCanvasElement>>>()
export function preparePortraitPrint(image: HTMLCanvasElement | HTMLImageElement, treatment: PortraitPrint, purpose: 'video' | 'selection' = 'video') {
  let variants = printedPortraits.get(image)
  if (!variants) { variants = new Map(); printedPortraits.set(image, variants) }
  const key = `${treatment}:${purpose}`
  let prepared = variants.get(key)
  if (!prepared) {
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height
    source.getContext('2d')!.drawImage(image, 0, 0)
    prepared = paperTexture(source, source.width, source.height, treatment, purpose).catch(error => { variants!.delete(key); throw error })
    variants.set(key, prepared)
  }
  return prepared
}
async function paperTexture(source: HTMLCanvasElement, width: number, height: number, treatment?: PortraitPrint, purpose: 'video' | 'selection' = 'video') {
  const emphasized = purpose === 'selection'
  const style = portraitPrintStyles.find(style => style.id === treatment)
  const ctx = source.getContext('2d')!
  const originalPixels = ctx.getImageData(0, 0, width, height)
  const photo = new Image(); photo.src = source.toDataURL(); await photo.decode()
  const { ShaderMount, paperTextureFragmentShader, halftoneDotsFragmentShader, halftoneCmykFragmentShader, imageDitheringFragmentShader, getShaderNoiseTexture } = await import('@paper-design/shaders')
  const noise = getShaderNoiseTexture(); if (noise) await noise.decode()
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1`
  document.body.appendChild(host)
  let mount: InstanceType<typeof ShaderMount> | undefined
  try {
    const shader = style?.shader === 'dither' ? imageDitheringFragmentShader : style?.shader === 'dots' ? halftoneDotsFragmentShader : style?.shader === 'cmyk' ? halftoneCmykFragmentShader : paperTextureFragmentShader
    const inks = treatment === 'ink-press' ? { c: [.16,.17,.18,1], m: [.3,.26,.24,1], y: [.65,.53,.4,1], k: [.06,.055,.05,1] }
      : treatment === 'riso' ? { c: [.02,.48,.5,1], m: [.98,.28,.24,1], y: [1,.68,.42,1], k: [.1,.2,.23,1] }
      : treatment === 'vintage' ? { c: [.22,.43,.45,1], m: [.63,.28,.23,1], y: [.9,.65,.31,1], k: [.2,.15,.13,1] }
      : { c: [0,.65,.82,1], m: [.9,.16,.38,1], y: [1,.84,.12,1], k: [.08,.07,.09,1] }
    const print = style?.shader === 'dither' ? {
      u_colorFront: [.08,.08,.08,1], u_colorHighlight: [1,1,1,1], u_originalColors: true, u_inverted: false,
      u_type: 4, u_pxSize: emphasized ? 5 : 2.5, u_colorSteps: 6,
    } : style?.shader === 'dots' ? {
      u_colorFront: treatment === 'blue-ink' ? [.04,.16,.42,1] : [.07,.08,.1,1], u_originalColors: false, u_type: 0, u_grid: 1, u_inverted: false,
      u_size: emphasized ? .2 : .06, u_radius: 1.05, u_contrast: emphasized ? .58 : .42, u_grainMixer: .025, u_grainOverlay: .025, u_grainSize: .1,
    } : style?.shader === 'cmyk' ? {
      u_colorC: inks.c, u_colorM: inks.m, u_colorY: inks.y, u_colorK: inks.k,
      u_type: treatment === 'ink-press' ? 1 : 0, u_size: emphasized ? .2 : treatment === 'riso' ? .075 : .04, u_contrast: 1, u_softness: .7, u_gridNoise: .015,
      u_floodC: 0, u_floodM: 0, u_floodY: 0, u_floodK: 0, u_gainC: 0, u_gainM: 0, u_gainY: 0, u_gainK: 0,
      u_grainMixer: .015, u_grainOverlay: .02, u_grainSize: .1,
    } : {
      u_isImage: true, u_colorPaper: [1,1,1,1], u_colorShadow: [.12,.12,.12,1],
      u_blending: emphasized ? .95 : treatment ? .5 : .18, u_distortion: 0, u_clip: false, u_angle: 300, u_seed: 17,
      u_roughness: emphasized ? .8 : treatment ? .46 : .16, u_roughnessSize: emphasized ? .35 : 0, u_roughnessRows: 0,
      u_fiber: emphasized ? .45 : treatment ? .14 : 0, u_fiberSize: .2, u_folds: 0, u_foldSizeX: 1, u_foldSizeY: 1, u_foldOffsetX: 0, u_foldOffsetY: 0,
      u_wrinkles: 0, u_wrinkleSize: .5, u_crumples: 0, u_crumpleCount: 6, u_drops: 0,
    }
    mount = new ShaderMount(host, shader, {
      u_image: photo, u_imageAspectRatio: width / height, ...(style?.shader === 'dots' ? {} : { u_noiseTexture: noise }), u_colorBack: [1,1,1,portraitPrintPaperAlpha(treatment)],
      u_fit: 2, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: .5, u_originY: .5, u_worldWidth: 0, u_worldHeight: 0, ...print,
    }, { preserveDrawingBuffer: true }, 0, 0, 1, treatment ? Math.min(width * height, 4194304) : width * height)
    // ResizeObserver sets the backing resolution after mounting.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    mount.setFrame(0)
    ctx.save()
    ctx.globalAlpha = emphasized ? style?.shader === 'dots' ? .82 : 1 : style?.opacity ?? 1
    ctx.drawImage(mount.canvasElement, 0, 0, width, height)
    ctx.restore()
    const printedPixels = ctx.getImageData(0, 0, width, height)
    preservePortraitTone(originalPixels.data, printedPixels.data)
    ctx.putImageData(printedPixels, 0, 0)
    return source
  } finally { mount?.dispose(); host.remove() }
}

const sans = '"Poster Brand", sans-serif'
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight=400, font=sans, align: CanvasTextAlign='left', maxWidth?: number) {
  ctx.font=`${weight} ${size}px ${font}`; ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='top'
  ctx.fillText(value,x,y,maxWidth)
}
function baselineText(ctx: CanvasRenderingContext2D, value: string, x: number, baseline: number, size: number, color: string, weight=400, align: CanvasTextAlign='left') {
  ctx.font=`${weight} ${size}px ${sans}`; ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='alphabetic'
  ctx.fillText(value,x,baseline)
}
export function drawPoster(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, width: number, height: number, time: number, overlay: ReportOverlay | null = null, brand: CreatorBrand | null = null) {
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
  const square = height / width < 1.2
  if (square && family === 'afterimage') {
    drawBrandLockup(ctx, brand, width * .13, height * .035, width * .74, ink)
  } else {
    ctx.save(); ctx.letterSpacing=`${-width*.00065}px`
    text(ctx,'mogging.com',inset,height*(family==='precision' ? .025 : .045),width*.035,ink,square ? 650 : 400,square ? sans : '"Poster Brand", sans-serif')
    ctx.restore()
    const size=width*.041, gap=width*.014
    const iconY=height*(family==='precision' ? .024 : .044)
    if (brandIcon) {
      const iconX=right-size-(square && brand ? size+gap : 0)
      ctx.save(); ctx.beginPath(); ctx.roundRect(iconX,iconY,size,size,size*.31); ctx.clip()
      ctx.drawImage(brandIcon,iconX,iconY,size,size); ctx.restore()
    }
    if (square && brand) ctx.drawImage(brand.appStore,right-size,iconY,size,size)
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
    baselineText(ctx,'ANALYSIS',inset,baseline-width*.065,width*.016,muted)
    baselineText(ctx,slide.metricLabel,inset,baseline,width*.056,ink,500)
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
