type Point = { x: number; y: number }
type Frame = Point & { w: number; h: number }

/** A neutral prop follows the reveal edge, then leaves. It never edits the photograph. */
export function drawEditorialTool(ctx:CanvasRenderingContext2D,frame:{x:number;y:number;width:number;height:number},progress:number,kind:'brush'|'clipper',reduced=false,variant=0){
  if(reduced || progress<=0 || progress>=1)return
  const t=editorialEase(progress),matrix=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(matrix.a,matrix.b))
  ctx.save()
  ctx.globalAlpha*=editorialEase(progress/.18)*(1-editorialEase((progress-.8)/.2))
  const forward=variant%2?1-t:t,vertical=variant%3===1
  ctx.translate(frame.x+frame.width*(vertical?.5:forward),frame.y+frame.height*(vertical?forward:.5-Math.sin(Math.PI*t)*(.08+variant*.02)))
  ctx.rotate((vertical?Math.PI/2:0)-.2+Math.sin(Math.PI*t)*(.12+variant*.035));ctx.scale(unit,unit)
  if(kind==='clipper'){
    ctx.fillStyle='#f8f8f8';ctx.strokeStyle='#a4a4a4';ctx.lineWidth=1
    ctx.beginPath();ctx.roundRect(-18,-9,36,76,12);ctx.fill();ctx.stroke()
    const body=ctx.createLinearGradient(-18,0,18,0);body.addColorStop(0,'#e0e0e0');body.addColorStop(.5,'#fff');body.addColorStop(1,'#d6d6d6')
    ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(-14,5,28,55,8);ctx.fill()
    ctx.fillStyle='#b4b4b4';ctx.fillRect(-21,-14,42,12)
    ctx.strokeStyle='#777';for(let x=-19;x<=19;x+=4){ctx.beginPath();ctx.moveTo(x,-19);ctx.lineTo(x,-8);ctx.stroke()}
    ctx.fillStyle='#a3a3a3';ctx.beginPath();ctx.roundRect(-4,23,8,13,3);ctx.fill()
  }else{
    ctx.fillStyle='#d3d3d3';ctx.beginPath();ctx.roundRect(-8,6,16,66,7);ctx.fill()
    ctx.fillStyle='#a7a7a7';ctx.fillRect(-16,-3,32,16)
    ctx.fillStyle='#e6e6e6';ctx.beginPath();ctx.roundRect(-20,-28,40,28,[9,9,2,2]);ctx.fill()
    ctx.strokeStyle='#bbb';ctx.lineWidth=.8;for(let x=-16;x<=16;x+=5){ctx.beginPath();ctx.moveTo(x,-24);ctx.lineTo(x,-5);ctx.stroke()}
  }
  ctx.restore()
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
export const editorialEase = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Keep the original framing fixed while the edited layer moves across it. */
export function drawEditorialSplit(ctx: CanvasRenderingContext2D, frame: Frame, progress: number, drawEdit: () => void) {
  const amount = clamp(progress)
  if (amount === 0) return
  if (amount === 1) { drawEdit(); return }
  const edge = frame.x + frame.w * amount
  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.x, frame.y, edge - frame.x, frame.h)
  ctx.clip()
  drawEdit()
  ctx.restore()
  const fade = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h)
  fade.addColorStop(0, '#f9fff200')
  fade.addColorStop(.35, '#f9fff28c')
  fade.addColorStop(.65, '#f9fff28c')
  fade.addColorStop(1, '#f9fff200')
  ctx.save()
  ctx.strokeStyle = fade
  ctx.setLineDash([3, 7])
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(edge, frame.y)
  ctx.lineTo(edge, frame.y + frame.h)
  ctx.stroke()
  ctx.restore()
}

/** Bring a reference crop into the frame with a short rise and scale settle. */
export function drawEditorialInset(ctx: CanvasRenderingContext2D, frame: Frame, progress: number, drawContent: (frame: Frame) => void) {
  const t = editorialEase(progress)
  if (t === 0) return
  const edge = frame.x + frame.w * t
  const slant = Math.min(frame.h * .36, frame.w * (1 - t))
  ctx.save()
  ctx.globalAlpha *= Math.min(1, t * 3)
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 17)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(frame.x, frame.y)
  ctx.lineTo(edge + slant, frame.y)
  ctx.lineTo(edge, frame.y + frame.h)
  ctx.lineTo(frame.x, frame.y + frame.h)
  ctx.closePath()
  ctx.clip()
  drawContent(frame)
  ctx.restore()
}

const revealLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
const revealMasks = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()

/** Reveal a registered edit across the same portrait with a soft moving edge. */
export function drawEditorialFeatheredReveal(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, drawEdit: (target: CanvasRenderingContext2D) => void, rolling = false) {
  const amount = clamp(progress)
  if (amount <= 0) return
  if (amount >= 1) { drawEdit(ctx); return }
  let layer = revealLayers.get(ctx)
  if (!layer) {
    layer = document.createElement('canvas')
    revealLayers.set(ctx, layer)
  }
  if (layer.width !== width || layer.height !== height) {
    layer.width = width
    layer.height = height
  }
  const surface = layer.getContext('2d')!
  surface.clearRect(0, 0, width, height)
  drawEdit(surface)
  let mask = revealMasks.get(ctx)
  if (!mask) { mask = document.createElement('canvas'); revealMasks.set(ctx, mask) }
  if (mask.width !== width || mask.height !== height) { mask.width = width; mask.height = height }
  const ink = mask.getContext('2d')!
  ink.clearRect(0, 0, width, height)
  const feather = Math.min(width * .04, width * Math.min(amount, 1 - amount)), bands = rolling ? 48 : 1
  for (let band = 0; band < bands; band++) {
    const y = band / bands * height
    const edge = width * amount + (rolling ? Math.sin(band / bands * Math.PI) * width * .09 * Math.sin(amount * Math.PI) : 0)
    const gradient = ink.createLinearGradient(edge - feather, 0, edge + feather, 0)
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(1, '#fff0')
    ink.fillStyle = gradient; ink.fillRect(0, y, width, height / bands + 1)
  }
  surface.save(); surface.globalCompositeOperation = 'destination-in'; surface.drawImage(mask, 0, 0); surface.restore()
  ctx.drawImage(layer, 0, 0)
}

/** Draw a curved leader, then finish its arrowhead at the point of interest. */
export function drawEditorialLeader(ctx: CanvasRenderingContext2D, from: Point, bend: Point, to: Point, progress: number, unit: number) {
  const amount = clamp(progress)
  if (!amount) return
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  for (let i = 1; i <= 24; i++) {
    const t = i / 24 * amount, u = 1 - t
    ctx.lineTo(u * u * from.x + 2 * u * t * bend.x + t * t * to.x, u * u * from.y + 2 * u * t * bend.y + t * t * to.y)
  }
  if (amount > .85) {
    const angle = Math.atan2(to.y - bend.y, to.x - bend.x)
    const length = 13 * unit * editorialEase((amount - .85) / .15)
    for (const side of [-1, 1]) {
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - length * Math.cos(angle + side * .54), to.y - length * Math.sin(angle + side * .54))
    }
  }
  ctx.stroke()
}

/** An unnumbered rail tracks a visual reveal without implying a measurement. */
export function drawEditorialRevealRail(ctx: CanvasRenderingContext2D, center: Point, progress: number) {
  const width = 240
  const left = center.x - width / 2
  const cursor = left + clamp(progress) * width
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(41,50,59,.4)'
  ctx.beginPath()
  for (let index = 0; index <= 16; index++) {
    const x = left + width * index / 16
    const height = index % 4 === 0 ? 13 : 6
    ctx.moveTo(x, center.y - height / 2)
    ctx.lineTo(x, center.y + height / 2)
  }
  ctx.stroke()
  ctx.strokeStyle = '#303942'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cursor, center.y - 13)
  ctx.lineTo(cursor, center.y + 13)
  ctx.stroke()
  ctx.restore()
}

/** Short strokes follow the local direction of a detected contour. */
export function editorialHatchStrokes(points: readonly Point[], unit: number): Point[][] {
  const strokes: Point[][] = []
  let distance = 0
  let nextMark = 16 * unit
  for (let index = 1; index < points.length && strokes.length < 18; index++) {
    const a = points[index - 1], b = points[index]
    const dx = b.x - a.x, dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (!length) continue
    while (nextMark <= distance + length && strokes.length < 18) {
      const t = (nextMark - distance) / length
      const x = a.x + dx * t, y = a.y + dy * t
      const offset = (7 + strokes.length % 3 * 2) * unit
      strokes.push([{ x, y }, {
        x: x + (dx * .55 - dy) / length * offset,
        y: y + (dy * .55 + dx) / length * offset,
      }])
      nextMark += 17 * unit
    }
    distance += length
  }
  return strokes
}

/** A registered feature locator. Tick marks expand from the point of interest. */
export function drawEditorialLocator(ctx: CanvasRenderingContext2D, target: Point, axis: Point, progress: number) {
  const t = editorialEase(progress)
  if (!t) return
  const length = Math.hypot(axis.x, axis.y)
  if (length < 1) return
  const dx = axis.x / length, dy = axis.y / length
  ctx.save()
  ctx.globalAlpha *= t
  ctx.strokeStyle = 'rgba(250,252,255,.82)'
  ctx.shadowColor = 'rgba(23,31,40,.23)'
  ctx.shadowBlur = 5
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const side of [-1, 1]) for (let i = 1; i <= 3; i++) {
    const distance = (8 + i * 8) * t * side
    const x = target.x + dx * distance, y = target.y + dy * distance
    const tick = (i === 3 ? 9 : 4) * t
    ctx.moveTo(x - dy * tick, y + dx * tick)
    ctx.lineTo(x + dy * tick, y - dx * tick)
  }
  ctx.stroke()
  ctx.beginPath(); ctx.arc(target.x, target.y, 2.2 * t, 0, Math.PI * 2)
  ctx.fillStyle = '#f8fbff'; ctx.fill()
  ctx.restore()
}
