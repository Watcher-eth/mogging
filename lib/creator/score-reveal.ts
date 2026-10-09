import { categoryScoreMax, type ContentSlide } from './content-generator'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'

// One timeline and composition for the live preview, still image, and video.
export const REVEAL_PORTRAIT_SIZE = 300
export const REVEAL_SETTLED_MS = 4000
export const REVEAL_DURATION_MS = 5000
const motion = { entrance: 460, ring: 1000, bar: 760, stagger: 85, rise: 12 }
const green = '#93d6be'
const cyan = '#86cfe9'

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
  const compact = height / width < 1.4
  const rowHeight = 128
  const panelTop = compact ? 684 : 790
  const panelHeight = rows ? rows * rowHeight + 44 : 0
  const contentHeight = panelTop + panelHeight + 24
  const scale = Math.min(width / 1000, height / (contentHeight + 100))
  ctx.save()
  ctx.fillStyle = '#050607'; ctx.fillRect(0, 0, width, height)
  ctx.translate((width - 900 * scale) / 2, (height - contentHeight * scale) / 2)
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'; ctx.lineCap = 'round'

  entrance(ctx, time, 80, () => {
    text(ctx, 'Mogging: Face Scan', 150, 24, 42, '#f4f5f3', 'left', 500)
    if (brand) {
      for (const [index, icon] of [brand.logo, brand.appStore].entries()) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(646 + index * 60, 0, 44, 44, 12); ctx.clip()
        ctx.drawImage(icon, 646 + index * 60, 0, 44, 44); ctx.restore()
      }
    }
    const category = revealCategory(slide)
    const label = (category?.label ?? slide.metricLabel).replace(/\s+(analysis|score)$/i, '')
    text(ctx, label.toUpperCase(), 450, 86, 23, '#9aaba8', 'center', 400)
  })

  entrance(ctx, time, 260, () => {
    const size = compact ? 260 : 320, x = (900 - size) / 2, y = 112
    ctx.save(); ctx.beginPath(); ctx.arc(450, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip()
    if (portrait) {
      const zoom = Math.max(size / portrait.naturalWidth, size / portrait.naturalHeight)
      ctx.drawImage(portrait, x + (size - portrait.naturalWidth * zoom) / 2, y + (size - portrait.naturalHeight * zoom) / 2, portrait.naturalWidth * zoom, portrait.naturalHeight * zoom)
    }
    if (overlay) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size / REVEAL_PORTRAIT_SIZE, size / REVEAL_PORTRAIT_SIZE)
      drawReportOverlay(ctx, { ...overlay, pointAppearance: 'minimal' }, REVEAL_PORTRAIT_SIZE, Math.max(0, time - 650), false)
      ctx.restore()
    }
    ctx.restore()
  })

  const category = revealCategory(slide), maximum = categoryScoreMax(slide.categoryId)
  const ringY = compact ? 542 : 648
  ring(ctx, category?.value || slide.currentScore, 'Current', 245, ringY, green, time, 1000, maximum)
  ring(ctx, revealPotential(slide), 'Potential', 655, ringY, cyan, time, 1160, maximum)

  if (rows) {
    stats.forEach((stat, index) => {
      const row = Math.floor(index / columns), cells = Math.min(columns, stats.length - row * columns)
      const barWidth = (600 - 32 * (cells - 1)) / cells
      const x = 150 + index % columns * (barWidth + 32)
      const y = panelTop + 34 + row * rowHeight
      const delay = 1650 + index * Math.min(motion.stagger, 600 / Math.max(1, stats.length))
      entrance(ctx, time, delay, () => {
        text(ctx, stat.label.toUpperCase(), x, y, 25, '#aeb9ba', 'left', 400, barWidth)
        text(ctx, stat.value.trim() || '—', x, y + 33, 34, '#f4f5f3', 'left', 500)
        text(ctx, `/ ${categoryScoreMax(stat.categoryId)}`, x + barWidth, y + 33, 22, '#829093', 'right')
        glassRail(ctx,x,y + 66,barWidth,ratio(stat.value,categoryScoreMax(stat.categoryId)) * ease(time,delay + 120,motion.bar))
      })
    })
  }
  ctx.restore()
}

function glassRail(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, progress: number) {
  ctx.save()
  ctx.fillStyle='#20272a'; ctx.beginPath(); ctx.roundRect(x,y - 5,width,10,5); ctx.fill()
  const gradient=ctx.createLinearGradient(x,y,x + width,y)
  gradient.addColorStop(0,'#e78179'); gradient.addColorStop(.32,'#e6b385'); gradient.addColorStop(.64,'#96c5aa'); gradient.addColorStop(1,'#80ccec')
  if (progress > 0) {
    ctx.strokeStyle=gradient; ctx.lineWidth=9; ctx.shadowColor='rgba(117,205,226,.3)'; ctx.shadowBlur=8
    ctx.beginPath(); ctx.moveTo(x + 5,y); ctx.lineTo(x + 5 + (width - 10) * progress,y); ctx.stroke()
  }
  ctx.shadowBlur=0
  const gloss=ctx.createLinearGradient(0,y - 5,0,y + 5)
  gloss.addColorStop(0,'rgba(255,255,255,.35)'); gloss.addColorStop(.65,'rgba(255,255,255,0)')
  ctx.fillStyle=gloss; ctx.beginPath(); ctx.roundRect(x,y - 5,width,10,5); ctx.fill()
  ctx.strokeStyle='rgba(255,255,255,.16)'; ctx.lineWidth=.7; ctx.stroke()
  if (progress > 0) {
    const px=x + 5 + (width - 10) * progress
    ctx.fillStyle='rgba(255,255,255,.65)'; ctx.strokeStyle='rgba(255,255,255,.8)'
    ctx.beginPath(); ctx.roundRect(px - 4,y - 9,8,18,4); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

function ring(ctx: CanvasRenderingContext2D, value: string, label: string, x: number, y: number, color: string, time: number, delay: number, maximum: number) {
  entrance(ctx, time, delay, () => {
    const progress=ease(time,delay,motion.ring), radius=87, portion=ratio(value,maximum) * progress
    text(ctx,label.toUpperCase(),x,y - 126,23,'#aeb9ba','center')
    const arc=(amount: number,stroke: string | CanvasGradient,lineWidth: number) => {
      ctx.strokeStyle=stroke; ctx.lineWidth=lineWidth
      ctx.beginPath(); ctx.arc(x,y,radius,-Math.PI / 2,-Math.PI / 2 + Math.PI * 2 * Math.max(.0001,amount)); ctx.stroke()
    }
    arc(1,'#252f32',12)
    const gradient=ctx.createLinearGradient(x - radius,y - radius,x + radius,y + radius)
    gradient.addColorStop(0,'#d1e5ce'); gradient.addColorStop(.5,color); gradient.addColorStop(1,'#66b7d7')
    ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=12; ctx.globalAlpha *= .28; arc(portion,gradient,16); ctx.restore()
    arc(portion,gradient,10)
    ctx.save(); ctx.translate(0,-1.5); arc(portion,'rgba(255,255,255,.65)',1.4); ctx.restore()
    if (portion > 0) {
      const angle=-Math.PI / 2 + Math.PI * 2 * portion, px=x + radius * Math.cos(angle), py=y + radius * Math.sin(angle)
      ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI * 2); ctx.fillStyle='rgba(255,255,255,.72)'; ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1; ctx.stroke()
    }
    const numeric=Number(value)
    text(ctx,value.trim() && Number.isFinite(numeric) ? (numeric * progress).toFixed(1) : '—',x,y - 7,64,'#f4f5f3','center',500)
    text(ctx,`/ ${maximum}`,x,y + 38,22,'#9aa9ac','center')
  })
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 400, maxWidth?: number) {
  ctx.font = `${weight} ${size}px "Mogging Share", Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align
  ctx.fillText(value, x, y, maxWidth)
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
