import type { ContentSlide } from './content-generator'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'
import type { RevealBrand } from './score-reveal'
import { drawShareOverallOverlay } from '@/lib/sharing/overall-overlay'
import { estimatedPopulationTopPercent } from '@/lib/sharing/population-percentile'
import { getLooksmaxRank, shareCardLayout } from '@/lib/sharing/share-card'

export function drawLegacyPoster(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  ctx.fillStyle = '#09090b'; ctx.fillRect(0,0,width,height)
  if (image) drawCover(ctx,image,0,0,width,height)
  if (slide.templateId === 'score-potential') drawMobileShare(ctx,slide,overlay,width,height,timeMs)
  else {
    const gradient=ctx.createLinearGradient(0,0,0,height)
    gradient.addColorStop(0,'rgba(0,0,0,.45)'); gradient.addColorStop(.5,'rgba(0,0,0,.05)'); gradient.addColorStop(1,'rgba(0,0,0,.95)')
    ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height)
    if (overlay) drawReportOverlay(ctx,overlay,width,timeMs,false)
    drawEditorial(ctx,slide,width,height,timeMs,brand)
  }
  ctx.restore()
}

function drawEditorial(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  drawBrandPair(ctx, brand, width, height, timeMs)
  const size = width * .075
  const scale = width / shareCardLayout.width
  const labelY = height - height * .055 - shareCardLayout.scoreLabelSize * scale
  const valueY = labelY - (shareCardLayout.scoreSize + 12) * scale
  const headlineBottom = valueY - width * .05
  const headline = slide.headline.trim() && slide.headline.length <= 48 ? slide.headline : 'Time to ascend.'
  const lines = wrapText(ctx, headline, width * .86, `500 ${size}px Arial`).slice(0, 2)
  withEnter(ctx, enter(timeMs, 850, 520), () => {
    ctx.fillStyle = '#fff'; ctx.font = `500 ${size}px Arial`; ctx.textAlign = 'center'
    lines.forEach((line, index) => ctx.fillText(line, width / 2, headlineBottom - lines.length * size * 1.04 + index * size * 1.04))
  })
  withEnter(ctx, enter(timeMs, 1050, 520), () => {
    for (const [index, score] of [slide.currentScore, slide.potentialScore].entries()) {
      const x = index === 0 ? shareCardLayout.inset * scale : width - shareCardLayout.inset * scale
      ctx.textAlign = index === 0 ? 'left' : 'right'
      ctx.font = `800 ${shareCardLayout.scoreSize * scale}px "Mogging Share", Arial`; ctx.fillStyle = index === 0 ? '#fff' : 'rgba(255,255,255,.8)'
      ctx.fillText(formatShareScore(score), x, valueY)
      ctx.font = `800 ${shareCardLayout.scoreLabelSize * scale}px "Mogging Share", Arial`; ctx.fillStyle = 'rgba(255,255,255,.86)'
      ctx.fillText(index === 0 ? 'TOTAL SCORE' : 'POTENTIAL', x, labelY)
    }
  })
}

let shareFont: Promise<void> | undefined
export function loadShareFont() {
  if (!shareFont) shareFont = new FontFace('Mogging Share', 'url(/fonts/Geist-Regular.ttf)').load().then(font => { document.fonts.add(font) }).catch(error => { shareFont = undefined; throw error })
  return shareFont
}

function drawMobileShare(ctx: CanvasRenderingContext2D, slide: ContentSlide, overlay: ReportOverlay | null, width: number, height: number, timeMs: number) {
  const scale = width / shareCardLayout.width
  for (const css of shareCardLayout.gradients) {
    const angle = Number(css.match(/(\d+)deg/)?.[1] ?? 180) * Math.PI / 180
    const dx = Math.sin(angle), dy = -Math.cos(angle), length = Math.abs(width * dx) + Math.abs(height * dy)
    const gradient = ctx.createLinearGradient(width / 2 - dx * length / 2, height / 2 - dy * length / 2, width / 2 + dx * length / 2, height / 2 + dy * length / 2)
    for (const match of css.matchAll(/(rgba\([^)]+\)) (\d+)%/g)) gradient.addColorStop(Number(match[2]) / 100, match[1])
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }
  if (overlay) drawShareOverallOverlay(ctx, overlay.primitives, width, timeMs)
  const top = shareCardLayout.headerTop * scale, inset = shareCardLayout.inset * scale
  const text = (value: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left', alpha = 1) => {
    ctx.textAlign = align; ctx.font = `800 ${size * scale}px "Mogging Share", Arial`; ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillText(value, x, y)
  }
  withEnter(ctx, enter(timeMs, 300, 480), () => {
    text('MOGGING.COM', inset, top, shareCardLayout.headingSize)
    text('FACIAL AESTHETIC', inset, top + 46 * scale, shareCardLayout.subheadingSize, 'left', .76)
    text('RANK', width - inset, top, shareCardLayout.headingSize, 'right')
    text(getLooksmaxRank(Number(slide.currentScore), 'other').toUpperCase(), width - inset, top + 46 * scale, shareCardLayout.subheadingSize, 'right', .76)
    const percent = slide.currentScore.trim() ? estimatedPopulationTopPercent(Number(slide.currentScore)) : null
    if (percent !== null) {
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = scale
      ctx.font = `800 ${28 * scale}px "Mogging Share", Arial`
      const pillWidth = ctx.measureText(`Top ${percent}%`).width + 32 * scale
      roundedRect(ctx, (width - pillWidth) / 2, 100 * scale, pillWidth, 82 * scale, 41 * scale); ctx.fill(); ctx.stroke()
      ctx.textBaseline = 'middle'
      text(`Top ${percent}%`, width / 2, 141 * scale, 28, 'center')
      ctx.textBaseline = 'top'
    }
  })
  const valueTop = height - height * .055 - shareCardLayout.scoreSize * scale
  withEnter(ctx, enter(timeMs, 1050, 520), () => {
    text('TOTAL SCORE', inset, valueTop - 43 * scale, shareCardLayout.scoreLabelSize)
    text(formatShareScore(slide.currentScore), inset - 8 * scale, valueTop, shareCardLayout.scoreSize)
    text('POTENTIAL', width - inset, valueTop - 43 * scale, shareCardLayout.scoreLabelSize, 'right')
    text(formatShareScore(slide.potentialScore), width - inset + 20 * scale, valueTop, shareCardLayout.scoreSize, 'right', .8)
  })
}

function formatShareScore(value: string) { return value.trim() && Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '--' }

function drawBrandPair(ctx: CanvasRenderingContext2D, brand: RevealBrand | null, width: number, height: number, timeMs: number) {
  withEnter(ctx, enter(timeMs, 420, 520), () => {
    const size = width * .085, gap = width * .025
    const x = (width - size * 2 - gap) / 2, y = height * .08
    if (brand) {
      ctx.drawImage(brand.logo, x, y, size, size)
      ctx.drawImage(brand.appStore, x + size + gap, y, size, size)
    }
  })
}

function withEnter(ctx: CanvasRenderingContext2D, progress: number, draw: () => void) { if (progress <= 0) return; ctx.save(); ctx.globalAlpha = progress; ctx.translate(0, (1 - progress) * 8); draw(); ctx.restore() }
type EasingCurve = [number, number, number, number]
function enter(timeMs: number, delay: number, duration: number, curve: EasingCurve = [0.23, 1, 0.32, 1]) { const value = Math.max(0, Math.min(1, (timeMs - delay) / duration)); return cubicBezierY(value, curve) }
function cubicBezierY(x: number, [x1, y1, x2, y2]: EasingCurve) { let t = x; for (let index = 0; index < 5; index += 1) { const currentX = bezier(t, x1, x2) - x, derivative = bezierDerivative(t, x1, x2); if (Math.abs(derivative) < 1e-6) break; t = Math.max(0, Math.min(1, t - currentX / derivative)) } return bezier(t, y1, y2) }
function bezier(t: number, p1: number, p2: number) { const inverse = 1 - t; return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t }
function bezierDerivative(t: number, p1: number, p2: number) { const inverse = 1 - t; return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2) }
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) { const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight), renderedWidth = image.naturalWidth * scale, renderedHeight = image.naturalHeight * scale; ctx.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight) }
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string) { ctx.font = font; const words = text.split(/\s+/), lines: string[] = []; let line = ''; words.forEach((word) => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word } else line = test }); if (line) lines.push(line); return lines.slice(0, 5) }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius) }
