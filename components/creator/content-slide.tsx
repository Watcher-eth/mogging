import { useEffect, useRef, useState } from 'react'
import type { ContentSlide, GeneratorImage } from '@/lib/creator/content-generator'
import { prepareCanvas, drawSlideFrame } from '@/lib/creator/export-slides'

export function ContentSlidePreview({ slide, images, format }: { slide: ContentSlide; images: GeneratorImage[]; format: { width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [replay, setReplay] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let disposed = false, frame = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let draw: (() => void) | undefined
    setError(null)
    void prepareCanvas({ slide, images, ...format }).then(prepared => {
      if (disposed) return
      canvas.width = format.width
      canvas.height = format.height
      const start = performance.now()
      draw = () => {
        cancelAnimationFrame(frame)
        if (document.hidden) return
        const time = reduced.matches ? 4000 : slide.templateId === 'mock-report' ? performance.now() - start : Math.min(4000, performance.now() - start)
        drawSlideFrame(ctx, slide, prepared.image, prepared.overlay, format.width, format.height, time, prepared.brand)
        if (!reduced.matches && (slide.templateId === 'mock-report' || time < 4000)) frame = requestAnimationFrame(draw!)
      }
      reduced.addEventListener('change', draw)
      document.addEventListener('visibilitychange', draw)
      draw()
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load the preview.')
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      if (draw) {
        reduced.removeEventListener('change', draw)
        document.removeEventListener('visibilitychange', draw)
      }
    }
  }, [slide, images, format, replay])
  return <div>
    <div className="relative overflow-hidden bg-black" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
      <canvas ref={canvasRef} className="block size-full" role="img" aria-label={`Mogging ${slide.metricLabel}. Current ${slide.currentScore}, potential ${slide.potentialScore}.`} />
      {error ? <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">{error}</p> : null}
    </div>
    {slide.templateId !== 'mock-report' ? <button type="button" className="mt-2 min-h-11 w-full rounded-lg text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setReplay(value => value + 1)}>Replay animation</button> : null}
  </div>
}
