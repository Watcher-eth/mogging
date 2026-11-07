import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const duration = 920
const dissolveDuration = 220
const easing = 'cubic-bezier(.22,.7,.15,1)'

type Portrait = {
  clip: DOMRect
  radius: string
  source: string
  x: number
  y: number
  width: number
  background: string
}

function measure(frame: HTMLElement): Portrait | null {
  const image = frame.querySelector('img')
  if (!image) return null
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return null
  const aspect = image.naturalWidth / image.naturalHeight
  const clip = frame.getBoundingClientRect()
  const box = image.getBoundingClientRect()
  if (!box.width || !box.height || !clip.width || !clip.height) return null
  const style = getComputedStyle(image)
  const fit = style.objectFit === 'contain' ? Math.min : Math.max
  const width = fit(box.width, box.height * aspect)
  const [left, top] = style.objectPosition.split(' ').map(value => parseFloat(value) / 100)
  return {
    clip,
    radius: getComputedStyle(frame).borderRadius,
    source: image.currentSrc || image.src,
    width,
    x: box.left - clip.left + (box.width - width) * (Number.isFinite(left) ? left : .5),
    y: box.top - clip.top + (box.height - width / aspect) * (Number.isFinite(top) ? top : .5),
    background: frame.dataset.scanPortrait === 'report' ? '#fff' : '#030303',
  }
}

function frameStyles({ clip, radius, background }: Portrait) {
  // Clip a fixed canvas so changing the frame never changes the image layout.
  const right = window.innerWidth - clip.right
  const bottom = window.innerHeight - clip.bottom
  return { clipPath: `inset(${clip.top}px ${right}px ${bottom}px ${clip.left}px round ${radius})`, backgroundColor: background }
}

function imageTransform(portrait: Portrait, start: Portrait) {
  const { clip, x, y, width } = portrait
  return `translate3d(${clip.left + x}px,${clip.top + y}px,0) scale(${width / start.width})`
}

export function usePortraitHandoff(root: RefObject<HTMLElement | null>, stage: string | null) {
  const previous = useRef<{ stage: string; portrait: Portrait } | null>(null)

  useBrowserLayoutEffect(() => {
    const host = root.current
    if (!host || !stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previous.current = null
      return
    }
    const from = previous.current
    const frame = () => host.querySelector<HTMLElement>(`[data-scan-portrait="${stage}"]`)
    let frameRequest = 0
    let fallbackTimer = 0
    let overlay: HTMLDivElement | undefined
    let destination: HTMLElement | undefined
    let moving = false
    let cancelled = false
    let measuredTarget: Portrait | null = null

    const remember = () => {
      const element = frame()
      const portrait = element && measure(element)
      if (portrait) previous.current = { stage, portrait }
    }

    function release() {
      window.clearTimeout(fallbackTimer)
      overlay?.remove()
      overlay = undefined
      destination?.removeAttribute('data-portrait-entering')
      destination = undefined
      moving = false
      remember()
    }

    function update() {
      const element = frame()
      if (!element || moving) return
      if (!from || from.stage === stage || !overlay) {
        remember()
        return
      }
      if (destination !== element) {
        destination?.removeAttribute('data-portrait-entering')
        destination = element
        element.dataset.portraitEntering = ''
      }
      const end = measure(element)
      if (!end) return
      // A loaded image can still change the destination layout on its next paint.
      if (!measuredTarget || frameStyles(measuredTarget).clipPath !== frameStyles(end).clipPath
        || imageTransform(measuredTarget, from.portrait) !== imageTransform(end, from.portrait)) {
        measuredTarget = end
        frameRequest = window.requestAnimationFrame(update)
        return
      }

      moving = true
      window.clearTimeout(fallbackTimer)
      const motionOptions = { duration, easing, fill: 'forwards' } as const
      const frameMotion = overlay.animate([frameStyles(from.portrait), frameStyles(end)], motionOptions)
      const imageMotion = overlay.firstElementChild?.animate([
        { transform: imageTransform(from.portrait, from.portrait) },
        { transform: imageTransform(end, from.portrait) },
      ], motionOptions)
      const startTime = document.timeline.currentTime
      frameMotion.startTime = startTime
      if (imageMotion) imageMotion.startTime = startTime
      const handoff = overlay
      void frameMotion.finished.then(async () => {
        if (cancelled || overlay !== handoff) return
        element.removeAttribute('data-portrait-entering')
        await handoff.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dissolveDuration, fill: 'forwards', easing }).finished
        if (!cancelled && overlay === handoff) release()
      }).catch(() => { if (!cancelled && overlay === handoff) release() })
    }

    if (from && from.stage !== stage && from.portrait.source) {
      const start = from.portrait
      overlay = document.createElement('div')
      overlay.className = 'scan-portrait-handoff'
      overlay.setAttribute('aria-hidden', 'true')
      Object.assign(overlay.style, frameStyles(start))
      const image = document.createElement('img')
      image.alt = ''
      image.src = start.source
      image.style.width = `${start.width}px`
      image.style.transform = imageTransform(start, start)
      overlay.append(image)
      document.body.append(overlay)
      fallbackTimer = window.setTimeout(release, 1600)
    }

    const schedule = () => {
      window.cancelAnimationFrame(frameRequest)
      frameRequest = window.requestAnimationFrame(update)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(host, { childList: true, subtree: true })
    host.addEventListener('load', schedule, true)
    const viewportChanged = () => {
      if (overlay) release()
      else schedule()
    }
    window.addEventListener('resize', viewportChanged)
    window.addEventListener('scroll', viewportChanged, { passive: true })
    host.addEventListener('pointerup', schedule)
    host.addEventListener('wheel', schedule, { passive: true })
    update()
    return () => {
      cancelled = true
      observer.disconnect()
      host.removeEventListener('load', schedule, true)
      window.removeEventListener('resize', viewportChanged)
      window.removeEventListener('scroll', viewportChanged)
      host.removeEventListener('pointerup', schedule)
      host.removeEventListener('wheel', schedule)
      window.cancelAnimationFrame(frameRequest)
      window.clearTimeout(fallbackTimer)
      overlay?.remove()
      destination?.removeAttribute('data-portrait-entering')
    }
  }, [root, stage])
}
