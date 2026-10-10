export type CreatorBrand = { logo: HTMLImageElement; appStore: HTMLImageElement }
let loading: Promise<CreatorBrand> | undefined
export function loadCreatorBrand() {
  return loading ??= Promise.all(['/favicon.png', '/app-store-icon.png'].map(src => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => { loading = undefined; reject(new Error('Creator branding could not be loaded')) }
    image.src = src
  }))).then(([logo, appStore]) => ({ logo, appStore }))
}

export function drawBrandLockup(ctx: CanvasRenderingContext2D, brand: CreatorBrand | null, x: number, y: number, width: number, ink = '#f4f5f3') {
  ctx.save()
  const size = width * .125, gap = width * .035
  ctx.font = `500 ${width * .071}px "Mogging Share", Arial, sans-serif`
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = ink
  const name = 'Mogging: Face Scan', nameWidth = ctx.measureText(name).width
  const total = nameWidth + size * 2 + gap * 2
  const left = x + (width - total) / 2
  if (brand) {
    for (const [index, icon] of [brand.logo, brand.appStore].entries()) {
      const iconX = index === 0 ? left : left + size + gap * 2 + nameWidth
      ctx.save(); ctx.beginPath(); ctx.roundRect(iconX, y, size, size, size * .24); ctx.clip()
      ctx.drawImage(icon, iconX, y, size, size); ctx.restore()
    }
  }
  ctx.fillText(name, left + size + gap, y + size / 2)
  ctx.restore()
}
