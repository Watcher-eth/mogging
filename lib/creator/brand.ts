export type CreatorBrand = { logo: HTMLCanvasElement; appStore: HTMLImageElement }
let loading: Promise<CreatorBrand> | undefined
export function loadCreatorBrand() {
  return loading ??= Promise.all(['/favicon.png', '/app-store-icon.png'].map(src => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => { loading = undefined; reject(new Error('Creator branding could not be loaded')) }
    image.src = src
  }))).then(([image, appStore]) => {
    const logo = document.createElement('canvas')
    logo.width = image.width; logo.height = image.height
    const ctx = logo.getContext('2d')!
    ctx.beginPath(); ctx.roundRect(0, 0, logo.width, logo.height, Math.min(logo.width, logo.height) * .2); ctx.clip(); ctx.drawImage(image, 0, 0)
    return { logo, appStore }
  })
}

export function brandLockupLayout(ctx: CanvasRenderingContext2D, width: number) {
  const size = width * .125, gap = width * .035, fontSize = width * .071
  const name = 'Mogging: Face Scan'
  ctx.save(); ctx.font = `500 ${fontSize}px "Mogging Share", Arial, sans-serif`
  const total = ctx.measureText(name).width + size * 2 + gap * 2
  ctx.restore()
  return { size, gap, fontSize, name, total, left: (width - total) / 2 }
}

export function drawBrandLockup(ctx: CanvasRenderingContext2D, brand: CreatorBrand | null, x: number, y: number, width: number, ink = '#f4f5f3') {
  const { size, gap, fontSize, name, total, left } = brandLockupLayout(ctx, width)
  ctx.save()
  ctx.font = `500 ${fontSize}px "Mogging Share", Arial, sans-serif`
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = ink
  if (brand) {
    for (const [index, icon] of [brand.logo, brand.appStore].entries()) {
      const iconX = x + left + (index === 0 ? 0 : total - size)
      ctx.save(); ctx.beginPath(); ctx.roundRect(iconX, y, size, size, size * .3); ctx.clip()
      ctx.drawImage(icon, iconX, y, size, size); ctx.restore()
    }
  }
  ctx.fillText(name, x + left + size + gap, y + size / 2)
  ctx.restore()
}

export function drawMoggingWatermark(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.save(); ctx.globalAlpha *= .1
  ctx.font = '500 28px "Mogging Share", Arial, sans-serif'
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = ink
  if (ink === '#fff') { ctx.shadowColor = '#0001'; ctx.shadowBlur = 4 }
  ctx.fillText('Mogging', 0, 18); ctx.restore()
}

export function drawScanInvitation(ctx: CanvasRenderingContext2D, brand: CreatorBrand | null, frame: { x: number; y: number; width: number; height: number }, ink = '#171717', scale = 1) {
  const text = 'Get your scan on Mogging.com', size = 40 * scale, gap = 12 * scale
  ctx.save(); ctx.font = `500 ${size}px "Mogging Share", Arial, sans-serif`
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  const width = ctx.measureText(text).width + (brand ? size + gap : 0), x = frame.x + (frame.width-width)/2
  ctx.fillStyle = ink === '#fff' ? '#12121470' : '#ffffffb3'
  ctx.beginPath(); ctx.roundRect(x-10,frame.y,width+20,frame.height,frame.height/2);ctx.fill()
  if (brand) { ctx.save();ctx.beginPath();ctx.roundRect(x,frame.y+(frame.height-size)/2,size,size,10);ctx.clip();ctx.drawImage(brand.logo,x,frame.y+(frame.height-size)/2,size,size);ctx.restore() }
  ctx.fillStyle = ink; ctx.fillText(text,x+(brand ? size+gap : 0),frame.y+frame.height/2)
  ctx.restore()
}

export function drawTemplateBrandRow(ctx: CanvasRenderingContext2D, brand: CreatorBrand | null, width: number, y: number, ink?: string) {
  drawBrandLockup(ctx, brand, width * .16, y, width * .68, ink)
}

export function drawTemplateInvitation(ctx: CanvasRenderingContext2D, brand: CreatorBrand | null, width: number, bottom: number, ink?: string) {
  const scale = width / 1316
  ctx.save()
  ctx.scale(scale, scale)
  drawScanInvitation(ctx, brand, { x: 0, y: bottom / scale - 112, width: 1316, height: 92 }, ink, 1.45)
  ctx.restore()
}
