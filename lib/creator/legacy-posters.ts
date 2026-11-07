import { drawTemplateBrandRow, drawTemplateInvitation, type CreatorBrand } from './brand'
import { categoryScoreMax, type ContentSlide, type GeneratorImage } from './content-generator'
import { ctaFaceTreatment, drawFaceTreatment } from './face-treatment'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'
import { drawPortraitProgressiveBlur, reportPortraitProjection } from './report-portrait'
import { preparePortraitPrint } from './editorial-posters'
import { portraitSubject, preparePortrait } from './video-portrait'
import { drawPortraitMetricPill } from './portrait-metric'
import { elementEntrance, videoMotion } from './video-layout'

const coverArtwork = new WeakMap<HTMLImageElement, { canvas: HTMLCanvasElement; headTop?: number }>()

export async function prepareCoverArtwork(slide: ContentSlide, image: HTMLImageElement, source: GeneratorImage) {
  if (slide.templateId === 'editorial') {
    const portrait = await preparePortrait(image, source).catch(() => null)
    if (portrait) coverArtwork.set(image, portrait)
    return
  }
  if (slide.templateId !== 'performance' && slide.templateId !== 'score-potential') return
  const subject = slide.templateId === 'performance' ? await portraitSubject(image, source).catch(() => image) : image
  const artwork = await preparePortraitPrint(subject, 'graphite').catch(() => subject)
  if (artwork instanceof HTMLCanvasElement) coverArtwork.set(image, { canvas: artwork })
}

export function styledCoverViewport(slide: ContentSlide, width: number, height: number) {
  return { width, height: height * (slide.templateId === 'performance' ? .84 : slide.templateId === 'editorial' ? .82 : 1) }
}

function drawStyledCover(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement, overlay: ReportOverlay | null, width: number, height: number, time: number, brand: CreatorBrand | null) {
  const performance = slide.templateId === 'performance'
  const paper = performance ? '#121212' : '#fff'
  const ink = performance ? '#fff' : '#25221e'
  const artwork = coverArtwork.get(image)
  const inset = width * .07
  const progress = elementEntrance(time, 150, 1380)
  const pan = elementEntrance(time, 0, 1750)
  const zoom = performance ? 1.04 + .035 * pan : .96 + .02 * pan
  const travel = width * (performance ? .024 : -.016)
  const panX = width * .5 * (1 - zoom) + travel * (pan - .5)
  const top = height * (performance ? .16 : .20)
  const portraitTop = top + height * .012 * (1 - pan)
  const feature = slide.categoryScores.find(score => score.categoryId === slide.categoryId)
  const label = feature?.label || slide.metricLabel
  const { width: photoWidth, height: photoHeight } = styledCoverViewport(slide, width, height)
  const photo = reportPortraitProjection({ width: image.naturalWidth, height: image.naturalHeight }, { width: photoWidth, height: photoHeight })

  ctx.save()
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, width, height)
  if (!performance) {
    ctx.save()
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const title = label.toUpperCase()
    const available = width - inset * 2
    const shortTitle = title.length <= 3
    const preferredSize = width * (shortTitle ? .28 : .26)
    ctx.font = `900 ${preferredSize}px Arial, sans-serif`
    const naturalWidth = ctx.measureText(title).width
    const fontSize = preferredSize * Math.min(1, available / Math.max(1, naturalWidth))
    ctx.font = `900 ${fontSize}px Arial, sans-serif`
    const metrics = ctx.measureText(title)
    const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    const headY = portraitTop + (artwork?.headTop ?? 0) * photo.scale * zoom
    ctx.fillText(title, width / 2, headY + glyphHeight * (shortTitle ? .49 : .32) - metrics.actualBoundingBoxDescent, available)
    ctx.restore()
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, top, photoWidth, photoHeight)
  ctx.clip()
  // Keep the source's upper edge and shift registered overlays with it.
  ctx.translate(panX, portraitTop)
  ctx.scale(zoom, zoom)
  ctx.translate(0, -photo.offsetY)
  if (performance) ctx.filter = 'grayscale(.55) contrast(1.08) brightness(.93)'
  ctx.drawImage(artwork?.canvas ?? image, photo.offsetX, photo.offsetY, photo.renderedWidth, photo.renderedHeight)
  ctx.filter = 'none'
  if (overlay) {
    ctx.translate(photo.offsetX, photo.offsetY)
    if (overlay.useReportPrimitives || (!performance && slide.overlayStyle === 'face-map' && !overlay.skinNetwork)) {
      drawReportOverlay(ctx, overlay, photo.renderedWidth, time * 1.5, false)
    } else {
      drawFaceTreatment(ctx, overlay, photo.renderedWidth, time, false, progress, ctaFaceTreatment(slide.categoryId, width))
    }
  }
  ctx.restore()

  if (performance) {
    const fade = ctx.createLinearGradient(0, height * .67, 0, height * .98)
    fade.addColorStop(0, '#12121200')
    fade.addColorStop(1, paper)
    ctx.fillStyle = fade
    ctx.fillRect(0, height * .67, width, height * .33)
  } else {
    const fade = ctx.createLinearGradient(0, height * .73, 0, height * .93)
    fade.addColorStop(0, '#fff0')
    fade.addColorStop(1, '#fff')
    ctx.fillStyle = fade
    ctx.fillRect(0, height * .73, width, height * .27)
  }

  if (performance && overlay) {
    const points = overlay.primitives.flatMap(primitive => {
      if (primitive.kind === 'polyline' || primitive.kind === 'region') return primitive.pixelPoints
      if (primitive.kind === 'line') return [primitive.fromPoint, primitive.toPoint]
      if (primitive.kind === 'point') return [primitive.point]
      return []
    })
    const score = Number((slide.categoryId === 'overall' ? slide.currentScore : feature?.value)?.trim())
    const maximum = categoryScoreMax(slide.categoryId)
    if (points.length && Number.isFinite(score) && score >= 0 && score <= maximum) {
      const scale = photo.renderedWidth / overlay.size.width
      const centerX = (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2
      const bottom = Math.max(...points.map(point => point.y))
      drawPortraitMetricPill(ctx, {
        metric: { label, value: score, unit: maximum === 8 ? '/8' : '/10', basis: 'assessment', imageId: slide.imageId ?? slide.id },
        chin: { x: panX + (photo.offsetX + centerX * scale) * zoom, y: portraitTop + bottom * scale * zoom },
        opacity: progress,
      })
    }
  }

  const jaw = overlay?.primitives.find(primitive => primitive.id === 'feature-jawline')
  const jawBottom = slide.categoryId === 'jaw' && overlay && jaw?.kind === 'polyline'
    ? portraitTop + Math.max(...jaw.pixelPoints.map(point => point.y)) * photo.renderedWidth / overlay.size.width * zoom
    : 0
  ctx.fillStyle = ink
  ctx.textBaseline = 'top'
  const reveal = elementEntrance(time, 690, videoMotion.portraitEnterMs)
  if (performance) {
    ctx.globalAlpha = reveal
    const preferredSize = width * .105
    ctx.font = `500 ${preferredSize}px "Mogging Share", Arial, sans-serif`
    const fontSize = preferredSize * Math.min(1, (width - inset * 2) / Math.max(1, ctx.measureText(label).width))
    ctx.font = `500 ${fontSize}px "Mogging Share", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(label, width / 2, height * .81 + width * .02 * (1 - reveal))
    ctx.globalAlpha = 1
    const percent = Number(slide.topPercent)
    if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
      drawPortraitMetricPill(ctx, {
        metric: { label, value: percent, unit: '%', basis: 'assessment', imageId: slide.imageId ?? slide.id },
        chin: { x: width * .5, y: Math.max(height * .66, jawBottom) },
        opacity: reveal,
      }, false, undefined, `Top ${percent}%`)
    }
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  } else {
    const score = (slide.categoryId === 'overall' ? slide.currentScore : feature?.value)?.trim()
    const maximum = categoryScoreMax(slide.categoryId)
    const value = score ? Number(score) : NaN
    if (Number.isFinite(value) && value >= 0 && value <= maximum) {
      drawPortraitMetricPill(ctx, {
        metric: { label, value, unit: maximum === 8 ? '/8' : '/10', basis: 'assessment', imageId: slide.imageId ?? slide.id },
        chin: { x: width * .5, y: Math.max(height * .69, jawBottom) + width * .035 * (1 - reveal) },
        opacity: reveal,
      })
    }
  }
  drawTemplateBrandRow(ctx, brand, width, height * .04, ink)
  drawTemplateInvitation(ctx, brand, width, height, ink)
  ctx.restore()
}

export function drawPortraitCover(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, brand: CreatorBrand | null) {
  if (image && (slide.templateId === 'performance' || slide.templateId === 'editorial')) {
    drawStyledCover(ctx, slide, image, overlay, width, height, time, brand)
    return
  }
  const inset = width * .065
  const camera = elementEntrance(time, 0, 1550)
  const zoom = 1 + camera * .035
  ctx.save()
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, width, height)
  const frame = image ? reportPortraitProjection({ width: image.naturalWidth, height: image.naturalHeight }, { width, height }) : null
  if (image && frame) {
    ctx.save()
    ctx.translate(width * .5 * (1 - zoom), height * .42 * (1 - zoom))
    ctx.scale(zoom, zoom)
    ctx.drawImage(coverArtwork.get(image)?.canvas ?? image, frame.offsetX, frame.offsetY, frame.renderedWidth, frame.renderedHeight)
    ctx.restore()
    drawPortraitProgressiveBlur(ctx, width, height, .31)
  }

  const shade = ctx.createLinearGradient(0, 0, 0, height)
  shade.addColorStop(0, '#111b')
  shade.addColorStop(.27, '#1110')
  shade.addColorStop(.61, '#1110')
  shade.addColorStop(1, '#111')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, height)

  if (overlay && frame) {
    ctx.save()
    ctx.translate(width * .5 * (1 - zoom), height * .42 * (1 - zoom))
    ctx.scale(zoom, zoom)
    ctx.translate(frame.offsetX, frame.offsetY)
    if (overlay.useReportPrimitives || (slide.overlayStyle === 'face-map' && !overlay.skinNetwork)) drawReportOverlay(ctx, overlay, frame.renderedWidth, time * 1.5, false)
    else drawFaceTreatment(ctx, overlay, frame.renderedWidth, time, false, 1, ctaFaceTreatment(slide.categoryId, width))
    ctx.restore()
  }

  ctx.textBaseline = 'top'

  const entrance = elementEntrance(time, 290, videoMotion.portraitEnterMs)
  ctx.save()
  ctx.globalAlpha = entrance
  ctx.translate(0, width * .022 * (1 - entrance))
  const scores = [slide.currentScore, slide.potentialScore]
  scores.forEach((score, index) => {
    const x = index ? width - inset : inset
    ctx.textAlign = index ? 'right' : 'left'
    ctx.fillStyle = '#fff'
    ctx.font = `500 ${width * .128}px "Mogging Share", Arial`
    ctx.fillText(score.trim() || '—', x, height - width * .27, width * .42)
    ctx.fillStyle = '#ffffff99'
    ctx.font = `500 ${width * .024}px "Mogging Share", Arial`
    if (score.trim()) ctx.fillText(index ? 'Potential' : 'Score', x, height - width * .135)
  })
  ctx.restore()
  drawTemplateBrandRow(ctx, brand, width, height * .04)
  drawTemplateInvitation(ctx, brand, width, height, '#fff')
  ctx.restore()
}

let shareFont: Promise<void> | undefined
export function loadShareFont() {
  if (!shareFont) shareFont = new FontFace('Mogging Share', 'url(/fonts/Geist-Regular.ttf)').load().then(font => { document.fonts.add(font) }).catch(error => { shareFont = undefined; throw error })
  return shareFont
}
