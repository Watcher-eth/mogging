import { useEffect, useRef, useState } from 'react'
import NumberFlow, { continuous } from '@number-flow/react'
import type { NumberPort } from '@/lib/creator/rolling-number'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { drawVideoFrame, type PreparedVideo } from '@/lib/creator/video-renderer'
import type { VideoComposition } from '@/lib/creator/video-composition'

export function VideoCompositionPlayer({ prepared, composition, seekMs, onTime }: { prepared: PreparedVideo | null; composition: VideoComposition; seekMs: number; onTime: (time: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const positionRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [numbers, setNumbers] = useState<NumberPort[]>([])
  const onTimeRef = useRef(onTime)
  useEffect(() => { onTimeRef.current = onTime }, [onTime])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setReduced(media.matches); if (media.matches) setPlaying(false) }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    positionRef.current = Math.max(0, Math.min(seekMs, composition.durationMs - 1))
    setPosition(positionRef.current)
  }, [seekMs, composition.durationMs])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !prepared) return
    let frame = 0, last = performance.now(), lastNotify = 0, lastNumbers = 0
    const draw = (now: number) => {
      if (playing && !document.hidden) positionRef.current = Math.min(composition.durationMs - 1, positionRef.current + now - last)
      last = now
      const ports: NumberPort[] = []
      drawVideoFrame(ctx, prepared, positionRef.current, 540, 960, reduced, playing && !reduced ? port => { ports.push(port); return true } : undefined)
      if (now - lastNumbers > 32 || !playing) { setNumbers(ports); lastNumbers = now }
      if (now - lastNotify > 100 || !playing) { setPosition(positionRef.current); onTimeRef.current(positionRef.current); lastNotify = now }
      if (playing && positionRef.current < composition.durationMs - 1) frame = requestAnimationFrame(draw)
      else if (playing) setPlaying(false)
    }
    frame = requestAnimationFrame(draw)
    const visibility = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility) }
  }, [prepared, composition, playing, reduced, seekMs])

  function seek(value: number) {
    positionRef.current = Math.max(0, Math.min(value, composition.durationMs - 1))
    setPosition(positionRef.current); onTimeRef.current(positionRef.current)
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && prepared) drawVideoFrame(ctx, prepared, positionRef.current, 540, 960, reduced)
  }

  return <div className="grid gap-3">
    <div className="relative mx-auto w-full max-w-[540px] overflow-hidden bg-white shadow-lg" style={{ aspectRatio: '9/16', containerType: 'inline-size' }}>
      <canvas ref={canvasRef} width={540} height={960} className="block size-full" role="img" aria-label={`Video preview: ${composition.title}`} />
      {playing && !reduced ? <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {numbers.map(port => <NumberFlow key={port.id} value={port.current} plugins={[continuous]} format={{ minimumFractionDigits: port.decimals, maximumFractionDigits: port.decimals, useGrouping: false }} transformTiming={{ duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' }} spinTiming={{ duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' }} opacityTiming={{ duration: 180 }} style={{ position: 'absolute', left: `${port.x / 1080 * 100}%`, top: `${port.y / 1920 * 100}%`, fontFamily: '"Mogging Share", sans-serif', fontSize: `${port.fontSize / 1080 * 100}cqw`, fontWeight: 600, lineHeight: 1.25, color: port.color, opacity: port.opacity, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} />)}
      </div> : null}
    </div>
    <div className="mx-auto grid w-full max-w-[420px] gap-3 rounded-2xl bg-white p-3">
      <input aria-label="Video playhead" type="range" min={0} max={composition.durationMs - 1} step={1000 / 30} value={position} onChange={event => { setPlaying(false); seek(Number(event.target.value)) }} className="w-full accent-cyan-300" />
      <div className="flex items-center justify-between gap-2"><div className="flex gap-1">
        <Button variant="ghost" size="icon" aria-label="Restart preview" className="size-10 text-zinc-700 hover:bg-zinc-100" onClick={() => seek(0)}><RotateCcw className="size-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="Previous frame" className="size-10 text-zinc-700 hover:bg-zinc-100" onClick={() => { setPlaying(false); seek(positionRef.current - 1000 / 30) }}><ChevronLeft className="size-4" /></Button>
        <Button size="icon" aria-label={playing ? 'Pause preview' : 'Play preview'} disabled={!prepared} className="size-10 rounded-full bg-sky-600 text-white hover:bg-sky-700" onClick={() => { if (positionRef.current >= composition.durationMs - 1) seek(0); setPlaying(value => !value) }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
        <Button variant="ghost" size="icon" aria-label="Next frame" className="size-10 text-zinc-700 hover:bg-zinc-100" onClick={() => { setPlaying(false); seek(positionRef.current + 1000 / 30) }}><ChevronRight className="size-4" /></Button>
      </div><span className="font-mono text-[11px] tabular-nums text-zinc-500">{(position / 1000).toFixed(1)} / {(composition.durationMs / 1000).toFixed(1)}s</span></div>
      {reduced ? <p className="text-[10px] text-zinc-500">Reduced-motion preview enabled. Export keeps the authored motion.</p> : null}
    </div>
  </div>
}
