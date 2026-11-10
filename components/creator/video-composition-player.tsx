import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BatteryFull, Bookmark, Heart, Home, MessageCircle, Music2, Pause, Play, Plus, RotateCcw, RotateCw, Search, Share2, Signal, UserRound, Users, Wifi } from 'lucide-react'
import { seekPreparedMedia, drawVideoFrame, type PreparedVideo } from '@/lib/creator/video-renderer'
import { videoExportSize } from '@/lib/creator/video-layout'
import { createPreviewRipple } from '@/lib/creator/preview-ripple'
import type { VideoComposition } from '@/lib/creator/video-composition'
import styles from './video-studio.module.css'

const playbackTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

export function VideoCompositionPlayer({ prepared, composition, seekMs, onTime, audioUrl, suspended = false }: { suspended?:boolean; prepared: PreparedVideo | null; composition: VideoComposition; seekMs: number; onTime: (time: number) => void; audioUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rippleCanvasRef = useRef<HTMLCanvasElement>(null)
  const rippleRendererRef = useRef<ReturnType<typeof createPreviewRipple>>(null)
  const displayedRef = useRef<PreparedVideo | null>(null)
  const rippleRef = useRef<{ previous: HTMLCanvasElement; started?: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const positionRef = useRef(0)
  const onTimeRef = useRef(onTime)
  const [hasFrame, setHasFrame] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [position, setPosition] = useState(0)
  const [playbackError, setPlaybackError] = useState('')
  useEffect(() => { onTimeRef.current = onTime }, [onTime])
  useEffect(()=>{if(suspended){audioRef.current?.pause();setPlaying(false)}},[suspended])
  useEffect(() => () => {
    rippleRendererRef.current?.dispose(); rippleRendererRef.current = null
    rippleRef.current = null; displayedRef.current = null
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setReduced(media.matches); if (media.matches) setPlaying(false) }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    setPlaying(false); setPlaybackError('')
    positionRef.current = Math.max(0, Math.min(seekMs, composition.durationMs - 1))
    setPosition(positionRef.current)
  }, [seekMs, composition.scenes, composition.durationMs])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let cancelled = false
    if (playing && prepared) {
      audio.currentTime = positionRef.current / 1000
      void audio.play().catch((error: unknown) => {
        if (cancelled || error instanceof DOMException && error.name === 'AbortError') return
        setPlaybackError('Could not play the preview audio. Try again.')
        setPlaying(false)
      })
    } else audio.pause()
    return () => { cancelled = true; audio.pause() }
  }, [playing, prepared, audioUrl])

  useEffect(() => {
    const canvas = canvasRef.current, overlay = rippleCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !prepared || !canvas || !overlay) return
    const previous = displayedRef.current
    const styleChanged = previous && previous.composition.recipe !== prepared.composition.recipe
    if (previous !== prepared) {
      if (styleChanged && !reduced) {
        const snapshot = document.createElement('canvas'); snapshot.width = canvas.width; snapshot.height = canvas.height
        const snapshotContext = snapshot.getContext('2d')!
        snapshotContext.drawImage(canvas, 0, 0)
        if (overlay.style.visibility === 'visible') snapshotContext.drawImage(overlay, 0, 0)
        rippleRef.current = { previous: snapshot }
      } else rippleRef.current = null
      overlay.style.visibility = 'hidden'
      displayedRef.current = prepared
    }
    const drawAbort = new AbortController()
    let frame = 0, last = performance.now(), lastNotify = 0, drawTotal = 0, drawCount = 0, slowFrames = 0, firstFrame = true
    const frameInterval = 1000 / prepared.composition.fps
    let lastPaint = last - frameInterval
    const draw = async (now: number) => {
      if (drawAbort.signal.aborted) return
      if (playing && !rippleRef.current && now - lastPaint < frameInterval - .5) { frame = requestAnimationFrame(draw); return }
      lastPaint = now - Math.max(0, (now - lastPaint) % frameInterval)
      const drawStarted = performance.now()
      try {
        const ripple = rippleRef.current
        let rippling = false
        if (ripple && !reduced) {
          if (ripple.started === undefined) {
            await seekPreparedMedia(prepared,positionRef.current,drawAbort.signal)
            if (drawAbort.signal.aborted) return
            drawVideoFrame(ctx, prepared, positionRef.current, canvas.width, canvas.height, reduced)
            canvas.dataset.renderedStyle = prepared.composition.recipe
            rippleRendererRef.current ??= createPreviewRipple(overlay)
            rippleRendererRef.current?.start(ripple.previous, canvas)
            ripple.started = performance.now()
          }
          rippling = rippleRendererRef.current?.draw(performance.now() - ripple.started) ?? false
          overlay.style.visibility = rippling ? 'visible' : 'hidden'
          if (!rippling) { rippleRef.current = null; setPlaying(true) }
        } else {
          if (playing && !document.hidden) {
            const audio = audioRef.current
            positionRef.current = Math.min(prepared.composition.durationMs - 1, audioUrl && audio ? audio.paused ? positionRef.current : audio.currentTime * 1000 : positionRef.current + now - last)
          }
          overlay.style.visibility = 'hidden'
          await seekPreparedMedia(prepared,positionRef.current,drawAbort.signal)
          if (drawAbort.signal.aborted) return
          drawVideoFrame(ctx, prepared, positionRef.current, canvas.width, canvas.height, reduced)
          canvas.dataset.renderedStyle = prepared.composition.recipe
        }
        last = now
        if (firstFrame) { setHasFrame(true); firstFrame = false }
        const drawMs = performance.now() - drawStarted
        drawTotal += drawMs; drawCount++; if (drawMs > 1000 / 30) slowFrames++
        if (now - lastNotify > 100 || !playing && !rippling) {
          setPosition(positionRef.current); onTimeRef.current(positionRef.current)
          canvas.dataset.renderedTime = String(Math.round(positionRef.current)); canvas.dataset.averageDrawMs = (drawTotal / drawCount).toFixed(1); canvas.dataset.slowFrames = String(slowFrames); canvas.dataset.drawnFrames = String(drawCount); if (playing) { canvas.dataset.playbackAverageDrawMs = (drawTotal / drawCount).toFixed(1); canvas.dataset.playbackSlowFrames = String(slowFrames); canvas.dataset.playbackDrawnFrames = String(drawCount) } lastNotify = now
        }
        if (rippling || playing && positionRef.current < prepared.composition.durationMs - 1) frame = requestAnimationFrame(draw)
        else if (playing) setPlaying(false)
      } catch (error) {
        if (drawAbort.signal.aborted) return
        overlay.style.visibility = 'hidden'; rippleRef.current = null; setPlaying(false)
        setPlaybackError(error instanceof Error ? `Preview could not render: ${error.message}` : 'Preview could not render. Choose a style again.')
      }
    }
    frame = requestAnimationFrame(draw)
    const visibility = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', visibility)
    return () => { drawAbort.abort(); cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility) }
  }, [prepared, playing, reduced, seekMs, audioUrl])

  function seek(value: number) {
    rippleRef.current = null
    if (rippleCanvasRef.current) rippleCanvasRef.current.style.visibility = 'hidden'
    positionRef.current = Math.max(0, Math.min(value, composition.durationMs - 1))
    setPosition(positionRef.current); onTimeRef.current(positionRef.current)
    if (audioRef.current) audioRef.current.currentTime = positionRef.current / 1000
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && prepared) {
      const time = positionRef.current
      void seekPreparedMedia(prepared,time).then(() => { if (positionRef.current === time) drawVideoFrame(ctx, prepared, time, ctx.canvas.width, ctx.canvas.height, reduced) }).catch(error => setPlaybackError(error instanceof Error ? error.message : 'Could not seek this preview'))
    }
  }
  function togglePlayback() {
    rippleRef.current = null
    if (rippleCanvasRef.current) rippleCanvasRef.current.style.visibility = 'hidden'
    if (positionRef.current >= composition.durationMs - 1) seek(0)
    setPlaybackError(''); setPlaying(current => !current)
  }
  return <div className={styles.player} style={{ '--video-aspect': `${videoExportSize.width} / ${videoExportSize.height}` } as CSSProperties}>
    {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" onEnded={() => { setPlaying(false); seek(composition.durationMs - 1) }} /> : null}
    {playbackError ? <p role="alert" className="text-xs text-red-700">{playbackError}</p> : null}
    <div className={styles.composerFrame} aria-label="TikTok feed preview">
      <div className={styles.previewContent}>
        <div className={styles.videoSurface} data-theme={composition.theme}>
          <canvas ref={canvasRef} width={videoExportSize.width} height={videoExportSize.height} className={styles.videoCanvas} role="img" aria-label={`Video preview: ${composition.title}`} />
          <canvas ref={rippleCanvasRef} width={videoExportSize.width} height={videoExportSize.height} aria-hidden="true" className={styles.waveCanvas} style={{ visibility: 'hidden' }} />
          {!prepared && !hasFrame ? <div className={styles.empty}>Choose a person to start.</div> : null}
        </div>
      </div>
      <div className={styles.feedChrome} aria-hidden="true">
        <div className={styles.feedStatus}><span>9:41</span><span><Signal /><Wifi /><BatteryFull /></span></div>
        <div className={styles.feedHeader}><span>Following</span><i /><strong>For You</strong><Search /></div>
        <div className={styles.feedActions}><span className={styles.feedAvatar}>M<Plus /></span><Heart fill="currentColor" /><MessageCircle fill="currentColor" /><Bookmark fill="currentColor" /><Share2 fill="currentColor" /><span className={styles.feedRecord}><Music2 /></span></div>
        <div className={styles.feedDescription}><strong>@your.account</strong><p>{composition.title}</p><span><Music2 /> Original sound · Your account</span></div>
        <div className={styles.feedNavigation}><span><Home fill="currentColor" />Home</span><span><Users />Friends</span><span className={styles.feedCreate}><Plus /></span><span><MessageCircle />Inbox</span><span><UserRound />Profile</span></div>
      </div>
    </div>
    <p className={styles.previewNote}>TikTok placement preview · interface is not in the download</p>
    <div className={styles.playerControls} aria-label="Video playback controls">
      <input aria-label="Video playhead" type="range" disabled={!prepared} min={0} max={composition.durationMs - 1} step={1000 / 30} value={position} onChange={event => { setPlaying(false); seek(Number(event.target.value)) }} className={styles.scrubber} style={{ background: `linear-gradient(to right, #525252 ${position / composition.durationMs * 100}%, #e5e5e5 ${position / composition.durationMs * 100}%) center / 100% 3px no-repeat` }} />
      <div className={styles.transport}>
        <span className={styles.time}>{playbackTime(position)}</span>
        <div className={styles.transportButtons}>
          <button type="button" aria-label="Skip back 5 seconds" title="Back 5 seconds" disabled={!prepared} className={styles.skipButton} onClick={() => seek(positionRef.current - 5000)}><RotateCcw size={23} strokeWidth={1.6} aria-hidden="true" /><span aria-hidden="true">5</span></button>
          <button type="button" aria-label={playing ? 'Pause preview' : 'Play preview'} disabled={!prepared} className={styles.playButton} onClick={togglePlayback}>{playing ? <Pause size={19} fill="currentColor" aria-hidden="true" /> : <Play size={19} fill="currentColor" aria-hidden="true" />}</button>
          <button type="button" aria-label="Skip forward 5 seconds" title="Forward 5 seconds" disabled={!prepared} className={styles.skipButton} onClick={() => seek(positionRef.current + 5000)}><RotateCw size={23} strokeWidth={1.6} aria-hidden="true" /><span aria-hidden="true">5</span></button>
        </div>
        <span className={styles.time}>{playbackTime(composition.durationMs)}</span>
      </div>
    </div>
    {reduced ? <p className="text-center text-[10px] text-zinc-500">Reduced-motion preview</p> : null}
  </div>
}
