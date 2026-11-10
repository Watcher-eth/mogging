import { describe, expect, test } from 'bun:test'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { faceContourPaths, faceContourEdge } from '@/lib/creator/face-metric-guides'
import { preciseFaceOverlay, drawFaceTreatment } from '@/lib/creator/face-treatment'
import { landmarksFromFaces } from './faceLandmarks'

const image = { width: 1000, height: 2000 }
function detectedFace() {
  const points = Array.from({ length: 478 }, (_, index) => ({ x: .3 + (index % 10) * .03, y: .3 + (index % 7) * .03 }))
  points[468] = { x: .3, y: .3 }
  points[473] = { x: .5, y: .4 }
  return points
}

describe('local face detection', () => {
  test('distinguishes no face from ambiguous multiple faces', () => {
    expect(landmarksFromFaces([], image).status).toBe('no-face')
    expect(landmarksFromFaces([detectedFace(), detectedFace()], image).status).toBe('multiple-faces')
  })
  test('calculates roll in physical pixels rather than normalized square coordinates', () => {
    const result = landmarksFromFaces([detectedFace()], image)
    expect(result.status).toBe('detected')
    if (result.status !== 'detected') throw new Error('Expected detection')
    expect(result.landmarks.quality?.rollRadians).toBeCloseTo(Math.PI / 4)
    expect(result.landmarks.anchors.leftPupil).toEqual({ x: .3, y: .3 })
    const brow=result.landmarks.contours!.leftBrow!
    expect(brow).toHaveLength(11)
    expect(brow[0]).toEqual(brow.at(-1)!)
  })
  test('drops a broken contour without shifting the remaining vertex indices', () => {
    const points = detectedFace()
    points[246] = { x: NaN, y: .4 }
    points[1] = { x: 2, y: .5 }
    const result = landmarksFromFaces([points], image)
    if (result.status !== 'detected') throw new Error('Expected detection')
    expect(result.landmarks.contours?.leftEye).toEqual([])
    expect(result.landmarks.anchors.noseTip).toBeUndefined()
    expect(result.landmarks.contours?.rightEye?.length).toBeGreaterThan(0)
  })
})

test('normalization retains measured brow edges and the report frames them with one balanced outline', () => {
  const mesh=detectedFace()
  const upper=[{x:.24,y:.29},{x:.28,y:.275},{x:.32,y:.27},{x:.36,y:.28},{x:.39,y:.30}]
  const lower=[{x:.39,y:.32},{x:.36,y:.30},{x:.32,y:.29},{x:.28,y:.30},{x:.24,y:.31}]
  ;[70,63,105,66,107,55,65,52,53,46].forEach((index,i)=>{mesh[index]=[...upper,...lower][i]})
  ;[336,296,334,293,300,276,283,282,295,285].forEach((index,i)=>{const point=[...upper,...lower][i];mesh[index]={x:1-point.x,y:point.y}})
  const detected=landmarksFromFaces([mesh],image)
  if(detected.status!=='detected')throw Error('Expected detection')
  const face=enrichFaceLandmarks(detected.landmarks)!
  expect(face.contours!.leftBrow).toEqual([...upper,...lower,upper[0]])
  expect(faceContourPaths(face,'leftBrow')).toEqual([upper,lower])
  expect(faceContourEdge(face,'leftBrow',true)).toEqual([upper])
  expect(faceContourEdge(face,'leftBrow',false)).toEqual([lower])
  const result=preciseFaceOverlay({size:{width:360,height:540},primitives:[],dots:[]},{...image,landmarks:face},'brows')
  const paths=result.primitives.filter(p=>p.id.startsWith('feature-leftBrow'))
  expect(paths).toHaveLength(1)
  expect(paths.every(p=>p.kind==='polyline' && p.closed)).toBe(true)
  const markerXs:number[]=[]
  const ctx=new Proxy({globalAlpha:1},{get:(target,key)=>{
    if(key==='globalAlpha')return target.globalAlpha
    if(key==='getTransform')return ()=>({a:3,b:0})
    if(key==='fillText')return (label:string,x:number)=>{if(/^\d{2}$/.test(label))markerXs.push(x)}
    if(key==='measureText')return ()=>({width:18})
    return ()=>{}
  }}) as unknown as CanvasRenderingContext2D
  drawFaceTreatment(ctx,result,360,4000,true)
  expect(markerXs.some(x=>x<180)).toBe(true)
  expect(markerXs.some(x=>x>180)).toBe(true)

})
