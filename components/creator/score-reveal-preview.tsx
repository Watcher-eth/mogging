import { useEffect, useRef, useState } from 'react'
import type { ContentSlide, GeneratorImage } from '@/lib/creator/content-generator'
import { createReportOverlay } from '@/lib/creator/report-overlay'
import { drawScoreReveal, loadRevealBrand, loadRevealImage, revealCategory, revealPotential, REVEAL_PORTRAIT_SIZE, REVEAL_SETTLED_MS } from '@/lib/creator/score-reveal'

export function ScoreRevealPreview({ slide, image, format }: { slide: ContentSlide; image?: GeneratorImage; format: { width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [replay, setReplay] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let disposed = false, frame = 0
    let observer: ResizeObserver | undefined
    let redraw: (() => void) | undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    setError(null)
    void Promise.all([image ? loadRevealImage(image.dataUrl) : null, loadRevealBrand()]).then(([portrait, brand]) => {
      if (disposed) return
      const overlay = image ? createReportOverlay(slide, image, { width: REVEAL_PORTRAIT_SIZE, height: REVEAL_PORTRAIT_SIZE }) : null
      const start = performance.now()
      redraw = () => {
        cancelAnimationFrame(frame)
        const bounds = canvas.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(bounds.width * dpr)
        canvas.height = Math.round(bounds.height * dpr)
        const draw = () => {
          const time = reduced.matches ? REVEAL_SETTLED_MS : Math.min(REVEAL_SETTLED_MS, performance.now() - start)
          drawScoreReveal(ctx, slide, portrait, overlay, brand, canvas.width, canvas.height, time)
          if (time < REVEAL_SETTLED_MS) frame = requestAnimationFrame(draw)
        }
        draw()
      }
      observer = new ResizeObserver(redraw)
      observer.observe(canvas)
      reduced.addEventListener('change', redraw)
      redraw()
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load the preview.')
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      if (redraw) reduced.removeEventListener('change', redraw)
    }
  }, [slide, image, replay])

  return <div>
    <div className="relative overflow-hidden bg-black" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
      <canvas ref={canvasRef} className="block size-full" role="img" aria-label={`Mogging ${slide.metricLabel} score reveal. Current ${revealCategory(slide)?.value || slide.currentScore}, potential ${revealPotential(slide)}. ${slide.categoryScores.map(score => `${score.label}: ${score.value}`).join('. ')}`} />
      {error ? <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">{error}</p> : null}
    </div>
    <button type="button" className="mt-2 min-h-11 w-full rounded-lg text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setReplay(value => value + 1)}>Replay reveal</button>
  </div>
}
