import { describe, expect, test } from 'bun:test'
import { landmarkInputSchema, measureLandmarks, type LandmarkInput } from './measurements'

function mesh(): LandmarkInput {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  for (const [index, x, y] of [[33, .25, .4], [133, .4, .4], [362, .6, .4], [263, .75, .4], [468, .325, .4], [473, .675, .4], [159, .325, .38], [145, .325, .42], [386, .675, .38], [374, .675, .42], [61, .35, .65], [291, .65, .65], [64, .425, .55], [294, .575, .55], [98, .425, .55], [327, .575, .55]]) points[index] = { x, y, z: 0 }
  return { width: 1000, height: 800, points }
}
const metric = (input: LandmarkInput, id: string) => measureLandmarks(input).metrics.find(item => item.id === id)!.value

describe('isolated v2 geometry', () => {
  test('uses pixel distances rather than distorted normalized distances', () => {
    expect(metric(mesh(), 'eye-aspect-left')).toBeCloseTo(150 / 32, 3)
    expect(metric(mesh(), 'mouth-nose')).toBeCloseTo(2, 3)
  })
  test('measurements survive pixel rotation, including compensated angles', () => {
    const original = mesh()
    const angle = .25
    const rotated = { ...original, points: original.points.map(point => {
      const x = point.x * original.width - 500
      const y = point.y * original.height - 400
      return { x: (x * Math.cos(angle) - y * Math.sin(angle) + 500) / original.width, y: (x * Math.sin(angle) + y * Math.cos(angle) + 400) / original.height, z: 0 }
    }) }
    for (const id of ['eye-aspect-left', 'mouth-nose', 'canthal-left', 'canthal-right', 'mouth-axis']) expect(metric(rotated, id)).toBeCloseTo(metric(original, id)!, 3)
  })
  test('missing irises have an explicit proxy source', () => {
    const input = mesh()
    input.points = input.points.slice(0, 468)
    expect(measureLandmarks(input).quality.pupilSource).toBe('eye-center-proxies')
  })
  test('zero-width features return unavailable rather than infinity', () => {
    const input = mesh()
    input.points = input.points.map(() => ({ x: .5, y: .5, z: 0 }))
    expect(metric(input, 'mouth-nose')).toBeNull()
    expect(JSON.stringify(measureLandmarks(input))).not.toContain('Infinity')
  })
  test('rejects sparse, nonfinite, or oversized meshes', () => {
    expect(landmarkInputSchema.safeParse({ ...mesh(), points: [] }).success).toBe(false)
    expect(landmarkInputSchema.safeParse({ ...mesh(), width: Infinity }).success).toBe(false)
    expect(landmarkInputSchema.safeParse({ ...mesh(), points: Array(500).fill({ x: 0, y: 0, z: 0 }) }).success).toBe(false)
  })
})
