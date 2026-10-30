import { expect, test } from 'bun:test'
import { createVideoPainter, drawVideoFrame, inspectVideoScene, stationarySceneChrome, contentTransitionMotion, drawPortraitPrintSweep, portraitPrintSweepEdge, type PreparedVideo } from './video-renderer'
import { compileAnalysisVideo, createMotionTrack } from './video-composition'
import { scriptToPlan } from './script-edit'
import { explainerGraphicSchema } from './video-explainer'
import { reportCategories } from './mock-report-data'
import { mockReportRegions } from './mock-report'
import type { AnalysisPostInput } from './analysis-post'
import type { CanvasElement } from './canvas-layout'
import { captionDesign, portraitStage, videoContent, videoSize } from './video-layout'
import { featureComponent } from './report-choreography'

test('component captions retain finite positions after report rendering restores canvas state', () => {
  const calls: Array<{ text: string; x: number; y: number }> = []
  const images: unknown[] = []
  function context(record = false) {
    let state: Record<string, unknown> = { globalAlpha: 1, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const stack: Array<Record<string, unknown>> = []
    return new Proxy({}, { get: (_, key) => {
      if (key === 'save') return () => stack.push({ ...state })
      if (key === 'restore') return () => { state = stack.pop() ?? state }
      if (key === 'getTransform') return () => ({ ...state })
      if (key === 'setTransform') return (a: number, b: number, c: number, d: number, e: number, f: number) => { Object.assign(state, { a, b, c, d, e, f }) }
      if (key === 'translate') return (x: number, y: number) => { state.e = Number(state.e) + x * Number(state.a); state.f = Number(state.f) + y * Number(state.d) }
      if (key === 'scale') return (x: number, y: number) => { state.a = Number(state.a) * x; state.d = Number(state.d) * y }
      if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (key === 'fillText') return (text: string, x: number, y: number) => { if (record) calls.push({ text, x, y }) }
      if (key === 'drawImage') return (image: unknown) => { if (record) images.push(image) }
      return state[String(key)] ?? (() => {})
    }, set: (_, key, value) => { state[String(key)] = value; return true } }) as CanvasRenderingContext2D
  }
  const input = { formatId: 'score-reveal', subject: 'Test', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' } as AnalysisPostInput
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Show the eye spacing slider big in the center.'), input, ['face'], 'brand', reportCategories)
  composition.disclosure = 'Supplied reference photos · visual study · Example credit'
  const scene = composition.scenes.findLast(scene => scene.source.kind === 'component')!
  const native = context()
  const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: scene.source.report!, scroll: 0 } }
  const portrait = { width: 1024, height: 1400 }
  const asset = { image: null, secondary: null, portrait, overlay: null, slide, regions: mockReportRegions(native, scene.source.report!), scrollMax: 2000, initialScroll: 450 }
  const prepared = { composition, scenes: new Map([[scene.id, asset]]), incoming: { getContext: () => context(true) }, outgoing: { getContext: () => context() } } as unknown as PreparedVideo
  const elements: CanvasElement[] = []
  drawVideoFrame(context(), prepared, scene.startMs + 1600, 1080, 1920, false, element => elements.push(element))
  expect(calls.some(call => call.text.toLowerCase() === 'eye')).toBe(true)
  expect(calls.some(call => call.text === 'spacing')).toBe(true)
  expect(calls.every(call => Number.isFinite(call.x) && Number.isFinite(call.y))).toBe(true)
  expect(images).toContain(portrait)
  expect(images).toEqual([portrait])
  expect(calls.some(call => call.text === 'Example credit')).toBe(false)
  expect(calls.some(call => /supplied reference photos|visual study/i.test(call.text))).toBe(false)
  expect(elements.some(element => element.id === 'brand')).toBe(true)
  expect(elements.some(element => element.id === 'footer-notes')).toBe(false)
  images.length = 0
  calls.length = 0
  const layout = inspectVideoScene(prepared, scene.id, 1600)
  expect(layout.some(element => element.id === 'subject')).toBe(true)
  const portraitFrame = layout.find(element => element.id === 'portrait')!.frame
  expect(portraitFrame.x).toBe(0)
  expect(portraitFrame.width).toBe(portraitStage.width)
  expect(portraitFrame.y).toBeGreaterThanOrEqual(captionDesign.top + 200)
  expect(portraitFrame.height).toBeGreaterThan(1200)
  expect(portraitFrame.y + portraitFrame.height).toBe(videoSize.height)
  expect(layout.find(element => element.id === 'headline')!.frame.y).toBe(captionDesign.top)
  const metric = featureComponent(prepared.scenes.get(scene.id)!, scene).frame
  expect(metric.x).toBe(videoContent.inset)
  expect(metric.width).toBe(videoContent.width)
  expect(images).toHaveLength(0)
  expect(calls).toHaveLength(0)
})

test('cinematic cuts continuously blend both screens and reduced motion bypasses the blend', () => {
  const input = { formatId: 'score-reveal', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2' } as AnalysisPostInput
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Open the jaw report.'), input, ['face'], 'brand', reportCategories)
  const images: unknown[] = []
  let clears = 0
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'clearRect' ? () => { clears++ } : key === 'drawImage' ? (image: unknown) => images.push(image) : key === 'globalAlpha' ? 1 : key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {},
    set: () => true,
  }) as CanvasRenderingContext2D
  const surface = () => ({ getContext: () => ctx }) as unknown as HTMLCanvasElement
  const incoming = surface(), outgoing = surface()
  const scenes = composition.scenes.slice(0, 2).map((scene, index) => ({ ...scene, startMs: index * 2000, durationMs: 2000, source: { ...scene.source, kind: 'screen' as const }, framing: 'full' as const, tracks: [createMotionTrack('focus-cut', 'content', 2000)] }))
  const prepared = { composition: { ...composition, durationMs: 4000, scenes }, incoming, outgoing, scenes: new Map(scenes.map(scene => [scene.id, { image: null }])) } as unknown as PreparedVideo
  for (const primitive of ['focus-cut', 'luma-cut', 'cinematic-flow', 'liquid-ripple'] as const) {
    scenes[1].tracks[0].primitive = primitive
    for (const time of [2000, 2179, 2180, 2360]) {
      images.length = 0
      drawVideoFrame(ctx, prepared, time, 1080, 1920)
      expect(images).toEqual(time < 2360 ? [outgoing, incoming] : [incoming])
      images.length = 0
      drawVideoFrame(ctx, prepared, time, 1080, 1920, true)
      expect(images).toEqual([incoming])
    }
  }
  const fresh = { ...prepared }
  clears = 0
  drawVideoFrame(ctx, fresh, 2080, 1080, 1920)
  expect(clears).toBe(2)
  clears = 0
  drawVideoFrame(ctx, fresh, 2160, 1080, 1920)
  expect(clears).toBe(1)
})

test('linear same-photo handoffs keep one opaque portrait while interpolating framing across consecutive scenes', () => {
  const input = { formatId: 'score-reveal', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2' } as AnalysisPostInput
  const composition = compileAnalysisVideo(scriptToPlan('Look at the eyes. Look at the nose. Look at the jaw.'), input, ['face'], 'brand', reportCategories)
  const draws: Array<{ image: unknown; opacity: number }> = []
  function context() {
    let state: Record<string, number> = { globalAlpha: 1, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const stack: typeof state[] = []
    return new Proxy({}, { get: (_, key) => {
      if (key === 'save') return () => stack.push({ ...state })
      if (key === 'restore') return () => { state = stack.pop() ?? state }
      if (key === 'getTransform') return () => ({ ...state })
      if (key === 'setTransform') return (a: number, b: number, c: number, d: number, e: number, f: number) => Object.assign(state, { a, b, c, d, e, f })
      if (key === 'translate') return (x: number, y: number) => { state.e += x * state.a; state.f += y * state.d }
      if (key === 'scale') return (x: number, y: number) => { state.a *= x; state.d *= y }
      if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (key === 'drawImage') return (image: unknown) => draws.push({ image, opacity: state.globalAlpha })
      return state[String(key)] ?? (() => {})
    }, set: (_, key, value) => { state[String(key)] = value as number; return true } }) as CanvasRenderingContext2D
  }
  const surface = () => ({ getContext: () => context() }) as unknown as HTMLCanvasElement
  const incoming = surface(), outgoing = surface()
  const portraits = Array.from({ length: 3 }, () => ({ width: 1200, height: 1800 }))
  const scenes = composition.scenes.slice(0, 3).map((scene, index) => ({ ...scene, startMs: index * 2000, durationMs: 2000, source: { ...scene.source, imageId: 'face', kind: (index === 1 ? 'component' : 'portrait') as 'component' | 'portrait', overlay: 'none' as const }, framing: 'captioned' as const, editorial: 'context' as const, study: undefined, photoStudy: undefined, profileStudy: undefined, portraitFX: undefined, tracks: [createMotionTrack('crossfade', 'content', 2000)] }))
  const native = context()
  const prepared = { composition: { ...composition, scenes, durationMs: 6000 }, incoming, outgoing, scenes: new Map(scenes.map((scene, index) => [scene.id, { image: portraits[index], portrait: portraits[index], overlay: null, slide: { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: scene.source.report!, scroll: 0 } }, regions: mockReportRegions(native, scene.source.report!), scrollMax: 2000, initialScroll: 0 }])) } as unknown as PreparedVideo
  for (const primitive of ['crossfade', 'focus-cut', 'luma-cut', 'cinematic-flow', 'transition-panel', 'match-reframe', 'layout-morph', 'screen-push', 'wipe-left', 'wipe-right', 'wipe-up', 'card-reveal', 'liquid-ripple'] as const) {
    for (const scene of scenes.slice(1)) {
      scene.tracks[0].primitive = primitive
      for (const offset of [0, 90, 180, 270, 359]) {
        draws.length = 0
        drawVideoFrame(context(), prepared, scene.startMs + offset, 1080, 2340)
        const photoDraws = draws.filter(draw => portraits.includes(draw.image as typeof portraits[number]))
        expect(photoDraws).toHaveLength(1)
        expect(photoDraws[0].opacity).toBe(1)
        expect(draws.some(draw => draw.image === outgoing)).toBe(false)
        expect(draws.filter(draw => draw.image === incoming)).toHaveLength(1)
      }
    }
  }
  scenes[1].tracks.push({ ...createMotionTrack('slow-push', 'element', 2000), elementId: 'portrait', intensity: .4 })
  const subjectFrame = (time: number) => {
    const elements: CanvasElement[] = []
    drawVideoFrame(context(), prepared, time, 1080, 2340, false, element => elements.push(element))
    return elements.find(element => element.id === 'subject')!.frame
  }
  const start = subjectFrame(2000), middle = subjectFrame(2150), end = subjectFrame(2300)
  expect(start.height).not.toBe(end.height)
  expect(middle.height).toBeGreaterThan(Math.min(start.height, end.height))
  expect(middle.height).toBeLessThan(Math.max(start.height, end.height))
  expect(Object.values(middle).every(Number.isFinite)).toBe(true)
  const hiddenGuide = { primitives: [], dots: [], size: { width: 1200, height: 1800 } }
  for (const asset of prepared.scenes.values()) asset.overlay = hiddenGuide as NonNullable<typeof asset.overlay>
  const cleanElements: CanvasElement[] = []
  drawVideoFrame(context(), prepared, 3300, 1080, 2340, false, element => cleanElements.push(element))
  expect(cleanElements.some(element => element.id === 'overlay')).toBe(false)
  scenes[1].tracks.push({ ...createMotionTrack('pull-out', 'element', 2000), elementId: 'subject', durationMs: 2000 })
  const moving = { ...prepared }
  const movingFrame = (time: number) => {
    const elements: CanvasElement[] = []
    drawVideoFrame(context(), moving, time, 1080, 2340, false, element => elements.push(element))
    return elements.find(element => element.id === 'subject')!.frame
  }
  const boundary = scenes[1].startMs + scenes[1].tracks[0].durationMs
  const before = movingFrame(boundary - .01), after = movingFrame(boundary + .01)
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[key] - after[key])).toBeLessThan(.2)
  const reference = prepared.composition.scenes[2]
  reference.source.kind = 'explainer'; reference.source.imageId = null
  reference.graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'reference', label: 'Reference', diagram: 'profile' }] })
  const referenceAsset = prepared.scenes.get(reference.id)!
  referenceAsset.portrait = null
  referenceAsset.graphicSpecimen = { id: 'reference', label: 'Reference', imageId: 'face', image: portraits[0] as HTMLImageElement, crop: { x: 100, y: 200, width: 800, height: 1000 } }
  for (const offset of [0, 90, 180, 270]) {
    draws.length = 0
    drawVideoFrame(context(), prepared, reference.startMs + offset, 1080, 2340)
    expect(draws.some(draw => draw.image === outgoing)).toBe(false)
    const photo = draws.filter(draw => portraits.includes(draw.image as typeof portraits[number]))
    expect(photo).toHaveLength(1)
    expect(photo[0].opacity).toBe(1)
  }
  prepared.composition.scenes[0].portraitFX={print:'paper'}
  prepared.composition.scenes[1].portraitFX={print:'cmyk'}
  prepared.composition.scenes[1].source.kind='portrait'
  draws.length=0
  drawVideoFrame(context(),prepared,2090,1080,2340)
  const printDraws=draws.filter(draw=>portraits.includes(draw.image as typeof portraits[number]))
  expect(printDraws).toHaveLength(2)
  expect(printDraws.every(draw=>draw.opacity===1)).toBe(true)
  expect(draws.some(draw=>draw.image===outgoing)).toBe(false)
  prepared.composition.scenes[0].portraitFX=undefined;prepared.composition.scenes[1].portraitFX=undefined
  prepared.composition.scenes[1].source.kind='component'
  scenes[1].source.imageId = 'different-photo'
  draws.length = 0
  drawVideoFrame(context(), prepared, 2090, 1080, 2340)
  expect(draws.some(draw => draw.image === outgoing)).toBe(true)
})

test('stationary chrome is limited to captions with the same position, typography and backdrop role',()=>{
  const input={formatId:'score-reveal',overallScore:'7.1',potentialScore:'8.2'} as AnalysisPostInput
  const composition=compileAnalysisVideo(scriptToPlan('Look at the eyes. Look at the jaw.'),input,['face'],'brand',reportCategories)
  const [a,b]=composition.scenes.slice(0,2).map(scene=>({...scene,source:{...scene.source,kind:'portrait' as const,overlay:'none' as const},framing:'captioned' as const,editorial:'context' as const}))
  expect(stationarySceneChrome(a,b)).toBe(true)
  expect(stationarySceneChrome(a,{...b,source:{...b.source,kind:'report'}})).toBe(false)
  expect(stationarySceneChrome(undefined,b)).toBe(false)
})
test('directional and zoom transitions have exact endpoints and bounded non-spring motion',()=>{
  for(const variant of [0,1,2]) {
    const start=contentTransitionMotion(0,variant),end=contentTransitionMotion(1,variant)
    expect(start.fromX).toBeCloseTo(0);expect(start.fromY).toBeCloseTo(0);expect(start.fromScale).toBe(1)
    expect(end.toX).toBeCloseTo(0);expect(end.toY).toBeCloseTo(0);expect(end.toScale).toBe(1);expect(end.opacity).toBe(1)
    for(let p=0;p<=1;p+=.05) {
      const value=contentTransitionMotion(p,variant)
      expect(Object.values(value).every(Number.isFinite)).toBe(true)
      expect(value.fromScale).toBeGreaterThanOrEqual(.975);expect(value.toScale).toBeLessThanOrEqual(1.065)
      expect(value.opacity).toBeGreaterThanOrEqual(0);expect(value.opacity).toBeLessThanOrEqual(1)
    }
  }
})

test('matching caption layouts paint once on the final surface while content buffers transition underneath',()=>{
  const input={formatId:'score-reveal',overallScore:'7.1',potentialScore:'8.2'} as AnalysisPostInput
  const base=compileAnalysisVideo(scriptToPlan('Look at this report. Look at the next report.'),input,['face'],'brand',reportCategories)
  const text: Record<string,string[]>={incoming:[],outgoing:[],display:[]}
  const context=(name:string)=>new Proxy({globalAlpha:1},{get:(target,key)=>{
    if(key==='getTransform')return()=>({a:1,b:0,c:0,d:1,e:0,f:0})
    if(key==='measureText')return(value:string)=>({width:value.length*20})
    if(key==='createLinearGradient')return()=>({addColorStop(){}})
    if(key==='fillText')return(value:string)=>text[name].push(value)
    return Reflect.get(target,key)??(()=>{})
  },set:(target,key,value)=>Reflect.set(target,key,value)}) as unknown as CanvasRenderingContext2D
  const incoming={getContext:()=>context('incoming')},outgoing={getContext:()=>context('outgoing')}
  const scenes=base.scenes.slice(0,2).map((scene,index)=>({...scene,startMs:index*2000,durationMs:2000,framing:'captioned' as const,source:{...scene.source,kind:'screen' as const,imageId:`screen-${index}`},tracks:[createMotionTrack('cinematic-flow','content',2000)]}))
  const prepared={composition:{...base,scenes,durationMs:4000},incoming,outgoing,scenes:new Map(scenes.map(scene=>[scene.id,{image:null}]))} as unknown as PreparedVideo
  const frames=[]
  for(const offset of [30,150,300]){
    for(const list of Object.values(text))list.length=0
    const nodes:CanvasElement[]=[]
    drawVideoFrame(context('display'),prepared,2000+offset,1080,2340,false,node=>nodes.push(node))
    expect(text.incoming).toHaveLength(0);expect(text.outgoing).toHaveLength(0);expect(text.display.length).toBeGreaterThan(0)
    const headlines=nodes.filter(node=>node.id==='headline')
    expect(headlines).toHaveLength(1);frames.push(headlines[0].frame)
  }
  expect(frames[0]).toEqual(frames[1]);expect(frames[1]).toEqual(frames[2])
})

test('print changes sweep prepared pixels over one registered portrait with exact endpoints and no transparent blend',()=>{
  const from={width:1200,height:1800} as HTMLCanvasElement,to={width:1200,height:1800} as HTMLCanvasElement
  const draws:unknown[]=[]
  const ctx=new Proxy({globalAlpha:1},{get:(target,key)=>key==='drawImage'?(image:unknown)=>draws.push(image):Reflect.get(target,key)??(()=>{}),set:(target,key,value)=>Reflect.set(target,key,value)}) as unknown as CanvasRenderingContext2D
  drawPortraitPrintSweep(ctx,from,to,1200,1800,0);expect(draws).toEqual([from]);draws.length=0
  drawPortraitPrintSweep(ctx,from,to,1200,1800,.5);expect(draws).toEqual([from,to]);expect(ctx.globalAlpha).toBe(1);draws.length=0
  drawPortraitPrintSweep(ctx,from,to,1200,1800,1);expect(draws).toEqual([to])
  const start=portraitPrintSweepEdge(1200,1800,0),end=portraitPrintSweepEdge(1200,1800,1)
  expect(start.every(p=>p.x<0)).toBe(true);expect(end.every(p=>p.x>1200)).toBe(true)
  expect(portraitPrintSweepEdge(1200,1800,.5).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true)
})


test('an unavailable potential score stays invisible in both the top summary and the potential section', () => {
  const input = { formatId: 'score-reveal', subject: 'Test', hook: '', overallScore: '7', potentialScore: '', strongestFeature: 'Eyes', strongestScore: '7', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: '' } as AnalysisPostInput
  const scene = compileAnalysisVideo(scriptToPlan('Open the report.'), input, ['face'], 'brand', reportCategories).scenes[0]
  scene.source.hidePotential = true
  let alpha = 1
  const stack: number[] = [], visible: string[] = []
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? alpha : key === 'save' ? () => stack.push(alpha) : key === 'restore' ? () => { alpha = stack.pop()! } : () => {}, set: (_, key, value) => { if (key === 'globalAlpha') alpha = value; return true } }) as CanvasRenderingContext2D
  const paint = createVideoPainter(scene, 0, true)
  for (const id of ['scores/current', 'scores/potential', 'scores/potential/value', 'potential', 'potential/value']) paint(ctx, { id, frame: { x: 0, y: 0, width: 100, height: 100 }, draw: () => { if (alpha > 0) visible.push(id) } })
  expect(visible).toEqual(['scores/current'])
})
