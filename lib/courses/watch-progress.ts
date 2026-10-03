export type WatchRange = [number, number]

// Union coverage, rather than the furthest playhead, keeps seeking and rewatches honest.
export function mergeWatchRanges(ranges: WatchRange[], duration: number): WatchRange[] {
  const merged: WatchRange[] = []
  for (const [start, end] of ranges
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map(([start, end]): WatchRange => [Math.max(0, start), Math.min(duration, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  // A bounded record retains the largest watched segments if heavily fragmented.
  return merged.length <= 1000 ? merged : merged.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 1000).sort((a, b) => a[0] - b[0])
}

export function watchedEnough(ranges: WatchRange[], duration: number) {
  return duration > 0 && ranges.reduce((total, [start, end]) => total + end - start, 0) / duration >= 0.95
}
