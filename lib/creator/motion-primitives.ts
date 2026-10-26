export type MotionPrimitiveCategory = 'transition' | 'camera' | 'entry' | 'exit' | 'text' | 'cursor' | 'cinematic' | 'overlay' | 'report'

export type MotionPrimitiveDefinition = {
  id: string
  label: string
  category: MotionPrimitiveCategory
  durationMs: number
  description: string
}

const define = <const T extends ReadonlyArray<readonly [string, string, string]>>(category: MotionPrimitiveCategory, durationMs: number, items: T) =>
  items.map(([id, label, description]) => ({ id: id as T[number][0], label, category, durationMs, description }))

export const motionPrimitives = [
  ...define('transition', 420, [
    ['cinematic-flow', 'Cinematic flow', 'Shared-element layouts with one moving app component, a persistent subject and continuous facial measurements.'],
    ['screen-push', 'Screen push', 'Move both app screens along one continuous editorial axis.'],
    ['match-reframe', 'Matched reframe', 'Carry focal framing across a clean app-to-app cut.'],
    ['card-reveal', 'Card reveal', 'Reveal the next scene from a rounded UI card mask.'],
  ]),
  ...define('report', 1100, [
    ['component-focus', 'Feature metric entrance', 'Fade and settle the native metric beneath its portrait, building the meter from zero.'],
    ['scroll-to-section', 'Scroll to section', 'Scroll precisely to a named report section and settle.'],
    ['section-expand', 'Expand native card', 'Lift and enlarge the actual app card, then return it.'],
    ['gradient-outline', 'Gradient highlight', 'Trace a subtle blue-to-mint border around the selected UI.'],
    ['section-spotlight', 'Section spotlight', 'Quiet the surrounding app while preserving a crisp selected section.'],
  ]),
  ...define('transition', 240, [
    ['hard-cut', 'Hard cut', 'Instant creator-native scene change.'],
    ['crossfade', 'Crossfade', 'Short opacity handoff between scenes.'],
    ['dip-black', 'Dip to black', 'Fast black reset for brand chapters.'],
    ['dip-white', 'Exposure flash', 'White-flash transition between proof shots.'],
    ['wipe-left', 'Wipe left', 'New scene replaces the old from the right.'],
    ['wipe-right', 'Wipe right', 'New scene replaces the old from the left.'],
    ['wipe-up', 'Wipe up', 'Vertical mobile-screen reveal.'],
    ['zoom-cut', 'Zoom cut', 'Cut with a short scale match.'],
    ['whip-left', 'Whip pan left', 'Fast horizontal blur and translation.'],
    ['whip-right', 'Whip pan right', 'Fast reverse horizontal whip.'],
    ['blur-dissolve', 'Blur dissolve', 'Blurred opacity handoff for polished UI.'],
    ['glitch-slice', 'Glitch slice', 'Brief RGB-like horizontal displacement.'],
  ]),
  ...define('camera', 1200, [
    ['layout-scale', 'Canvas framing (legacy)', 'Compatibility track; app reports retain the full video dimensions.'],
    ['punch-in', 'Punch in', 'Fast digital push toward a named feature.'],
    ['slow-push', 'Slow push', 'Continuous credibility-building crop.'],
    ['pull-out', 'Pull out', 'Reveal more context around the face or report.'],
    ['pan-left', 'Pan left', 'Move the crop toward the right edge of the source.'],
    ['pan-right', 'Pan right', 'Move the crop toward the left edge of the source.'],
    ['pan-up', 'Pan up', 'Move attention down through a report.'],
    ['pan-down', 'Pan down', 'Move attention toward the forehead and eyes.'],
    ['handheld-drift', 'Handheld drift', 'Subtle creator-native positional drift.'],
    ['snap-reframe', 'Snap reframe', 'Quickly settle on a new crop.'],
    ['focus-rack', 'Focus rack', 'Brief blur that resolves on the subject.'],
    ['report-scroll', 'Report scroll', 'Scroll through the mobile evaluation with fixed app chrome.'],
  ]),
  ...define('entry', 420, [
    ['fade-in', 'Fade in', 'Simple opacity entrance.'],
    ['rise-in', 'Rise in', 'Enter upward with a soft fade.'],
    ['drop-in', 'Drop in', 'Enter downward with a soft fade.'],
    ['slide-in-left', 'Slide in left', 'Enter from the left edge.'],
    ['slide-in-right', 'Slide in right', 'Enter from the right edge.'],
    ['scale-pop', 'Scale pop', 'Overshooting score or badge entrance.'],
    ['blur-in', 'Blur in', 'Resolve from blur for brand titles.'],
    ['mask-reveal', 'Mask reveal', 'Reveal content across its width.'],
    ['line-draw', 'Line draw', 'Trace a measurement from endpoint to endpoint.'],
  ]),
  ...define('exit', 260, [
    ['fade-out', 'Fade out', 'Simple opacity exit.'],
    ['sink-out', 'Sink out', 'Leave downward while fading.'],
    ['slide-out-left', 'Slide out left', 'Exit toward the left edge.'],
    ['slide-out-right', 'Slide out right', 'Exit toward the right edge.'],
    ['scale-down', 'Scale down', 'Shrink away for a UI reset.'],
    ['blur-out', 'Blur out', 'Lose focus while exiting.'],
  ]),
  ...define('text', 700, [
    ['type-on', 'Type on', 'Reveal characters with a visible cursor.'],
    ['word-build', 'Word build', 'Add one hook word or phrase per beat.'],
    ['kinetic-pop', 'Kinetic pop', 'Bounce a verdict or score into view.'],
    ['tracking-expand', 'Tracking expand', 'Open letter spacing on a brand title.'],
    ['score-count', 'Score count', 'Count a numeric score to its result.'],
    ['cursor-blink', 'Cursor blink', 'Blink a terminal-style insertion cursor.'],
    ['underline-draw', 'Underline draw', 'Draw a proof line beneath a term.'],
  ]),
  ...define('cursor', 620, [
    ['cursor-tap', 'Cursor tap', 'Move, compress, and release on a target.'],
    ['cursor-drag', 'Cursor drag', 'Drag a report or comparison handle.'],
    ['cursor-circle', 'Cursor circle', 'Hand-drawn loop around a feature.'],
    ['cursor-swipe', 'Cursor swipe', 'Touch gesture used to scroll mobile UI.'],
  ]),
  ...define('cinematic', 900, [
    ['letterbox', 'Letterbox', 'Introduce cinematic top and bottom bars.'],
    ['cyan-glow', 'Cyan glow', 'Mogging aqua bloom around type and UI.'],
    ['scanline', 'Scan line', 'Luminous scan traveling down the face.'],
    ['privacy-bar', 'Privacy bar', 'Animated eye bar for social proof shots.'],
    ['freeze-frame', 'Freeze frame', 'Hold a verdict with a subtle exposure lift.'],
    ['split-screen', 'Split screen', 'Reveal a second state beside the first.'],
    ['parallax-separate', 'Parallax separate', 'Offset foreground and background planes.'],
  ]),
  ...define('overlay', 600, [
    ['landmark-stagger', 'Landmark stagger', 'Pop mapped face points in small groups.'],
    ['contour-trace', 'Contour trace', 'Draw jaw, cheek, or face contours progressively.'],
    ['metric-bar-fill', 'Metric bar fill', 'Fill a report measurement bar to its score.'],
    ['shimmer-pass', 'Shimmer pass', 'Move a narrow highlight across app UI.'],
  ]),
] as const satisfies ReadonlyArray<MotionPrimitiveDefinition>

export type MotionPrimitiveId = (typeof motionPrimitives)[number]['id']

export type MotionSample = {
  opacity: number
  x: number
  y: number
  scale: number
  rotation: number
  blur: number
  brightness: number
  glow: number
  reveal: number
  phase: number
}

const rest: MotionSample = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, blur: 0, brightness: 1, glow: 0, reveal: 1, phase: 0 }
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const out = (value: number) => 1 - Math.pow(1 - clamp(value), 3)
const inOut = (value: number) => value < .5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
const overshoot = (value: number) => { const c = 1.70158; const x = clamp(value) - 1; return 1 + (c + 1) * x * x * x + c * x * x }

export function primitiveDefinition(id: MotionPrimitiveId) {
  return motionPrimitives.find(item => item.id === id)!
}

export function sampleMotionPrimitive(id: MotionPrimitiveId, rawProgress: number, intensity = 1): MotionSample {
  const progress = clamp(rawProgress)
  const ease = out(progress)
  const wave = Math.sin(progress * Math.PI)
  switch (id) {
    case 'cinematic-flow': return { ...rest, reveal: inOut(progress), y: (1 - inOut(progress)) * 5, scale: .985 + inOut(progress) * .015, phase: progress }
    case 'screen-push': return { ...rest, x: (1 - inOut(progress)) * 100 * intensity, phase: progress }
    case 'match-reframe': return { ...rest, scale: 1.065 - ease * .065, x: (1 - ease) * 2 * intensity, phase: progress }
    case 'card-reveal': return { ...rest, reveal: inOut(progress), phase: progress }
    case 'component-focus': case 'scroll-to-section': return { ...rest, reveal: inOut(progress), phase: progress }
    case 'section-expand': case 'gradient-outline': case 'section-spotlight': {
      const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }
      const envelope = Math.min(smooth(progress / .28), smooth((1 - progress) / .28))
      return { ...rest, reveal: envelope, scale: 1 + envelope * .18 * intensity, glow: envelope, phase: progress }
    }
    case 'hard-cut': return { ...rest, phase: progress }
    case 'crossfade': case 'fade-in': return { ...rest, opacity: ease, phase: progress }
    case 'fade-out': return { ...rest, opacity: 1 - ease, phase: progress }
    case 'dip-black': return { ...rest, opacity: Math.abs(progress * 2 - 1), brightness: Math.abs(progress * 2 - 1), phase: progress }
    case 'dip-white': return { ...rest, brightness: 1 + wave * 2.2 * intensity, opacity: .75 + Math.abs(progress * 2 - 1) * .25, phase: progress }
    case 'wipe-left': return { ...rest, x: (1 - ease) * 100 * intensity, reveal: ease, phase: progress }
    case 'wipe-right': return { ...rest, x: -(1 - ease) * 100 * intensity, reveal: ease, phase: progress }
    case 'wipe-up': return { ...rest, y: (1 - ease) * 100 * intensity, reveal: ease, phase: progress }
    case 'zoom-cut': return { ...rest, scale: 1.12 - ease * .12, blur: (1 - ease) * 4, phase: progress }
    case 'whip-left': return { ...rest, x: (1 - ease) * 70 * intensity, blur: wave * 12, rotation: -wave * .8, phase: progress }
    case 'whip-right': return { ...rest, x: -(1 - ease) * 70 * intensity, blur: wave * 12, rotation: wave * .8, phase: progress }
    case 'blur-dissolve': return { ...rest, opacity: ease, blur: (1 - ease) * 18, phase: progress }
    case 'glitch-slice': return { ...rest, x: Math.sin(progress * 70) * wave * 8 * intensity, brightness: 1 + wave * .35, phase: progress }
    case 'punch-in': return { ...rest, scale: 1 + out(Math.min(1, progress * 3)) * .16 * intensity, phase: progress }
    case 'slow-push': return { ...rest, scale: 1 + inOut(progress) * .09 * intensity, phase: progress }
    case 'pull-out': return { ...rest, scale: 1.12 - inOut(progress) * .12, phase: progress }
    case 'pan-left': return { ...rest, x: -ease * 7 * intensity, scale: 1.08, phase: progress }
    case 'pan-right': return { ...rest, x: ease * 7 * intensity, scale: 1.08, phase: progress }
    case 'pan-up': return { ...rest, y: -ease * 8 * intensity, scale: 1.06, phase: progress }
    case 'pan-down': return { ...rest, y: ease * 8 * intensity, scale: 1.06, phase: progress }
    case 'handheld-drift': return { ...rest, x: Math.sin(progress * 7.3) * 1.2 * intensity, y: Math.cos(progress * 5.1) * .8 * intensity, rotation: Math.sin(progress * 4.2) * .18, scale: 1.025, phase: progress }
    case 'snap-reframe': return { ...rest, x: (1 - ease) * -9 * intensity, y: (1 - ease) * 5 * intensity, scale: 1.1 - ease * .04, phase: progress }
    case 'focus-rack': return { ...rest, blur: (1 - ease) * 15, brightness: .88 + ease * .12, phase: progress }
    case 'layout-scale': case 'report-scroll': return { ...rest, reveal: inOut(progress), phase: progress }
    case 'rise-in': return { ...rest, opacity: ease, y: (1 - ease) * 7 * intensity, phase: progress }
    case 'drop-in': return { ...rest, opacity: ease, y: -(1 - ease) * 7 * intensity, phase: progress }
    case 'slide-in-left': return { ...rest, opacity: ease, x: -(1 - ease) * 18 * intensity, phase: progress }
    case 'slide-in-right': return { ...rest, opacity: ease, x: (1 - ease) * 18 * intensity, phase: progress }
    case 'scale-pop': case 'kinetic-pop': return { ...rest, opacity: ease, scale: .65 + overshoot(progress) * .35, phase: progress }
    case 'blur-in': return { ...rest, opacity: ease, blur: (1 - ease) * 12, y: (1 - ease) * 3, phase: progress }
    case 'mask-reveal': case 'line-draw': case 'type-on': case 'word-build': case 'underline-draw': case 'contour-trace': case 'metric-bar-fill': return { ...rest, reveal: ease, phase: progress }
    case 'sink-out': return { ...rest, opacity: 1 - ease, y: ease * 8, phase: progress }
    case 'slide-out-left': return { ...rest, opacity: 1 - ease, x: -ease * 20, phase: progress }
    case 'slide-out-right': return { ...rest, opacity: 1 - ease, x: ease * 20, phase: progress }
    case 'scale-down': return { ...rest, opacity: 1 - ease, scale: 1 - ease * .15, phase: progress }
    case 'blur-out': return { ...rest, opacity: 1 - ease * .35, blur: ease * 16, phase: progress }
    case 'tracking-expand': return { ...rest, reveal: ease, x: ease * 2, phase: progress }
    case 'score-count': return { ...rest, reveal: ease, scale: .96 + wave * .04, phase: progress }
    case 'cursor-blink': return { ...rest, opacity: Math.floor(progress * 8) % 2 ? .15 : 1, phase: progress }
    case 'cursor-tap': return { ...rest, scale: 1 - wave * .22, reveal: ease, phase: progress }
    case 'cursor-drag': return { ...rest, x: ease * 24 * intensity, y: ease * 6 * intensity, reveal: ease, phase: progress }
    case 'cursor-circle': return { ...rest, reveal: ease, rotation: ease * 360, phase: progress }
    case 'cursor-swipe': return { ...rest, y: -ease * 28 * intensity, opacity: 1 - Math.max(0, (progress - .75) * 4), phase: progress }
    case 'letterbox': return { ...rest, reveal: ease, phase: progress }
    case 'cyan-glow': return { ...rest, glow: .35 + wave * .65, brightness: 1 + wave * .12, phase: progress }
    case 'scanline': return { ...rest, y: -50 + ease * 100, glow: .85, reveal: ease, phase: progress }
    case 'privacy-bar': return { ...rest, reveal: ease, scale: .8 + ease * .2, phase: progress }
    case 'freeze-frame': return { ...rest, brightness: 1 + Math.min(1, progress * 5) * .12, scale: 1 + Math.min(1, progress * 3) * .025, phase: progress }
    case 'split-screen': return { ...rest, reveal: ease, x: (1 - ease) * 50, phase: progress }
    case 'parallax-separate': return { ...rest, x: ease * 3 * intensity, y: -ease * 2 * intensity, scale: 1.04, phase: progress }
    case 'landmark-stagger': return { ...rest, reveal: Math.floor(ease * 8) / 8, scale: .8 + ease * .2, phase: progress }
    case 'shimmer-pass': return { ...rest, x: -60 + ease * 120, opacity: wave, brightness: 1.7, phase: progress }
    default: { const unreachable: never = id; throw new Error(`Unknown motion primitive: ${unreachable}`) }
  }
}

export function primitiveProgress(timeMs: number, startMs: number, durationMs: number) {
  if (durationMs <= 0) return timeMs >= startMs ? 1 : 0
  return clamp((timeMs - startMs) / durationMs)
}
