import { categoryScoreMax, type ContentSlide } from './content-generator'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'

// One timeline and composition for the live preview, still image, and video.
export const REVEAL_PORTRAIT_SIZE = 300
export const REVEAL_SETTLED_MS = 4000
export const REVEAL_DURATION_MS = 5000
const motion = { entrance: 460, ring: 1000, bar: 760, stagger: 85, rise: 12 }
const green = '#39dc89'
const cyan = '#39d5ed'

export function loadRevealImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load a score reveal image. Please try again.'))
    image.src = src
  })
}

export async function loadRevealBrand() {
  const [logo, appStore] = await Promise.all([loadRevealImage('/favicon.png'), loadRevealImage('/app-store-icon.png')])
  return { logo, appStore }
}

export type RevealBrand = Awaited<ReturnType<typeof loadRevealBrand>>

export function revealCategory(slide: ContentSlide) {
  return slide.categoryScores.find(score => score.categoryId === slide.categoryId)
}

export function revealPotential(slide: ContentSlide) {
  return categoryScoreMax(slide.categoryId) === 8 && slide.potentialScore.trim() ? (Number(slide.potentialScore) * .8).toFixed(1) : slide.potentialScore
}

export function drawScoreReveal(ctx: CanvasRenderingContext2D, slide: ContentSlide, portrait: HTMLImageElement | null, overlay: ReportOverlay | null, brand: RevealBrand | null, width: number, height: number, time: number) {
  const stats = slide.categoryScores
  const columns = stats.length > 8 ? 3 : 2
  const rows = Math.ceil(stats.length / columns)
  const panelHeight = rows ? rows * 112 + 48 : 0
  const panelTop = 918
  const contentHeight = panelTop + panelHeight + 168
  const scale = Math.min(width / 1000, height / (contentHeight + 120))
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.translate((width - 900 * scale) / 2, (height - contentHeight * scale) / 2)
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'
  ctx.lineCap = 'round'

  entrance(ctx, time, 80, () => {
    if (brand) {
      ctx.drawImage(brand.logo, 354, 0, 84, 84)
      ctx.drawImage(brand.appStore, 462, 0, 84, 84)
    }
    text(ctx, 'Mogging', 450, 154, 58, '#fff', 'center', 700)
  })

  entrance(ctx, time, 260, () => {
    const size = REVEAL_PORTRAIT_SIZE, x = (900 - size) / 2, y = 232
    ctx.save()
    ctx.beginPath(); ctx.arc(450, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip()
    if (portrait) {
      const zoom = Math.max(size / portrait.naturalWidth, size / portrait.naturalHeight)
      ctx.drawImage(portrait, x + (size - portrait.naturalWidth * zoom) / 2, y + (size - portrait.naturalHeight * zoom) / 2, portrait.naturalWidth * zoom, portrait.naturalHeight * zoom)
    }
    if (overlay) {
      ctx.save(); ctx.translate(x, y); drawReportOverlay(ctx, overlay, size, Math.max(0, time - 650), false); ctx.restore()
    }
    ctx.restore()
  })

  const category = revealCategory(slide)
  const label = category?.label ?? slide.metricLabel
  const maximum = categoryScoreMax(slide.categoryId)
  entrance(ctx, time, 850, () => text(ctx, /score$/i.test(label) ? label : `${label} score`, 450, 588, 32, '#fff', 'center', 600))
  ring(ctx, category?.value || slide.currentScore, 'Current', 315, 720, green, time, 1000, maximum)
  ring(ctx, revealPotential(slide), 'Potential', 585, 720, cyan, time, 1160, maximum)

  if (rows) {
    entrance(ctx, time, 1550, () => {
      ctx.fillStyle = '#111113'
      ctx.beginPath(); ctx.roundRect(35, panelTop, 830, panelHeight, 32); ctx.fill()
    })
    stats.forEach((stat, index) => {
      const cellWidth = 770 / columns
      const x = 65 + index % columns * cellWidth, y = panelTop + 44 + Math.floor(index / columns) * 112
      const barWidth = cellWidth - 36
      const delay = 1650 + index * Math.min(motion.stagger, 600 / Math.max(1, stats.length))
      entrance(ctx, time, delay, () => {
        text(ctx, stat.label.toUpperCase(), x, y, 19, '#a1a1aa', 'left', 400, barWidth)
        text(ctx, stat.value.trim() || '—', x, y + 32, 27, '#fff', 'left', 600)
        text(ctx, `/ ${categoryScoreMax(stat.categoryId)}`, x + barWidth, y + 32, 18, '#71717a', 'right')
        const progress = ease(time, delay + 120, motion.bar)
        line(ctx, x, y + 64, x + barWidth * progress, y + 64, '#29292d', 6)
        line(ctx, x, y + 64, x + barWidth * ratio(stat.value, categoryScoreMax(stat.categoryId)) * progress, y + 64, cyan, 6)
      })
    })
  }
  entrance(ctx, time, 2900, () => {
    text(ctx, 'Get your score on', 450, panelTop + panelHeight + 77, 28, '#d4d4d8', 'center', 500)
    text(ctx, 'mogging.com', 450, panelTop + panelHeight + 125, 44, '#fff', 'center', 700)
  })
  ctx.restore()
}

function ring(ctx: CanvasRenderingContext2D, value: string, label: string, x: number, y: number, color: string, time: number, delay: number, maximum: number) {
  entrance(ctx, time, delay, () => {
    const progress = ease(time, delay, motion.ring), radius = 77
    const arc = (portion: number, stroke: string) => {
      ctx.strokeStyle = stroke; ctx.lineWidth = 9
      ctx.beginPath(); ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.0001, portion)); ctx.stroke()
    }
    arc(progress, '#232327')
    arc(ratio(value, maximum) * progress, color)
    const numeric = Number(value)
    text(ctx, value.trim() && Number.isFinite(numeric) ? (numeric * progress).toFixed(1) : '—', x, y - 5, 49, '#fff', 'center', 600)
    text(ctx, `/ ${maximum}`, x, y + 32, 16, '#71717a', 'center')
    text(ctx, label, x, y + 111, 23, color, 'center', 500)
  })
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 400, maxWidth?: number) {
  ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align
  ctx.fillText(value, x, y, maxWidth)
}

function line(ctx: CanvasRenderingContext2D, x: number, y: number, endX: number, endY: number, color: string, width: number) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.max(x + .001, endX), endY); ctx.stroke()
}

function entrance(ctx: CanvasRenderingContext2D, time: number, delay: number, draw: () => void) {
  const progress = ease(time, delay, motion.entrance)
  if (!progress) return
  ctx.save(); ctx.globalAlpha *= progress; ctx.translate(0, (1 - progress) * motion.rise); draw(); ctx.restore()
}

function ease(time: number, delay: number, duration: number) {
  const progress = Math.max(0, Math.min(1, (time - delay) / duration))
  return 1 - (1 - progress) ** 3
}

function ratio(value: string, maximum = 10) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number / maximum)) : 0
}
