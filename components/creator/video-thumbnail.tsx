import { useEffect, useRef } from 'react'
import { drawVideoFrame, type PreparedVideo } from '@/lib/creator/video-renderer'
import type { VideoScene } from '@/lib/creator/video-composition'
import { videoSize } from '@/lib/creator/video-layout'
import styles from './video-studio.module.css'

// Render visible thumbnails one per frame so opening a large library stays responsive.
const queue: Array<() => void> = []
let scheduled = false
function enqueue(draw: () => void) {
  queue.push(draw)
  if (scheduled) return
  scheduled = true
  const next = () => {
    queue.shift()?.()
    if (queue.length) requestAnimationFrame(next)
    else scheduled = false
  }
  requestAnimationFrame(next)
}
const frames = new WeakMap<PreparedVideo, Map<string, HTMLCanvasElement>>()
export function VideoThumbnail({ prepared, scene }: { prepared: PreparedVideo | null; scene: VideoScene }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !prepared) return
    let disposed = false
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      enqueue(() => {
        if (disposed) return
        let cache = frames.get(prepared)
        if (!cache) { cache = new Map(); frames.set(prepared, cache) }
        let frame = cache.get(scene.id)
        if (!frame) {
          frame = document.createElement('canvas'); frame.width = 288; frame.height = Math.round(frame.width * videoSize.height / videoSize.width)
          try { drawVideoFrame(frame.getContext('2d')!, prepared, scene.startMs + scene.durationMs * .65, frame.width, frame.height, true) }
          catch { return }
          cache.set(scene.id, frame)
        }
        canvas.getContext('2d')?.drawImage(frame, 0, 0)
      })
    }, { rootMargin: '120px' })
    observer.observe(canvas)
    return () => { disposed = true; observer.disconnect() }
  }, [prepared, scene])
  return <canvas aria-hidden="true" ref={ref} width={288} height={624} className={styles.videoThumbnail} />
}
