/** Estimate from completed frames, excluding the cold shader/codec startup. */
export function createRenderEstimator(totalFrames: number, now = () => performance.now()) {
  let lastAt = now(), completed = 0, frameMs: number | undefined, warmMs = 0, warmFrames = 0
  return (frames: number): number | null => {
    const at = now(), count = Math.min(totalFrames, Math.max(completed, frames))
    if (count === completed) return null
    const cost = Math.max(0, at - lastAt) / (count - completed)
    if (completed > 0) {
      warmMs += cost * (count-completed);warmFrames += count-completed
      frameMs = frameMs === undefined ? cost : frameMs * .8 + cost * .2
    }
    completed = count; lastAt = at
    if (completed >= totalFrames) return 0
    return completed < 3 || frameMs === undefined ? null : Math.max(0, (totalFrames - completed) * (.7*warmMs/warmFrames+.3*frameMs) / 1000)
  }
}

export function formatRenderRemaining(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return 'Estimating time remaining…'
  if (seconds <= 0) return 'Finishing download…'
  if (seconds < 10) return 'Less than 10 seconds left'
  if (seconds < 60) return `About ${Math.ceil(seconds / 5) * 5} seconds left`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `About ${minutes} min left` : `About ${Math.floor(minutes / 60)}h ${minutes % 60}m left`
}
