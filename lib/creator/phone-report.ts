import { drawBrandLockup, type CreatorBrand } from './brand'
import { loadPosterAssets } from './editorial-posters'
import type { ContentSlide } from './content-generator'
import { drawMockReport } from './mock-report'
import type { ReportOverlay } from './report-overlay'

const reportCanvases = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
let frame: HTMLImageElement | undefined
let handheld: HTMLImageElement | undefined
let handheldLoading: Promise<void> | undefined
let loading: Promise<void> | undefined
export function loadPhoneFrame() {
  return loading ??= Promise.all([loadPosterAssets(), new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => { frame = image; resolve() }
    image.onerror = () => reject(new Error('The iPhone frame could not be loaded'))
    image.src = '/creator-devices/iphone-16-pro.png'
  })]).then(() => undefined)
}

export function drawPhoneReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, photo: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, brand: CreatorBrand | null = null) {
  if (!frame) return
  ctx.save()
  ctx.fillStyle = '#f9faf8'; ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(width*.5,height*.8,0,width*.5,height*.8,width*.75)
  glow.addColorStop(0,'#e6eaf5'); glow.addColorStop(1,'rgba(230,234,245,0)')
  ctx.fillStyle=glow; ctx.fillRect(0,0,width,height)
  // Quiet drafting lines give the device a setting without competing with its screen.
  ctx.strokeStyle = 'rgba(93,114,131,.08)'; ctx.lineWidth = width / 1080
  for (let x = width * .08; x < width; x += width * .14) {
    ctx.beginPath(); ctx.moveTo(x,height*.18); ctx.lineTo(x,height); ctx.stroke()
  }
  for (let y = height * .22; y < height; y += width * .14) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke()
  }
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = '#09090b'
  ctx.font = `600 ${width * .078}px "Poster Sans", sans-serif`
  ctx.fillText(slide.headline || 'Ascend Now', width / 2, height * .06)
  drawBrandLockup(ctx,brand,width*.19,height*.13,width*.62,'#09090b')

  const progress = 1 - Math.pow(1 - Math.min(1, time / 800), 3)
  const phoneHeight = Math.min(height * .94, width * 1.95), phoneWidth = phoneHeight * 1350 / 2760
  const x = (width - phoneWidth) / 2, y = height * .205 + (1 - progress) * height * .72
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.20)'; ctx.shadowBlur = width * .045; ctx.shadowOffsetY = width * .015
  ctx.drawImage(frame, x, y, phoneWidth, phoneHeight); ctx.restore()
  // Published Apple frame screen coordinates, not a recreated device outline.
  const screenX = x + phoneWidth * (70 / 1350), screenY = y + phoneHeight * (67 / 2760)
  const screenWidth = phoneWidth * (1210 / 1350), screenHeight = phoneHeight * (2626 / 2760)
  const report = renderEmbeddedReport(ctx,slide,photo,overlay,screenWidth,time)
  ctx.save(); ctx.beginPath(); ctx.roundRect(screenX, screenY, screenWidth, screenHeight, phoneWidth * (180 / 1350)); ctx.clip()
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(report, screenX, screenY, screenWidth, screenHeight); ctx.restore()
  ctx.drawImage(frame, x, y, phoneWidth, phoneHeight)
  ctx.restore()
}


function renderEmbeddedReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, photo: HTMLImageElement | null, overlay: ReportOverlay | null, screenWidth: number, time: number) {
  let report = reportCanvases.get(ctx)
  if (!report) {
    report = document.createElement('canvas')
    reportCanvases.set(ctx, report)
  }
  const resolution = Math.ceil(Math.max(1560, screenWidth * 3))
  if (report.width !== resolution) { report.width = resolution; report.height = Math.ceil(resolution * 844 / 390) }
  const reportCtx = report.getContext('2d')!
  drawMockReport(reportCtx, slide, photo, overlay, report.width, report.height, time)
  return report
}

export function loadHandheldPhone() {
  return handheldLoading ??= new Promise<void>((resolve,reject) => {
    const image = new Image()
    image.onload = () => { handheld = image; resolve() }
    image.onerror = () => { handheldLoading = undefined; reject(new Error('The handheld phone photo could not be loaded')) }
    image.src = '/creator-devices/handheld-night.png'
  })
}

export function drawHandheldReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, photo: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, brand: CreatorBrand | null) {
  if (!handheld) return
  // Coordinates are calibrated to the photographed display, preserving the photo's aspect ratio.
  const scale = Math.max(width / 941,height / 1672)
  const offsetX = (width - 941 * scale) / 2, offsetY = (height - 1672 * scale) / 2
  ctx.save(); ctx.drawImage(handheld,offsetX,offsetY,941 * scale,1672 * scale)
  const screenX = offsetX + 259 * scale, screenY = offsetY + 420 * scale
  const screenWidth = 419 * scale, screenHeight = 918 * scale
  const report = renderEmbeddedReport(ctx,slide,photo,overlay,screenWidth,time)
  ctx.save(); ctx.beginPath(); ctx.roundRect(screenX,screenY,screenWidth,screenHeight,49 * scale); ctx.clip()
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(report,screenX,screenY,screenWidth,screenHeight)
  // A quiet glass reflection keeps the inserted UI part of the photographed device.
  const reflection = ctx.createLinearGradient(screenX,screenY,screenX + screenWidth,screenY + screenHeight)
  reflection.addColorStop(0,'rgba(255,255,255,.08)'); reflection.addColorStop(.45,'rgba(255,255,255,0)'); reflection.addColorStop(1,'rgba(0,0,0,.10)')
  ctx.fillStyle = reflection; ctx.fillRect(screenX,screenY,screenWidth,screenHeight); ctx.restore()
  drawBrandLockup(ctx,brand,width*.10,Math.max(height*.085,offsetY + 270 * scale),width*.80)
  ctx.restore()
}
