import { refinePhotographedContours } from './refineFaceContours'
import { describe, expect, test } from 'bun:test'
import { hasCurrentFaceContours, faceContourRevision, landmarksFromFaces } from './faceLandmarks'

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


test('old cached outlines are invalidated and fresh results retain complete jaw and cheek paths',()=>{
  const result=landmarksFromFaces([detectedFace()],image)
  if(result.status!=='detected')throw Error('Expected detection')
  expect(hasCurrentFaceContours({...result.landmarks,detectorRevision:undefined})).toBe(false)
  expect(hasCurrentFaceContours(result.landmarks)).toBe(true)
  expect(result.landmarks.detectorRevision).toBe(faceContourRevision)
  expect(result.landmarks.contours!.jawline).toHaveLength(21)
  expect(result.landmarks.contours!.leftCheekbone).toHaveLength(5)
  expect(result.landmarks.contours!.leftSubmalar).toHaveLength(4)
})

test('photographed eyebrow edges replace a flat detector template with the actual arch',()=>{
  const width=400,height=400,data=new Uint8ClampedArray(width*height*4).fill(255)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const top=90+(x-125)**2*.004,inside=x>=80&&x<=170&&y>=top&&y<=top+10,i=(y*width+x)*4
    data[i]=data[i+1]=data[i+2]=inside?30:210
  }
  const points=[{x:.2,y:.24},{x:.425,y:.24},{x:.425,y:.28},{x:.2,y:.28},{x:.2,y:.24}]
  const brow=[points[0],{x:.26,y:.24},{x:.32,y:.24},{x:.38,y:.24},points[1],points[2],{x:.36,y:.28},{x:.3,y:.28},{x:.24,y:.28},points[3],points[0]]
  const face={version:1 as const,source:'mediapipe-face-landmarker' as const,confidence:1,image:{width,height},anchors:{leftPupil:{x:.25,y:.4},rightPupil:{x:.65,y:.4},leftBrow:{x:.31,y:.24}},contours:{leftBrow:brow}}
  const result=refinePhotographedContours(face,{width,height,data}),outline=result.contours!.leftBrow!
  expect(outline.length).toBeGreaterThan(30)
  expect(outline[0]).toEqual(outline.at(-1)!)
  const top=outline.filter(p=>p.y<.25)
  expect(Math.min(...top.map(p=>p.y))*height).toBeLessThan(93)
  expect(outline.every(p=>p.x>=.19&&p.x<=.44&&p.y>=.22&&p.y<=.28)).toBe(true)
})
