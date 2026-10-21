import type { ContentSlide } from './content-generator'
import { cutout } from './editorial-posters'

const subjects = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
let headlineFont: Promise<void> | undefined
export async function prepareGlamourImage(image: HTMLImageElement) {
  headlineFont ??= Promise.all([
    new FontFace('Glamour Headline', 'url(/fonts/ArchivoBlack-Regular.ttf)').load(),
    new FontFace('Glamour Signature', 'url(/fonts/GreatVibes-Regular.ttf)').load(),
  ]).then(fonts => { fonts.forEach(font => document.fonts.add(font)) })
    .catch(error => { headlineFont = undefined; throw error })
  const [, subject] = await Promise.all([headlineFont, cutout(image)])
  subjects.set(image, subject)
}

/** One composition for the live preview, PNG and animated export. */
export function drawGlamourGuidance(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, width: number, height: number, timeMs: number) {
  const scale = width / 1080, h = height / scale, compact = h < 1300
  const red = '#bc293b', green = '#269a46', ink = '#191917'
  const ease = (delay: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, (timeMs - delay) / 700)), 3)
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1080, h)
  ctx.textBaseline = 'middle'
  const text = (value: string, x: number, y: number, size: number, color = ink, bold = false, maxWidth = 960) => {
    const family = bold ? '"Glamour Headline", sans-serif' : '"Mogging Share", sans-serif'
    ctx.font = `400 ${size}px ${family}`
    const measured = ctx.measureText(value).width
    if (measured > maxWidth) ctx.font = `400 ${size * maxWidth / measured}px ${family}`
    ctx.fillStyle = color
    ctx.fillText(value, x, y)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, thickness = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = thickness
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
  }
  ctx.textAlign = 'left'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e9c7cc'
  ctx.font = '400 64px Georgia, serif'
  ctx.fillText('GG', 138, 45)
  ctx.fillStyle = ink
  ctx.font = '400 22px "Glamour Signature", cursive'
  ctx.fillText('Glamour Guidance', 138, 49)
  ctx.textAlign = 'right'
  text('MOGGING', 1016, 54, 19, ink, true)
  line(64, 83, 1016, 83, '#deded8')
  ctx.textAlign = 'center'
  ctx.globalAlpha = ease(0)
  text(slide.headline, 540, compact ? 140 : 168, compact ? 59 : 74, red, true)
  text('ATTRACTIVE?', 540, compact ? 214 : 263, compact ? 86 : 112, green, true)

  const top = compact ? 285 : 360, bottom = h - (compact ? 238 : 340)
  const photoHeight = bottom - top, photoWidth = Math.min(760, photoHeight * .90)
  // A quiet editorial halo sits behind the cutout, leaving the rest of the page white.
  ctx.globalAlpha = ease(140)
  ctx.fillStyle = '#f5e8e9'
  ctx.beginPath(); ctx.ellipse(540, top + photoHeight * .45, photoWidth * .48, photoHeight * .45, -.12, 0, Math.PI * 2); ctx.fill()
  if (image) {
    const subject = subjects.get(image) ?? image
    const ratio = Math.min(photoWidth / subject.width, photoHeight / subject.height)
    const w = subject.width * ratio, ph = subject.height * ratio
    ctx.save()
    ctx.beginPath(); ctx.rect(64, top - 12, 952, photoHeight + 12); ctx.clip()
    // A subtle colored paper edge retains her outlined-collage style.
    ctx.shadowColor = '#269a4640'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = -3
    ctx.drawImage(subject, (1080 - w) / 2, bottom - ph, w, ph)
    ctx.restore()
  }
  // Score labels flank the portrait; these are the creator's entered values, never invented.
  const scoreY = top + photoHeight * .55
  const score = (value: string, label: string, sx: number, color: string, delay: number) => {
    ctx.globalAlpha = ease(delay)
    ctx.textAlign = 'center'
    text(label, sx, scoreY - 78, compact ? 15 : 18, color, true, 230)
    text(value || '—', sx, scoreY, compact ? 65 : 91, color, true, 230)
    text('/ 10', sx, scoreY + 62, 23, '#777772')
    line(sx - 68, scoreY + 95, sx + 68, scoreY + 95, color, 2)
  }
  score(slide.currentScore, 'CURRENT', compact ? 154 : 159, red, 350)
  score(slide.potentialScore, 'POTENTIAL', compact ? 926 : 921, green, 500)
  ctx.globalAlpha = ease(650)
  ctx.textAlign = 'center'
  line(64, bottom, 1016, bottom, '#deded8')
  text('YOUR NEXT CHAPTER STARTS HERE.', 540, bottom + (compact ? 38 : 56), compact ? 25 : 32, ink, true)
  text(slide.supportingCopy, 540, bottom + (compact ? 77 : 112), compact ? 23 : 29, '#777772')
  const ctaY = h - (compact ? 100 : 140)
  ctx.fillStyle = red; ctx.fillRect(64, ctaY - 39, 952, 78)
  text(slide.cta, 540, ctaY, compact ? 32 : 38, '#ffffff', true, 890)
  text('MOGGING.COM', 540, h - (compact ? 30 : 49), 29, ink, true)
  ctx.restore()
}
