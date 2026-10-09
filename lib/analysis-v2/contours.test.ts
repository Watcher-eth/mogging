import { expect, test } from 'bun:test'
import { contourGap } from './contours'

test('samples corresponding contour positions instead of diagonal point distances', () => {
  const points = [{x:0,y:0},{x:10,y:0},{x:0,y:0},{x:3,y:-1},{x:7,y:-3},{x:10,y:0},{x:0,y:0},{x:5,y:2},{x:10,y:0}]
  const result = contourGap(points, [2,3,4,5], [6,7,8], [0,1])!
  expect(result.maximum).toBeGreaterThan(4)
  expect(result.maximum).toBeLessThan(5)
  const rotated = points.map(p => ({x:-p.y+100,y:p.x+200}))
  expect(contourGap(rotated, [2,3,4,5], [6,7,8], [0,1])!.maximum).toBeCloseTo(result.maximum, 6)
})
test('coincident corners do not produce a made-up opening', () => {
  expect(contourGap([{x:0,y:0}], [0], [0], [0,0])).toBeNull()
})
