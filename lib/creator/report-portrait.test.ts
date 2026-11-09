import { expect, test } from 'bun:test'
import { drawReportPortraitFade, reportPortraitFade, reportPortraitCrop, reportPortraitProjection } from './report-portrait'

test('report portraits fade only at the bottom and retain clear side edges', () => {
  const gradients: Array<{ coordinates: number[]; stops: Array<[number, string]> }> = []
  const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? (...coordinates: number[]) => {
    const gradient = { coordinates, stops: [] as Array<[number, string]> }
    gradients.push(gradient)
    return { addColorStop: (position: number, color: string) => gradient.stops.push([position, color]) }
  } : () => {}, set: () => true }) as CanvasRenderingContext2D
  drawReportPortraitFade(context, 390, 465)
  expect(gradients).toHaveLength(1)
  expect(gradients[0].coordinates).toEqual([0, 465 * .56, 0, 465])
  expect(gradients[0].stops).toHaveLength(33)
  expect(gradients[0].stops[0][1]).toBe('rgba(255,255,255,0)')
  expect(gradients[0].stops.at(-2)![1]).toBe('rgba(255,255,255,1)')
  expect(gradients[0].stops.at(-1)![1]).toBe('rgba(255,255,255,1)')
  expect(reportPortraitFade.layers.map(layer => layer.start)).toEqual([0, .2, .4, .6])
})


test('wide portraits center the detected face and retain neck and shoulder room above the report fade', async () => {
  const { previewLandmarks } = await import('@/components/landing/overlay')
  const image={width:3200,height:2400},viewport={width:390,height:465}
  const face={...previewLandmarks,anchors:{...previewLandmarks.anchors,forehead:{x:.72,y:.25},chin:{x:.72,y:.48}},contours:{...previewLandmarks.contours,faceOutline:[{x:.64,y:.25},{x:.8,y:.25},{x:.8,y:.4},{x:.72,y:.48},{x:.64,y:.4}]}}
  const crop=reportPortraitCrop(image,face,viewport)!
  expect(crop).toBeDefined()
  expect(crop.x).toBeGreaterThan(.4)
  expect(crop.x+crop.width).toBeLessThanOrEqual(1)
  expect(crop.y+crop.height).toBeLessThanOrEqual(1)
  expect(crop.width*image.width/(crop.height*image.height)).toBeCloseTo(viewport.width/viewport.height)
  expect(crop.y+crop.height-face.anchors.chin.y).toBeGreaterThan(.15)
  const projection=reportPortraitProjection(image,viewport,crop)
  expect(projection.offsetX+.72*image.width*projection.scale).toBeCloseTo(viewport.width/2)
  expect(projection.offsetY+.48*image.height*projection.scale).toBeLessThan(viewport.height*.58)
  const {createReportOverlay}=await import('./report-overlay')
  const {reportCategories}=await import('./mock-report-data')
  const category=reportCategories[0]
  const overlay=createReportOverlay({id:'crop',templateId:'mock-report',imageId:'photo',eyebrow:'',headline:'',supportingCopy:'',metricLabel:'',metricValue:'',cta:'',potentialScore:'',categoryId:category.id,overlayStyle:'category',currentScore:'7',categoryScores:[],mockReport:{category,scroll:0}} as Parameters<typeof createReportOverlay>[0],{...image,landmarks:face} as Parameters<typeof createReportOverlay>[1],viewport,390,true)
  expect(overlay.portraitCrop).toEqual(crop)
  expect(reportPortraitCrop(image,{...face,confidence:.2},viewport)).toBeUndefined()
  expect(reportPortraitCrop(image,null,viewport)).toBeUndefined()
  const headshot={...face,anchors:{...face.anchors,forehead:{x:.5,y:.15},chin:{x:.5,y:.68}}}
  expect(reportPortraitCrop(image,headshot,viewport)).toBeUndefined()
})
