import { z } from 'zod'
import { contourGap, eyeContours, lipContours } from './contours'

const pointSchema = z.object({ x: z.number().finite().min(-2).max(3), y: z.number().finite().min(-2).max(3), z: z.number().finite().min(-5).max(5) })
export const landmarkInputSchema = z.object({
  width: z.number().int().min(64).max(12000),
  height: z.number().int().min(64).max(12000),
  points: z.array(pointSchema).refine(points => points.length === 468 || points.length === 478, 'Expected a complete mesh'),
})
export type LandmarkInput = z.infer<typeof landmarkInputSchema>
type Point = { x: number; y: number }
export type Measurement = { id: string; label: string; value: number | null; unit: 'ratio' | 'degrees' | '%'; method: string }

// Coordinates are converted to pixels before any geometry. Normalized x/y have different scales.
export function measureLandmarks(input: LandmarkInput) {
  const points = input.points.map(point => ({ x: point.x * input.width, y: point.y * input.height }))
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const left = points[468] ?? midpoint(points[33], points[133])
  const right = points[473] ?? midpoint(points[362], points[263])
  const eyeSpan = distance(left, right)
  const roll = Math.atan2(right.y - left.y, right.x - left.x)
  const center = midpoint(left, right)
  const rotated = points.map(point => ({
    x: (point.x - center.x) * Math.cos(roll) + (point.y - center.y) * Math.sin(roll),
    y: -(point.x - center.x) * Math.sin(roll) + (point.y - center.y) * Math.cos(roll),
  }))
  const span = (a: number, b: number) => distance(points[a], points[b])
  const ratio = (a: number, b: number) => b > 1e-6 ? a / b : null
  const angle = (a: number, b: number) => span(a, b) > 1e-6 && eyeSpan > 1e-6 ? Math.atan2(rotated[b].y - rotated[a].y, Math.abs(rotated[b].x - rotated[a].x)) * 180 / Math.PI : null
  const elevation = (a: number, b: number) => { const value = angle(a, b); return value === null ? null : -value }
  const metrics: Measurement[] = []
  const add = (id: string, label: string, value: number | null, unit: Measurement['unit'], method: string) => metrics.push({ id, label, value: value === null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000, unit, method })
  const eyeWidth = (span(33, 133) + span(362, 263)) / 2
  add('pupil-cheek', 'Pupil span / visible cheek width', ratio(eyeSpan, span(234, 454)), 'ratio', 'Iris-center distance over visible surface cheek anchors; approximate 2D width')
  add('eye-spacing', 'Eye spacing / eye width', ratio(span(133, 362), eyeWidth), 'ratio', 'Inner corners divided by mean eye width')
  const eyes = eyeContours.map(eye => contourGap(points, eye.upper, eye.lower, eye.corners))
  for (const [index, side] of ['left', 'right'].entries()) {
    const eye = eyes[index]
    add(`eye-aspect-${side}`, `${side === 'left' ? 'Left' : 'Right'} eye width / opening`, eye ? ratio(eye.width, eye.maximum) : null, 'ratio', 'Full lid contours sampled in the eye corner axis; maximum opening')
  }
  add('canthal-left', 'Left canthal tilt', elevation(133, 33), 'degrees', 'Outer-corner elevation relative to eye axis')
  add('canthal-right', 'Right canthal tilt', elevation(362, 263), 'degrees', 'Outer-corner elevation relative to eye axis')
  const nasalBase = [64, 98, 97, 2, 326, 327, 294].map(index => rotated[index].x)
  const noseWidth = Math.max(...nasalBase) - Math.min(...nasalBase)
  add('mouth-nose', 'Mouth / nasal base width', ratio(span(61, 291), noseWidth), 'ratio', 'Nasal base contour extent after roll correction; surface estimate')
  add('nose-eye', 'Nasal base / pupil span', ratio(noseWidth, eyeSpan), 'ratio', 'Full nasal base contour width relative to iris centers')
  add('eye-mouth', 'Pupil span / mouth width', ratio(eyeSpan, span(61, 291)), 'ratio', input.points.length === 478 ? 'Iris centers divided by mouth width' : 'Eye-center proxies divided by mouth width')
  const upperLip = contourGap(points, lipContours.upperOuter, lipContours.upperInner, [61, 291])
  const lowerLip = contourGap(points, lipContours.lowerInner, lipContours.lowerOuter, [61, 291])
  const mouthOpening = contourGap(points, lipContours.upperInner, lipContours.lowerInner, [61, 291])
  add('central-lip-ratio', 'Central lower / upper vermilion', ratio(span(14, 17), span(0, 13)), 'ratio', 'Central lower vermilion height divided by central upper vermilion height; requires closed relaxed lips')
  add('lip-balance', 'Lower / upper lip thickness', upperLip && lowerLip ? ratio(lowerLip.mean, upperLip.mean) : null, 'ratio', 'Mean contour thickness over the central mouth span; expression sensitive')
  add('mouth-opening', 'Lip opening / mouth width', mouthOpening ? ratio(mouthOpening.maximum, mouthOpening.width) : null, 'ratio', 'Inner lip contour gap; indicates expression, not anatomy')
  add('eye-opening-difference', 'Eye opening difference', eyes[0] && eyes[1] ? ratio(Math.abs(eyes[0].maximum - eyes[1].maximum) * 100, (eyes[0].maximum + eyes[1].maximum) / 2) : null, '%', 'Paired maximum lid openings; blink and expression sensitive')
  add('chin-philtrum', 'Chin / philtrum height', ratio(span(17, 152), span(2, 0)), 'ratio', 'Lower lip to chin divided by subnasale to upper lip')
  add('jaw-cheek', 'Jaw / cheek width', ratio(span(172, 397), span(234, 454)), 'ratio', 'Surface jaw and cheek proxies; not bony widths')
  const jawWidths = [[172, 397], [136, 365], [150, 379]].map(([a, b]) => Math.abs(rotated[b].x - rotated[a].x))
  add('jaw-taper', 'Lower jaw / upper jaw span', ratio(jawWidths[2], jawWidths[0]), 'ratio', 'Matched surface contour levels; visible taper, not bony gonial width')
  add('brow-eye-left', 'Left brow / eye width', ratio(span(70, 107), span(33, 133)), 'ratio', 'Brow end-to-end distance divided by eye width')
  add('brow-eye-right', 'Right brow / eye width', ratio(span(336, 300), span(362, 263)), 'ratio', 'Brow end-to-end distance divided by eye width')
  add('eye-width-difference', 'Eye width difference', eyeWidth > 1e-6 ? Math.abs(span(33, 133) - span(362, 263)) / eyeWidth * 100 : null, '%', 'Absolute paired difference divided by paired mean')
  const mouthAngle = angle(61, 291)
  add('mouth-axis', 'Mouth axis offset', mouthAngle === null ? null : Math.abs(mouthAngle), 'degrees', 'Mouth corner line relative to eye axis')
  const noseOffset = eyeSpan > 1e-6 ? Math.abs(rotated[1].x) / eyeSpan : null
  const faceTooSmall = eyeSpan < Math.min(input.width, input.height) * 0.04
  const cropped = points.some(point => point.x < 0 || point.y < 0 || point.x > input.width || point.y > input.height)
  const warnings = ['All values are approximate 2D image measurements, not physical millimeters.', 'No attractiveness grades or reference bands are applied in this lab.']
  if (input.points.length < 478) warnings.push('Iris landmarks are missing; pupil measurements use eye-center proxies.')
  if (noseOffset !== null && noseOffset > 0.15) warnings.push('Possible oblique pose or facial offset: retake front-on before interpreting symmetry or width ratios.')
  if (faceTooSmall) warnings.push('Face is too small for reliable measurements.')
  if (cropped) warnings.push('Face landmarks extend outside the image; some features may be cropped.')
  return { version: 2 as const, source: 'mediapipe-2d-geometry' as const, revision: 'landmark-lab-3-quality', metrics, quality: { faceTooSmall, cropped, rollDegrees: roll * 180 / Math.PI, noseOffsetRatio: noseOffset, pupilSource: input.points.length === 478 ? 'iris-centers' : 'eye-center-proxies', warnings } }
}
