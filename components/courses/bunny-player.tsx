import { useEffect, useRef } from 'react'
import { mergeWatchRanges, watchedEnough, type WatchRange } from '@/lib/courses/watch-progress'

type Time = { seconds: number; duration: number }

// Bunny implements the Player.js message protocol. Bind one listener to this exact iframe.
export function BunnyPlayer({ url, title, position = 0, watchedRanges = [], onProgress }: {
  url: string; title: string; position?: number
  watchedRanges?: WatchRange[]
  onProgress?: (position: number, completed: boolean, ranges: WatchRange[]) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const callback = useRef(onProgress)
  callback.current = onProgress
  const seed = useRef({ position, watchedRanges })
  seed.current = { position, watchedRanges }
  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    const origin = new URL(url).origin
    const listeners = new Map(['ready', 'play', 'timeupdate', 'pause', 'ended', 'seeked'].map(event => [event, crypto.randomUUID()]))
    const send = (method: string, value: unknown, listener?: string) => iframe.contentWindow?.postMessage(JSON.stringify({ context: 'player.js', version: '0.0.11', method, value, ...(listener ? { listener } : {}) }), origin)
    let ranges = [...seed.current.watchedRanges], dirty = false
    let ready = false, playing = false, previous: { seconds: number; at: number } | null = null, lastSave = 0, completed = false
    let lastPosition = seed.current.position, reportedPosition = seed.current.position
    const save = () => {
      reportedPosition = lastPosition
      dirty = false
      callback.current?.(Math.floor(lastPosition), completed, ranges)
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframe.contentWindow) return
      let data: { context?: string; event?: string; value?: unknown; listener?: string }
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
      if (data?.context !== 'player.js') return
      if (data.event === 'ready' && !ready) {
        ready = true
        for (const [name, id] of listeners) if (name !== 'ready') send('addEventListener', name, id)
        send('setCurrentTime', seed.current.position)
      }
      if (data.event === 'play') { playing = true; previous = { seconds: lastPosition, at: performance.now() } }
      if (data.event === 'pause' || data.event === 'ended') { playing = false; previous = null; if (dirty || lastPosition !== reportedPosition) save() }
      if (data.event === 'seeked') previous = null
      if (data.event !== 'timeupdate') return
      const value = data.value as Time | undefined
      if (!value || !Number.isFinite(value.seconds) || !Number.isFinite(value.duration) || value.seconds < 0 || value.duration <= 0) return
      const now = performance.now()
      ranges = mergeWatchRanges([...ranges, ...seed.current.watchedRanges], value.duration)
      if (playing && previous && value.seconds > previous.seconds && value.seconds - previous.seconds <= (now - previous.at) / 1000 * 4 + 0.5) {
        ranges = mergeWatchRanges([...ranges, [previous.seconds, value.seconds]], value.duration)
        dirty = true
      }
      previous = playing ? { seconds: value.seconds, at: now } : null
      lastPosition = value.seconds
      const done = watchedEnough(ranges, value.duration)
      if (now - lastSave >= 15_000 || (done && !completed)) {
        completed ||= done; lastSave = now
        save()
      }
    }
    const subscribe = () => send('addEventListener', 'ready', listeners.get('ready'))
    window.addEventListener('message', receive)
    iframe.addEventListener('load', subscribe)
    subscribe()
    return () => {
      if (dirty || lastPosition !== reportedPosition) save()
      for (const [event, id] of listeners) send('removeEventListener', event, id)
      window.removeEventListener('message', receive)
      iframe.removeEventListener('load', subscribe)
    }
    // Resuming happens once per signed playback URL, not on each progress save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return <div className="c-bunny-player"><iframe ref={frame} src={url} title={title} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen /></div>
}
