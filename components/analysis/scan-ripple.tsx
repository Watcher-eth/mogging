import { useEffect, useRef, type CSSProperties } from 'react'
import { waveTiming } from './scan-wave-motion'
import styles from './scan-ripple.module.css'

export function ScanRipple({ imageSrc, mode = 'photo', durationMs = mode === 'photo' ? waveTiming.photoMs : waveTiming.processingMs, imageRatio, fit = 'contain' }: {
  imageSrc: string
  mode?: 'photo' | 'processing'
  durationMs?: number
  imageRatio?: number
  fit?: 'contain' | 'cover'
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const surface = canvas.current
    if (!surface || !navigator.gpu) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let controller: AbortController | undefined
    let inView = false
    let played = false

    function update() {
      if (!inView || document.hidden || reduced.matches) {
        controller?.abort()
        controller = undefined
        surface!.dataset.backend = 'still'
        return
      }
      if (controller || played && mode === 'photo') return
      const request = new AbortController()
      controller = request
      void import('./scan-ripple-gpu').then(({ runScanRipple }) =>
        runScanRipple(surface!, imageSrc, fit, durationMs, mode === 'processing', request.signal, ready => {
          if (request.signal.aborted) return
          surface!.dataset.backend = ready ? 'webgpu' : 'still'
          if (ready) played = true
        })
      ).catch(() => { /* The original photo remains visible if the GPU is unavailable. */ })
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    observer.observe(surface)
    document.addEventListener('visibilitychange', update)
    reduced.addEventListener('change', update)
    return () => {
      controller?.abort()
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
      reduced.removeEventListener('change', update)
    }
  }, [durationMs, fit, imageSrc, mode])

  return <div className={styles.bounds} aria-hidden="true">
    <canvas ref={canvas} className={styles.ripple} data-scan-ripple={mode} data-backend="still"
      style={{ '--ripple-image-ratio': imageRatio } as CSSProperties} data-contain={imageRatio ? '' : undefined} />
  </div>
}
