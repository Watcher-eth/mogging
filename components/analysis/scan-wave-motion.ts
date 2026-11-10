// Vertical front adapted from Libraries.dev Distortion Waves (MIT).
// Copyright (c) 2026 Jakub Antalik. See scan-wave-LICENSE.txt.

export const waveTiming = { photoMs: 2400, processingMs: 3800, activeFraction: .88 }
const duration = 3.62
const anticipation = .5
const travel = 2.28

function smooth(from: number, to: number, value: number) {
  'worklet'
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function ease(value: number, x1: number, y1: number, x2: number, y2: number) {
  'worklet'
  if (value <= 0 || value >= 1) return Math.max(0, Math.min(1, value))
  let lo = 0
  let hi = 1
  for (let i = 0; i < 15; i++) {
    const m = (lo + hi) * .5
    const r = 1 - m
    const x = 3 * r * r * m * x1 + 3 * r * m * m * x2 + m * m * m
    if (x < value) lo = m
    else hi = m
  }
  const t = (lo + hi) * .5
  const r = 1 - t
  return 3 * r * r * t * y1 + 3 * r * t * t * y2 + t * t * t
}

export function sampleScanWave(progress: number, width: number, height: number) {
  'worklet'
  const time = Math.max(0, Math.min(1, progress)) * duration
  const sinceLaunch = time - anticipation
  const gathered = smooth(0, anticipation, time)
  const travelProgress = sinceLaunch / travel
  const moved = ease(travelProgress, .22, 1, .36, 1)
  const opening = smooth(0, .45, moved)
  const settling = 1 - smooth(.2, .55, travelProgress)
  const unit = Math.max(.48, Math.min(1.2, width / 390))
  const origin = [width * .5, height - 16 * unit]
  const reach = Math.hypot(width * .7, origin[1])
  const startRadius = 25 * unit
  const endRadius = reach + ((22 + 60) * 1.4 + 100) * unit
  const radius = sinceLaunch < 0 ? startRadius + 56 * unit * (1 - gathered) : startRadius + (endRadius - startRadius) * moved
  const clearStart = startRadius - 343 * unit
  const clearEnd = reach + (343 + 22) * 1.4 * unit
  const clearRadius = clearStart + (clearEnd - clearStart) * ease((sinceLaunch + .35) / 3.03, .42, 0, .58, 1)
  const glow = sinceLaunch < 0 ? .165 * gathered : (.165 + .835 * smooth(0, .07, travelProgress)) * settling
  const rim = .82 * smooth(0, .1, travelProgress) * (1 - smooth(.9, 1, time / duration))
  return {
    origin,
    moved,
    front: [radius, 49 * unit * (1 - opening), 1 + .4 * smooth(0, .5, moved), time],
    motion: [smooth(0, .05, travelProgress) * settling, 22 * unit * smooth(0, .3, moved), 24 * unit * gathered * (1 - smooth(0, .22, sinceLaunch)), glow],
    edge: [unit, clearRadius, rim, progress],
  }
}

// Scale the reference's low-discrepancy glints to the portrait and its origin.
export const scanGlintCount = 36

export function scanGlint(index: number, wave: ReturnType<typeof sampleScanWave>) {
  'worklet'
  const i = index + 1
  const scatter = (step: number) => i * step % 1
  const unit = wave.edge[0]
  const time = wave.front[3]
  const flying = Math.max(0, time - anticipation)
  const phase = scatter(.6180339887) * 2 * Math.PI
  const column = (scatter(.7548776662) * 2 - 1) * .92
  const pace = .35 + .72 * Math.sqrt(scatter(.8191725134))
  const drift = (15 + 50 * scatter(.6710436067)) * unit
  const sway = (3 + 11 * scatter(.4142135624)) * unit
  const life = 2.19 * (.4 + .6 * scatter(.6457513111))
  const light = (.3 + .7 * scatter(.6055512755)) * (.85 + .15 * Math.sin(time * (8 + 12 * scatter(.2360679775)) + phase))
  const radius = (1.1 + .8 * scatter(.5497004779)) * unit
  if (time < anticipation) {
    const hop = .16 + .14 * scatter(.1231056256)
    const cycles = time / hop + scatter(.472135955)
    const along = cycles - Math.floor(cycles)
    const seed = Math.sin(i * 12.9898 + Math.floor(cycles) * 78.233 + 37.719) * 43758.5453
    const spread = seed - Math.floor(seed)
    const opacity = smooth(0, .175, time) * smooth(0, .25, along) * (1 - smooth(.55, 1, along)) * (1 - smooth(.375, .5, time)) * light
    return [wave.origin[0] + (spread * 2 - 1) * 98 * unit,
      wave.origin[1] - (79 + 96 * scatter(.481) - 30 * along * along) * unit, radius, opacity]
  }
  const swaying = sway * Math.sin((2.5 + 3.5 * scatter(.7320508076)) * flying + phase) * Math.min(flying / .25, 1)
  const x = column * 74 * unit * (1 + .22 * wave.moved * pace) + swaying
  const y = (25 * unit + (wave.front[0] - 25 * unit) * pace) * (1 - .3 * column * column) + drift * flying
  return [wave.origin[0] + x, wave.origin[1] - y, radius, light * (1 - smooth(life * .55, life, flying))]
}
