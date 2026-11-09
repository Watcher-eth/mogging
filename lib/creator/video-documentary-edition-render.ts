import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { sharedElementMotion, videoSize, type VideoFrame } from './video-layout'
import { drawVideoTextMorph } from './video-pill-morph'
import { editionForLayout, type DocumentaryLayout, type DocumentaryEdition } from './video-documentary-editions'
import { documentaryRoom } from './video-documentary-sets'
import { contactPrint, contourRelief, controlRoom, numberedSurvey, opticalBench, practicalLightVault, routeAtlas, routingBoard, type SurveyGeometry } from './video-documentary-graphics'
import type { SurveyPin } from './video-documentary-registration'
import { documentMat, fernFalloff, fernFont, fernGlass, fernPalette, fernType, fernWash, lightField } from './video-documentary-primitives'

const { width: W, height: H } = videoSize
const frame = (x: number, y: number, width: number, height: number): VideoFrame => ({ x, y, width, height })
const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function editionMotion(edition: DocumentaryEdition, age: number, duration: number, direction: number, reduced: boolean) {
  const t = clamp(age / Math.max(1, duration))
  const smooth = sharedElementMotion(t)
  const camera = {
    crane: { x: 58 * smooth, y: -55 * smooth, scale: 1 - .055 * smooth },
    dolly: { x: 24 * smooth, y: 14 * smooth, scale: 1 + .072 * smooth },
    rostrum: { x: 20 * t, y: 38 * smooth, scale: 1 + .038 * t },
    'snap-pan': { x: 96 * (1 - sharedElementMotion(age / 480)), y: 0, scale: 1 + .015 * smooth },
  }[edition.motion]
  return {
    x: reduced ? 0 : direction * camera.x,
    y: reduced ? 0 : camera.y,
    scale: reduced ? 1 : camera.scale,
    reveal: (delay: number, length: number) => reduced ? 1 : sharedElementMotion((age - delay) / length),
  }
}

// Raster work is prepared once from the source portrait, outside the draw loop.
export function graphitePortrait(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = pixels
  const luminance = new Float32Array(width * height)
  for (let i = 0; i < luminance.length; i++) luminance[i] = (data[i * 4] * .213 + data[i * 4 + 1] * .715 + data[i * 4 + 2] * .072) / 255
  for (let y = 1; y < height - 1; y++) {
    const feather = sharedElementMotion(y / (height * .085))
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const edges = Math.hypot(luminance[i + 1] - luminance[i - 1], luminance[i + width] - luminance[i - width])
      const grain = ((x * 73 + y * 151 + x * y * 3) % 17 - 8) * .005
      const shade = clamp((1 - luminance[i]) * .42 + edges * 1.2 + grain)
      const pixel = i * 4
      data[pixel] = 51
      data[pixel + 1] = 44
      data[pixel + 2] = 37
      data[pixel + 3] *= shade * feather
    }
  }
  // The transparent drawing is laid over the edition's paper stock.
  for (let x = 0; x < width; x++) {
    data[x * 4 + 3] = 0
    data[((height - 1) * width + x) * 4 + 3] = 0
  }
  for (let y = 0; y < height; y++) {
    data[y * width * 4 + 3] = 0
    data[(y * width + width - 1) * 4 + 3] = 0
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

type PhotoOptions = {
  zoom?: number; detail?: boolean; matte?: boolean; graphite?: boolean; guides?: boolean; focusY?: number
  keepHead?: boolean; drift?: number; secondary?: boolean; isolate?: boolean
  register?: (project: (point: NormalizedPoint) => NormalizedPoint | undefined) => void
}
export type EditionPhoto = (box: VideoFrame, options?: PhotoOptions) => NormalizedPoint | undefined
type LayoutProps = {
  layout: DocumentaryLayout
  name: string
  feature: string
  age: number
  duration: number
  direction: number
  index: number
  reduced: boolean
  dark: boolean
  paint: EditionPhoto
  geometry?: SurveyGeometry
  pins: SurveyPin[]
}

function label(ctx: CanvasRenderingContext2D, kicker: string, title: string, x: number, y: number, ink: string, quiet: string, progress: number, width: number) {
  ctx.save()
  ctx.globalAlpha *= progress
  fernType(ctx, kicker, x, y, 25, quiet, width)
  ctx.font = `600 63px ${fernFont}`
  ctx.fillStyle = ink
  drawVideoTextMorph(ctx, '', title, x, y + 75, progress, width)
  ctx.restore()
}

let reliefTexture: Path2D | undefined
function dottedRelief(ctx: CanvasRenderingContext2D, box: VideoFrame, color: string, offset: number) {
  ctx.save()
  if (!reliefTexture) {
    reliefTexture = new Path2D()
    for (let y = 0; y < 1200; y += 30) {
      for (let x = y % 60 === 0 ? 0 : 15; x < 1200; x += 30) {
        const r = 1.2 + (Math.sin(x * .015 + y * .012) + 1) * .95
        reliefTexture.moveTo(x + r, y)
        reliefTexture.arc(x, y, r, 0, Math.PI * 2)
      }
    }
  }
  ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip()
  ctx.translate(box.x + offset, box.y)
  ctx.globalAlpha *= .29
  ctx.fillStyle = color
  ctx.fill(reliefTexture)
  ctx.restore()
}

let paperTexture: Path2D | undefined
function paperGrain(ctx: CanvasRenderingContext2D, box: VideoFrame) {
  if (!paperTexture) {
    paperTexture = new Path2D()
    for (let i = 0; i < 1050; i++) {
      const x = (i * 2137) % 1009
      const y = (i * i * 719 + i * 67) % 1013
      paperTexture.rect(x, y, i % 5 === 0 ? 5 : 2, i % 7 === 0 ? 2 : 1)
    }
  }
  ctx.save()
  ctx.translate(box.x, box.y)
  ctx.scale(box.width / 1009, box.height / 1013)
  ctx.fillStyle = '#5a44301b'
  ctx.fill(paperTexture)
  ctx.restore()
}

export function drawEditionLayout(ctx: CanvasRenderingContext2D, props: LayoutProps) {
  const { layout, name, feature, age, duration, direction, reduced, dark, paint, index } = props
  const edition = editionForLayout(layout)
  const palette = fernPalette(dark, dark ? edition.dark : edition.light)
  const { ground, quiet, signal, ink } = palette
  const motion = editionMotion(edition, age, duration, direction, reduced)
  const { x, y, scale, reveal } = motion
  const sceneIndex = String(index + 1).padStart(2, '0')
  const head = index === 0 ? name : feature
  lightField(ctx, palette, x / 120)

  const graphics = { paint, palette, feature, x, scale, reveal }
  if (layout === 'relief-map') return props.geometry?.outline.length
    ? contourRelief(ctx, graphics, props.geometry.outline, props.geometry.paths)
    : opticalBench(ctx, graphics)
  if (layout === 'optical-bench') return opticalBench(ctx, graphics)
  if (layout === 'contact-print') return contactPrint(ctx, graphics)
  if (layout === 'routing-board') return routingBoard(ctx, graphics)
  if (layout === 'route-atlas') return props.geometry ? routeAtlas(ctx, graphics, props.geometry) : opticalBench(ctx, graphics)
  if (layout === 'control-room') return props.geometry ? controlRoom(ctx, graphics, props.geometry) : routingBoard(ctx, graphics)
  if (layout === 'light-vault') return practicalLightVault(ctx, graphics)
  if (layout === 'survey-markers') return numberedSurvey(ctx, graphics, props.pins)

  if (layout === 'survey-plane' || layout === 'survey-plot') {
    const plane = layout === 'survey-plane'
    const plot = frame(136, 788, 1044, 1110)
    dottedRelief(ctx, frame(90, 702, W - 180, 1140), quiet, x * .045)
    ctx.save()
    ctx.strokeStyle = palette.line; ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= 8; i++) {
      const tx = plot.x + i * plot.width / 8
      ctx.moveTo(tx, plot.y); ctx.lineTo(tx, plot.y + plot.height)
      const ty = plot.y + i * plot.height / 8
      ctx.moveTo(plot.x, ty); ctx.lineTo(plot.x + plot.width, ty)
    }
    ctx.stroke()
    if (plane) documentaryRoom(ctx, palette, x / 92)
    const photo = plane ? frame(86 + x, 835 + y, 876, 1150) : frame(145 + x * .22, 810 + y * .28, 1026, 1020)
    if (!plane) fernGlass(ctx, photo, palette, 22)
    const point = paint(photo, { zoom: plane ? scale : scale * 1.12, matte: true, keepHead: plane, detail: !plane, guides: !plane, focusY: .42 })
    if (point && point.x > photo.x && point.x < photo.x + photo.width && point.y > photo.y && point.y < photo.y + photo.height) {
      const position = reveal(260, 680), stop = point.x < W / 2 ? 1124 : 192
      const line = stop - point.x
      ctx.strokeStyle = signal; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x + line * position, point.y); ctx.stroke()
      ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2); ctx.stroke()
      ctx.save()
      ctx.globalAlpha *= position
      const tag = point.x < W / 2 ? 958 : 182
      ctx.fillStyle = ground; ctx.fillRect(tag - 10, point.y - 53, 164, 35)
      fernType(ctx, 'FEATURE', tag, point.y - 28, 23, signal, 143)
      ctx.restore()
    }
    ctx.restore()
    if (plane) fernFalloff(ctx, ground, photo.y + photo.height - 245, photo.y + photo.height + 75)
    const code = `LANDMARK SURVEY  /  ${sceneIndex}`
    const trace = reveal(80, 390)
    fernType(ctx, code.slice(0, Math.floor(code.length * trace)), 152, 648, 25, signal)
    ctx.font = `600 59px ${fernFont}`; ctx.fillStyle = ink
    ctx.fillText(head, 152, 723, 984)
    fernType(ctx, plane ? 'PORTRAIT REFERENCE' : 'REGISTERED FEATURE VIEW', 152, 1890, 28, quiet)
    return
  }

  if (layout === 'rim-stage' || layout === 'interview') {
    const studio = layout === 'rim-stage'
    const top = studio ? 630 + y : 661
    const hero = frame(0, top, W, H - top)
    if (!studio) {
      ctx.save(); ctx.filter = 'blur(36px)'; ctx.globalAlpha *= .33
      paint(frame(-54 - x, 701, W + 108, 1260), { zoom: 1.12, keepHead: true, secondary: true })
      ctx.restore()
    }
    fernWash(ctx, signal, 450, H, dark ? .10 : .05)
    ctx.save()
    if (studio) { ctx.shadowColor = signal + (dark ? '9c' : '54'); ctx.shadowBlur = 24; ctx.shadowOffsetX = direction * 11 }
    paint(hero, { zoom: scale, matte: true, keepHead: true, drift: studio ? x : 68 + x })
    ctx.restore()
    fernFalloff(ctx, ground, 1910, 2270)
    const show = reveal(230, 440)
    ctx.fillStyle = signal; ctx.fillRect(144, studio ? 1755 : 1824, 4, 118 * show)
    label(ctx, studio ? 'RECONSTRUCTION' : 'PORTRAIT STUDY', head, 172, studio ? 1790 : 1858, ink, quiet, show, 955)
    return
  }

  if (layout === 'graphite' || layout === 'archive-desk') {
    const drawing = layout === 'graphite'
    const box = drawing ? frame(0, 610, W, 1405) : frame(181 + x, 725 + y, 968, 1115)
    ctx.save()
    if (!drawing) {
      ctx.translate(W / 2, 1250); ctx.rotate(.065 * (1 - reveal(0, 720) * .45)); ctx.translate(-W / 2, -1250)
    }
    if (drawing) fernWash(ctx, palette.paper, 400, H, dark ? .88 : .64)
    else {
      documentMat(ctx, frame(box.x - 32, box.y + 49, box.width + 16, box.height + 15), '#ad9c83', 4)
      documentMat(ctx, box, palette.paper, 4)
      paperGrain(ctx, box)
    }
    const plate = drawing ? frame(0, box.y + 155, W, H - box.y - 155) : frame(box.x + 42, box.y + 190, 668, 745)
    if (!drawing) { ctx.fillStyle = '#d4ccba'; ctx.fillRect(plate.x - 5, plate.y - 5, plate.width + 10, plate.height + 10) }
    paint(plate, { zoom: scale, graphite: drawing, keepHead: true })
    if (drawing) fernFalloff(ctx, ground, 1860, 2240)
    if (!drawing) {
      const detail = frame(box.x + 688, box.y + 547 + (1 - reveal(220, 440)) * 36, 236, 302)
      documentMat(ctx, detail, '#d8cfbe', 2)
      paint(detail, { zoom: 2.35, detail: true, guides: true, focusY: .52, secondary: true })
      fernType(ctx, 'DETAIL', detail.x, detail.y + detail.height + 42, 24, '#554937', detail.width)
    }
    const amount = reveal(150, 640)
    ctx.save()
    const textX = drawing ? 148 : box.x + 44
    ctx.beginPath(); ctx.rect(textX, box.y + 28, box.width - 84, 151); ctx.clip()
    if (!drawing) fernType(ctx, `EVIDENCE FILE  /  ${sceneIndex}`, textX, box.y + 68, 27, '#6f5944', 900)
    ctx.font = `600 60px ${fernFont}`; ctx.fillStyle = '#2a2922'
    const letters = Array.from(head)
    const typed = letters.slice(0, Math.ceil(letters.length * amount)).join('')
    ctx.fillText(typed, textX, box.y + 145, 888)
    if (amount > 0 && amount < 1) {
      ctx.fillStyle = '#815f40'
      ctx.fillRect(textX + 9 + Math.min(875, ctx.measureText(typed).width), box.y + 103, 3, 46)
    }
    ctx.restore()
    if (!drawing) {
      ctx.strokeStyle = '#80694975'; ctx.lineWidth = 2
      ctx.strokeRect(box.x + 44, box.y + 969, 278, 63)
      fernType(ctx, 'SOURCE PORTRAIT', box.x + 60, box.y + 1008, 24, '#4c4235', 255)
    }
    ctx.restore()
    return
  }

  const profile = layout === 'signal-profile'
  const panel = profile ? frame(0, 672, W, 1175) : frame(104 + x, 743, 1108, 1050)
  if (profile) fernWash(ctx, palette.light, 480, H, dark ? .25 : .19)
  else fernGlass(ctx, panel, palette, 29)
  const key = reveal(170, 430)
  if (!profile) {
    const track = ctx.createLinearGradient(panel.x, 0, panel.x + panel.width, 0)
    track.addColorStop(0, signal + '00'); track.addColorStop(.5, signal + '25'); track.addColorStop(1, signal + '00')
    ctx.fillStyle = track; ctx.fillRect(panel.x + 34, panel.y + 166, panel.width - 68, 128)
  }
  ctx.fillStyle = signal
  const titleX = profile ? 386 + x : panel.x + 46
  ctx.fillRect(titleX, panel.y + 168, 216 * key, 3)
  label(ctx, profile ? 'SOURCE PROFILE' : `FRAME INDEX  /  ${sceneIndex}`, head, titleX, panel.y + 62, ink, quiet, key, W - titleX - 130)
  if (profile) {
    const avatar = frame(153 + x, panel.y + 28, 164, 164)
    ctx.save()
    ctx.beginPath(); ctx.arc(avatar.x + 82, avatar.y + 82, 82, 0, Math.PI * 2); ctx.clip()
    paint(avatar, { zoom: 1.7, focusY: .42, secondary: true })
    ctx.restore()
    const photo = frame(0, panel.y + 233, W, H - panel.y - 233)
    paint(photo, { zoom: scale, keepHead: true, matte: true })
    fernFalloff(ctx, ground, 1900, 2270)
  } else {
    const primary = frame(panel.x + 46, panel.y + 213, 574, 735)
    const secondary = frame(panel.x + 641, panel.y + 213 + (1 - key) * 50, 420, 495)
    paint(primary, { zoom: scale, keepHead: true })
    paint(secondary, { zoom: 2.5, detail: true, guides: true, focusY: .48, secondary: true })
    ctx.strokeStyle = palette.line; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(secondary.x, panel.y + 798); ctx.lineTo(secondary.x + secondary.width, panel.y + 798); ctx.stroke()
    fernType(ctx, 'FEATURE DETAIL', secondary.x, panel.y + 766, 28, quiet, secondary.width)
  }
  fernType(ctx, 'PHOTO EVIDENCE', profile ? 151 : panel.x + 46, panel.y + panel.height - 39, 25, quiet)
}

type EditionCut = DocumentaryEdition['cut'] | 'phosphor' | 'light-gate'
export const editionCutDuration: Record<EditionCut, number> = { contour: 570, foreground: 455, paper: 510, panel: 320, phosphor: 560, 'light-gate': 620 }

export function editionCutFor(layout: DocumentaryLayout): EditionCut {
  if (layout === 'control-room' || layout === 'route-atlas') return 'phosphor'
  if (layout === 'light-vault') return 'light-gate'
  return editionForLayout(layout).cut
}

function opticalCutEdge(cut: 'phosphor' | 'light-gate', progress: number, direction: number) {
  return cut === 'phosphor' ? (H + 224) * progress - 112 : (W + 384) * (direction > 0 ? progress : 1 - progress) - 192
}

// The light crosses above the two layouts, leaving their shared portrait geometry intact.
export function drawEditionCutLight(ctx: CanvasRenderingContext2D, cut: EditionCut, progress: number, direction: number) {
  if ((cut !== 'phosphor' && cut !== 'light-gate') || progress <= 0 || progress >= 1) return
  const edge = opticalCutEdge(cut, progress, direction)
  ctx.save()
  if (cut === 'phosphor') {
    const beam = ctx.createLinearGradient(0, edge - 98, 0, edge + 72)
    beam.addColorStop(0, '#cde9d400'); beam.addColorStop(.55, '#cde9d43b')
    beam.addColorStop(.59, '#ecf9e88f'); beam.addColorStop(.65, '#d6eee74a'); beam.addColorStop(1, '#d6eee700')
    ctx.fillStyle = beam; ctx.fillRect(0, edge - 98, W, 170)
  } else {
    ctx.transform(1, 0, -.065 * direction, 1, 0, 0)
    const blade = ctx.createLinearGradient(edge - 138, 0, edge + 138, 0)
    blade.addColorStop(0, '#13212600'); blade.addColorStop(.42, '#15242a74')
    blade.addColorStop(.53, '#c8e3e66b'); blade.addColorStop(.68, '#e9f2ec30'); blade.addColorStop(1, '#d3eee800')
    ctx.fillStyle = blade; ctx.fillRect(edge - 138, 0, 276, H)
  }
  ctx.restore()
}

export function drawEditionCut(ctx: CanvasRenderingContext2D, cut: EditionCut, raw: number, direction: number, previous: () => void, next: () => void) {
  if (raw >= 1) { next(); return }
  const t = sharedElementMotion(raw)
  previous()
  ctx.save()
  if (cut === 'paper') {
    ctx.globalAlpha *= t
    next()
  } else if (cut === 'panel') {
    ctx.translate(direction * (1 - t) * W, 0)
    next()
  } else if (cut === 'phosphor' || cut === 'light-gate') {
    const edge = opticalCutEdge(cut, t, direction)
    ctx.beginPath()
    if (cut === 'phosphor') ctx.rect(0, 0, W, Math.max(0, edge))
    else if (direction > 0) {
      ctx.moveTo(0, 0); ctx.lineTo(edge, 0); ctx.lineTo(edge - .065 * H, H); ctx.lineTo(0, H)
    } else {
      ctx.moveTo(W, 0); ctx.lineTo(edge, 0); ctx.lineTo(edge + .065 * H, H); ctx.lineTo(W, H)
    }
    ctx.clip()
    next()
  } else {
    const edge = W * t * 1.19 - W * .095
    const diagonal = cut === 'contour' ? 116 : 68
    const orient = (x: number) => direction === 1 ? x : W - x
    ctx.beginPath(); ctx.moveTo(orient(0), 0); ctx.lineTo(orient(edge + diagonal), 0)
    ctx.lineTo(orient(edge - diagonal), H); ctx.lineTo(orient(0), H); ctx.closePath(); ctx.clip()
    next()
    const shade = ctx.createLinearGradient(orient(edge - 175), 0, orient(edge + diagonal), 0)
    shade.addColorStop(0, '#18181700')
    shade.addColorStop(1, cut === 'foreground' ? '#171614e8' : '#9e764d62')
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)
  }
  ctx.restore()
  drawEditionCutLight(ctx, cut, t, direction)
}
