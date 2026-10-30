import { portraitPrintStyles } from './portrait-print'
import { expect, test } from 'bun:test'
import { creatorSubjects, creatorStyleDirections } from './creator-catalog'
import { compileAnalysisVideo, parseComposition } from './video-composition'
import { customSlides, customSlideTemplates, customLibraryComposition, slideCategories, portraitTreatments, portraitTreatment, customSlideId, replaceCustomSlide, moveCustomClip } from './custom-video'
import { metricTimelineStyles } from './metric-timeline'
import { explainerLayouts } from './video-explainer'
import { scriptToPlan } from './script-edit'
import { reportCategories } from './mock-report-data'
import type { AnalysisPostInput } from './analysis-post'

const input = { formatId: 'feature-audit', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' } as AnalysisPostInput
const example = creatorSubjects[0].example
const build = () => compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: 'portrait-audit', directions: creatorStyleDirections(example, 'portrait-audit') })

test('every custom slide can replace any segment without changing its script or timing', () => {
  const original = build()
  for (const scene of original.scenes) for (const slide of customSlides) {
    const next = replaceCustomSlide(original, scene.id, slide.id, input)
    const edited = next.scenes.find(item => item.id === scene.id)!
    expect(customSlideId(edited)).toBe(slide.id)
    expect(next.durationMs).toBe(original.durationMs)
    expect(next.script).toEqual(original.script)
    expect(next.scenes.map(item => [item.id, item.narration, item.startMs, item.durationMs, item.words])).toEqual(original.scenes.map(item => [item.id, item.narration, item.startMs, item.durationMs, item.words]))
    expect(() => parseComposition(next)).not.toThrow()
  }
})

test('clip reordering moves the selected clip, retains every narration and duration, and reflows valid script ranges', () => {
  const original = build(), first = original.scenes[0], last = original.scenes.at(-1)!
  const next = moveCustomClip(original, first.id, last.id)
  expect(next.scenes.at(-1)!.id).toBe(first.id)
  expect(next.durationMs).toBe(original.durationMs)
  expect(next.scenes.map(scene => scene.narration).sort()).toEqual(original.scenes.map(scene => scene.narration).sort())
  expect(next.scenes.map(scene => scene.durationMs).sort()).toEqual(original.scenes.map(scene => scene.durationMs).sort())
  expect(() => parseComposition(next)).not.toThrow()
  expect(moveCustomClip(original, first.id, first.id)).toBe(original)
  expect(moveCustomClip(original, 'missing', first.id)).toBe(original)
})


test('the complete categorized library produces valid previews for every supported graphic family', () => {
  const original = build()
  const library = customLibraryComposition(original, original.scenes[0].id, input, customSlides)
  expect(library.scenes).toHaveLength(customSlides.length)
  expect(new Set(customSlides.map(slide => slide.id)).size).toBe(customSlides.length)
  expect(customSlideTemplates.every(template => template.category !== 'All layouts' && slideCategories.includes(template.category))).toBe(true)
  const layouts = new Set(library.scenes.map(scene => scene.graphic?.layout))
  for (const layout of explainerLayouts.filter(layout => layout !== 'statement')) expect(layouts.has(layout)).toBe(true)
  expect(library.durationMs).toBeLessThanOrEqual(180000)
  expect(() => parseComposition(library)).not.toThrow()
})


test('each timeline treatment remains distinct through library composition normalization', () => {
  const original = build(), timelines = customSlides.filter(slide => slide.id.startsWith('timeline-'))
  const library = customLibraryComposition(original, original.scenes[0].id, input, timelines)
  expect(library.scenes.map(scene => scene.graphic?.timelineStyle)).toEqual(metricTimelineStyles.map((_, index) => index))
})


test('base templates partition every slide treatment without duplicating layouts', () => {
  const options = customSlideTemplates.flatMap(template => template.options)
  expect(options.map(slide => slide.id).sort()).toEqual(customSlides.map(slide => slide.id).sort())
  expect(new Set(options.map(slide => slide.id)).size).toBe(customSlides.length)
  expect(customSlideTemplates.length).toBeLessThan(customSlides.length / 2)
  const family = (id: string) => customSlideTemplates.find(template => template.id === id)!.options
  expect(family('portrait').map(slide => slide.id)).toEqual(expect.arrayContaining(['portrait', 'overlay-eyes', 'lighting', 'rim', 'split']))
  expect(family('grid').filter(slide => slide.variant !== undefined)).toHaveLength(metricTimelineStyles.length)
  expect(family('report')).toHaveLength(5)
  expect(family('comparison')).toHaveLength(10)
  expect(family('comparison')[0].id).toBe('comparison')
  expect(family('comparison').map(slide=>slide.id)).toEqual(expect.arrayContaining(['edit-natural-freckles','edit-facial-thirds','edit-facial-width']))
  for (const slide of [...customSlides, ...customSlideTemplates]) expect(slide.detail).toMatch(/^[A-Z].+\.$/)
})


test('print treatments retain the portrait layout, measurement guides and script', () => {
  const original = build(), id = original.scenes[0].id
  const portrait = replaceCustomSlide(original, id, 'portrait', input).scenes[0]
  for (const { id: print } of portraitPrintStyles) {
    const next = replaceCustomSlide(original, id, `print-${print}`, input)
    const scene = next.scenes[0]
    expect(scene.portraitFX?.print).toBe(print)
    expect(scene.source).toEqual(portrait.source)
    expect([scene.layout, scene.framing, scene.editorial, scene.focus]).toEqual([portrait.layout, portrait.framing, portrait.editorial, portrait.focus])
    expect(scene.words).toEqual(portrait.words)
    expect(next.script).toEqual(original.script)
    expect(customSlideTemplates.find(template => template.id === 'portrait')!.options.some(option => option.id === `print-${print}`)).toBe(true)
  }
})


test('layout categories and portrait looks form separate complete groups', () => {
  expect(new Set(customSlideTemplates.map(template => template.category))).toEqual(new Set(['Portraits', 'App reports', 'Graphics']))
  expect(customSlideTemplates.filter(template => template.category === 'App reports').map(template => template.id)).toEqual(['report'])
  const portraits = customSlideTemplates.find(template => template.id === 'portrait')!.options
  const groups = portraitTreatments.map(treatment => portraits.filter(slide => portraitTreatment(slide) === treatment))
  expect(groups.flat().map(slide => slide.id).sort()).toEqual(portraits.map(slide => slide.id).sort())
  expect(groups.every(group => group.length > 0)).toBe(true)
  expect(groups[1].every(slide => slide.kind === 'lighting')).toBe(true)
  expect(groups[2].every(slide => slide.kind === 'print')).toBe(true)
})


test('Paper and Color print recur without covering lighting or shape edits', () => {
  for (const recipe of ['portrait-audit', 'measurement-explainer', 'hybrid-story'] as const) {
    const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe, directions: creatorStyleDirections(example, recipe) })
    const printed = composition.scenes.filter(scene => scene.portraitFX?.print === 'cmyk')
    expect(printed.length).toBeGreaterThan(0)
    expect(composition.scenes.some(scene=>scene.portraitFX?.print==='paper')).toBe(true)
    expect(printed.every(scene => customSlides.some(slide => slide.id === customSlideId(scene)))).toBe(true)
    expect(printed.every(scene => scene.source.kind === 'portrait' && !scene.portraitFX?.lighting && !scene.photoStudy && !scene.profileStudy)).toBe(true)
    expect(composition.scenes.filter(scene => scene.source.kind === 'portrait' && !scene.portraitFX?.print).length).toBeGreaterThan(0)
  }
  const report = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: 'report-led', directions: creatorStyleDirections(example, 'report-led') })
  expect(report.scenes.some(scene => scene.portraitFX?.print)).toBe(false)
})


test('custom metric guides and image filters compose without resetting the focus or framing', () => {
  const original = build(), id = original.scenes[0].id
  const metric = replaceCustomSlide(original, id, 'metric-eyes.inner-gap', input)
  const printed = replaceCustomSlide(metric, id, 'print-cmyk', input)
  const scene = printed.scenes[0]
  expect(scene.focus).toBe('metric:eyes.inner-gap')
  expect(scene.editorial).toBe('detail')
  expect(scene.portraitFX?.print).toBe('cmyk')
  expect(scene.source).toEqual(metric.scenes[0].source)
  const changed = replaceCustomSlide(printed, id, 'metric-nose.width', input).scenes[0]
  expect(changed.focus).toBe('metric:nose.width')
  expect(changed.portraitFX?.print).toBe('cmyk')
})


test('particle and tracking presets use one portrait treatment and preserve audio, frame guards and deterministic anchors', async () => {
  const { portraitInstruments, instrumentAnchors, instrumentLinks, trackerAcquisition, particleAssembly } = await import('./portrait-instruments')
  const { previewLandmarks } = await import('@/components/landing/overlay')
  const original=build(),id=original.scenes[0].id
  for(const effect of portraitInstruments){
    const next=replaceCustomSlide(original,id,effect.id,input),scene=next.scenes[0]
    expect(scene.source.kind).toBe('portrait')
    if(effect.id !== 'specimen-frame') expect(scene.source.overlay).toBe('none')
    expect(scene.portraitFX?.instrument).toBeDefined()
    if(effect.id !== 'specimen-frame') expect(scene.portraitFX?.print).toBeUndefined()
    if(effect.id !== 'specimen-frame') expect(scene.portraitProgram).toBeUndefined()
    expect(next.script).toEqual(original.script)
    expect(scene.words).toEqual(original.scenes[0].words)
  }
  expect(instrumentAnchors(null)).toEqual([])
  expect(instrumentAnchors({...previewLandmarks,confidence:.2})).toEqual([])
  const points=instrumentAnchors(previewLandmarks)
  expect(points.length).toBeGreaterThan(6)
  for(const point of points) expect(point).toMatchObject({x:previewLandmarks.anchors[point.id]!.x,y:previewLandmarks.anchors[point.id]!.y})
  const links=instrumentLinks(points)
  expect(links).toEqual(instrumentLinks(points))
  expect(new Set(links.map(edge=>edge.join(':'))).size).toBe(links.length)
  expect(links.every(([a,b])=>a<b&&Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y)<.32)).toBe(true)
  expect(trackerAcquisition(0,4)).toBe(0)
  expect(trackerAcquisition(2000,4)).toBe(1)
  expect(trackerAcquisition(0,4,true)).toBe(1)
  expect(particleAssembly(0,true)).toBe(1)
})


test('all five instrument layers are independently composable without changing narration or score sources', async () => {
  const { updatePortraitInstrument } = await import('./custom-video')
  const original = build(), id = original.scenes[0].id
  for(let mask=0;mask<32;mask++){
    const patch = {particles:'none' as const,trackers:mask&1?'sparse' as const:'none' as const,links:Boolean(mask&2),scan:Boolean(mask&4),trails:Boolean(mask&8),marks:Boolean(mask&16)}
    const next=updatePortraitInstrument(original,id,patch,input),scene=next.scenes[0]
    expect(scene.portraitFX!.instrument).toMatchObject(patch)
    expect(scene.source.report).toEqual(original.scenes[0].source.report)
    expect(scene.words).toEqual(original.scenes[0].words)
    expect(next.script).toEqual(original.script)
    expect(next.durationMs).toBe(original.durationMs)
    expect(customSlideId(scene)).toBeTruthy()
  }
  const links=updatePortraitInstrument(original,id,{links:true},input).scenes[0].portraitFX!.instrument!
  expect(links.trackers).toBe('none')
  expect(links.particles).toBe('none')
})


test('trackers travel continuously with varied small sizes, avoid clusters and seek deterministically',async()=>{
  const {sampleInstrumentTracks}=await import('./portrait-instruments')
  const {previewLandmarks}=await import('@/components/landing/overlay')
  const face=previewLandmarks as Parameters<typeof sampleInstrumentTracks>[0]
  const first=sampleInstrumentTracks(face,1800),next=sampleInstrumentTracks(face,1816),later=sampleInstrumentTracks(face,4200)
  expect(first.length).toBeLessThanOrEqual(4)
  expect(first.length).toBeGreaterThan(2)
  expect(new Set(first.map(p=>p.radius)).size).toBeGreaterThan(2)
  expect(Math.max(...first.map(p=>p.radius))).toBeLessThanOrEqual(12)
  expect(first).toEqual(sampleInstrumentTracks(face,1800))
  expect(first.some((p,i)=>Math.hypot(p.x-later[i].x,p.y-later[i].y)>.02)).toBe(true)
  expect(first.every((p,i)=>Math.hypot(p.x-next[i].x,p.y-next[i].y)<.015)).toBe(true)
  expect(first.every(p=>p.opacity===1)).toBe(true)
  for(const time of [0,1200,3000,5400,8200]) {
    const tracks=sampleInstrumentTracks(face,time)
    expect(tracks.length).toBeGreaterThanOrEqual(3)
    for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++) expect(Math.hypot(tracks[i].x-tracks[j].x,(tracks[i].y-tracks[j].y)*face!.image.height/face!.image.width)).toBeGreaterThan(.085)
  }
  expect(sampleInstrumentTracks(face,0,true,true)).toEqual(sampleInstrumentTracks(face,8000,true,true))
  expect(sampleInstrumentTracks(null,1000)).toEqual([])
})
