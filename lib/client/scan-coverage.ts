export const scanRingSize = 60

/** Mark pose coverage clockwise from the top of the mirrored preview. */
export function markScanCoverage(covered: boolean[], yaw: number, pitch: number) {
  const x = yaw / 6.5
  const y = pitch / 4
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1) return false

  const turn = (Math.atan2(x, y) / (2 * Math.PI) + 1) % 1
  const tick = Math.round(turn * scanRingSize)
  let changed = false
  for (let offset = -4; offset <= 4; offset++) {
    const index = (tick + offset + scanRingSize) % scanRingSize
    if (covered[index]) continue
    covered[index] = true
    changed = true
  }
  return changed
}
