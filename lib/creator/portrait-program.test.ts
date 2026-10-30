import {faceContourPaths,faceContourEdge} from './face-metric-guides'
import { videoThemeContext } from './video-theme'
import { expect, test } from 'bun:test'
import { planPortraitProgram, preparePortraitProgram, samplePortraitProgram, drawPortraitActivity, portraitAnnotation, drawPortraitLabel, portraitLabelLines, portraitAnnotationInk, placePortraitAnnotation } from './portrait-program'
import { portraitExposureAt, portraitLightingSchema, portraitLightGeometry, samplePortraitLighting } from './video-portrait-effects'
import { compileProductionVideo, productionVisualPlan, productionTimeline } from './video-production'
import { createProductionDraft } from './production-drafts'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles } from './creator-catalog'
import { reportCategories } from './mock-report-data'
import { scriptTokens } from './video-script'
import { voiceDirection } from './video-speech'
import { previewLandmarks } from '@/components/landing/overlay'
import type { GeneratorImage } from './content-generator'
import type { AnalysisPostInput } from './analysis-post'
const source: GeneratorImage = { id:'face',name:'Face geometry fixture',dataUrl:'',width:1200,height:1800,status:'ready',landmarks:{ ...previewLandmarks, image:{width:1200,height:1800} } as GeneratorImage['landmarks'] }
const input = {formatId:'feature-audit',hook:'',recommendation:'',cta:'',subject:'Clavicular',overallScore:'7.1',potentialScore:'8.2',strongestFeature:'Eyes',strongestScore:'8.1',opportunityFeature:'Jaw',opportunityScore:'6.2',productFeatures:[]} as AnalysisPostInput
const text = 'Follow the jaw outline from the cheek toward the chin and watch how the width relates to the lower frame of the face.'

test('long beats develop multiple anatomical guides and treatments, deterministically and without changing words', () => {
  const signatures = new Set<string>()
  for (let variant=0; variant<6; variant++) {
    const program = planPortraitProgram(text,'jaw','feature-study',variant,'front')
    expect(program).toEqual(planPortraitProgram(text,'jaw','feature-study',variant,'front'))
    expect(program.actions.length).toBeGreaterThanOrEqual(4)
    expect(new Set(program.actions.map(action=>action.treatment)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(program.actions.map(action=>action.guide)).size).toBeGreaterThanOrEqual(1)
    expect(program.actions.every(action=>action.word<program.wordCount && ['jaw', 'cheeks'].includes(action.feature))).toBe(true)
    signatures.add(JSON.stringify(program.actions))
  }
  expect(signatures.size).toBeGreaterThan(2)
  const generic = planPortraitProgram('Follow the jaw and chin while watching this region in the portrait as the explanation continues across the lower face.', 'jaw', 'feature-study', 0, 'front')
  expect(new Set(generic.actions.map(action => action.guide)).size).toBeGreaterThanOrEqual(3)
})
test('prepared action geometry changes during a seven-second shot, and arbitrary seeks are deterministic', () => {
  const prepared = preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',0,'front'),source)
  expect(prepared.actions.length).toBeGreaterThan(3)
  for(let ms=0;ms<7000;ms+=250) {
    const current=samplePortraitProgram(prepared,ms,7000)!
    expect(current).toEqual(samplePortraitProgram(prepared,ms,7000)!)
    expect(current.phase).toBeGreaterThanOrEqual(0);expect(current.phase).toBeLessThanOrEqual(1)
    expect(current.to.primitives.length).toBeGreaterThan(0)
  }
  const signatures = [900,1900,2900,3900,4900,5900].map(ms=>JSON.stringify(samplePortraitProgram(prepared,ms,7000)))
  expect(new Set(signatures).size).toBe(6)
})
test('actions follow measured spoken words, including pauses, rather than guessed uniform time', () => {
  const prepared = preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',1,'front'),source)
  const words = scriptTokens(text).map((_,i)=>({startMs:i*300+(i>=6?1000:0)}))
  const before=samplePortraitProgram(prepared,words[6].startMs-1,9000,words)!
  const after=samplePortraitProgram(prepared,words[6].startMs+1,9000,words)!
  expect(before.to).toBe(prepared.actions[0].overlay)
  expect(after.to).toBe(prepared.actions[1].overlay)
  expect(after.blend).toBeLessThan(.001)
  expect(samplePortraitProgram(prepared,2500,9000,words,true)!.phase).toBe(1)
})
test('one geometry morph owns the overlay and full-source warps carry its anchors', () => {
  const prepared = preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',2,'front'),source)
  const activity = samplePortraitProgram(prepared,1600,7000)!
  const original = JSON.stringify(prepared)
  const points: number[]=[]
  const ctx = {save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},moveTo(x:number,y:number){points.push(x,y)},lineTo(x:number,y:number){points.push(x,y)},stroke(){},fill(){},arc(){},roundRect(){},measureText(text:string){return{width:text.length*12}},fillText(){},globalAlpha:1} as unknown as CanvasRenderingContext2D
  drawPortraitActivity(ctx,activity,1200,1800)
  expect(points.length).toBeGreaterThan(10)
  expect(points.every(Number.isFinite)).toBe(true)
  const unchanged = [...points]; points.length = 0
  drawPortraitActivity(ctx, activity, 1200, 1800, { mode: 'stretch', axis: 'x', regions: [{ x: .5, y: .7, rx: .45, ry: .4 }], strengths: [.15] })
  expect(points).not.toEqual(unchanged)
  expect(JSON.stringify(prepared)).toBe(original)
})
test('side-profile programs stay feature-specific rather than adding unrelated facial annotations', () => {
  const nose = planPortraitProgram('Watch the nose bridge and tip as the side profile becomes visible.','nose','feature-study',0,'profile')
  expect(nose.actions.every(action=>action.guide==='profile:nose')).toBe(true)
  const jaw = planPortraitProgram(text,'jaw','feature-study',0,'profile')
  expect(jaw.actions.every(action=>['profile:jaw','profile:angle','profile:chin','profile:cheek'].includes(action.guide))).toBe(true)
  expect(new Set(jaw.actions.map(action=>action.guide)).size).toBeGreaterThanOrEqual(3)
})
test('directional light stays continuous through forehead, neck and shoulders with no head-mask seam', () => {
  const light=portraitLightingSchema.parse({preset:'split',target:'whole',ambientEv:-.65,intensity:1.5,radius:1.3,lightX:.7,color:'natural'})
  const face=portraitLightGeometry(source.landmarks,light)
  for(const x of [.2,.35,.5,.7,.8]) {
    const values=[.15,.3,.5,.7,.9].map(y=>portraitExposureAt(light,face,{x,y}))
    expect(new Set(values).size).toBe(1)
    expect(values.every(ev=>ev>=-.85 && ev<=.38)).toBe(true)
  }
  expect(portraitExposureAt(light,face,{x:.75,y:.5})).toBeGreaterThan(portraitExposureAt(light,face,{x:.25,y:.5}))
  const reversed={...light,lightX:-.7}
  expect(portraitExposureAt(reversed,face,{x:.25,y:.9})).toBeGreaterThan(portraitExposureAt(reversed,face,{x:.75,y:.9}))
})
test('soft frontal lighting restores neutral exposure when the narrator says softer, on the actual word clock', () => {
  const light=portraitLightingSchema.parse({preset:'split',target:'whole',ambientEv:-.65})
  const narration='Side lighting deepens the shadows; softer frontal light reduces the contrast.'
  const words=scriptTokens(narration).map((_,i)=>({startMs:i*300+(i>=5?1000:0)}))
  expect(samplePortraitLighting(light,narration,1000,7000,words).preset).toBe('split')
  const soft=samplePortraitLighting(light,narration,words[5].startMs+701,7000,words)
  expect(soft.preset).toBe('soft');expect(soft.color).toBe('natural')
  const face=portraitLightGeometry(source.landmarks,soft)
  expect(portraitExposureAt(soft,face,{x:.2,y:.9})).toBeCloseTo(.06)
  expect(portraitExposureAt(soft,face,{x:.8,y:.2})).toBeCloseTo(.06)
})
test('every creator format schedules action programs for every directed portrait and preserves complete cue identities', () => {
  for(const style of creatorVideoStyles) {
    const script=createProductionDraft('Clavicular')
    const images=creatorSubjectPhotos(creatorSubjects.find(subject=>subject.id==='clavicular')!)!
    const video=compileProductionVideo(script,input,images,reportCategories,style.id,voiceDirection('editorial'))
    expect(video.scenes.filter(scene=>scene.source.kind==='portrait').every(scene=>scene.portraitProgram?.actions.length || scene.study?.references.length || scene.featureStudy)).toBe(true)
    expect(video.script!.revision).toBe(script.revision)
    for(const scene of video.scenes.filter(scene=>scene.portraitProgram)) expect(scene.portraitProgram!.actions.length).toBeGreaterThanOrEqual(Math.ceil(scriptTokens(scene.narration).length/6))
  }
})
test('a sentence can move from cheek to jaw without treating fixed reference features as new targets', () => {
  const follow = planPortraitProgram('The three quarter view helps you follow the cheek into the jaw.', 'cheeks', 'feature-study', 0, 'three-quarter')
  const jawWord = scriptTokens('The three quarter view helps you follow the cheek into the jaw.').findIndex(word => word.text === 'jaw')
  expect(follow.actions.filter(action => action.word < jawWord).every(action => action.feature === 'cheeks')).toBe(true)
  expect(follow.actions.some(action => action.word === jawWord && action.feature === 'jaw' && action.guide.startsWith('jaw.'))).toBe(true)
  const fixed = planPortraitProgram('Shorten the philtrum while keeping the eyes fixed and watching the upper lip.', 'philtrum', 'feature-study', 0, 'front')
  expect(fixed.actions.every(action => action.feature === 'philtrum')).toBe(true)
})
test('three-quarter context uses visible contours instead of frontal width and spacing instruments', () => {
  const program=planPortraitProgram('Follow the cheek into the jaw and keep the turned portrait in view.', 'cheeks', 'feature-study', 0, 'three-quarter')
  expect(program.actions.every(action=>['cheeks.contour','jaw.jaw-shape','jaw.chin-shape'].includes(action.guide))).toBe(true)
})
test('selecting feature-study on a general script does not invent a philtrum topic', () => {
  const script=createProductionDraft('Clavicular'),images=creatorSubjectPhotos(creatorSubjects.find(subject=>subject.id==='clavicular')!)!
  const plan=productionVisualPlan(script,input,images,reportCategories,'feature-study')
  expect(plan.find(shot=>shot.cue.sourceId==='hook')!.beat.feature).toBe('whole')
  expect(plan.find(shot=>shot.cue.sourceId==='perspective')!.beat.feature).toBe('whole')
  expect(plan.some(shot=>shot.beat.feature==='philtrum')).toBe(false)
})
test('lighting develops registered planes instead of introducing unspoken facial ratios', () => {
  const program = planPortraitProgram('Side lighting changes how clearly the cheek surfaces stand out across the portrait.', 'cheeks', 'feature-study', 0, 'front')
  expect(program.actions.every(action => action.guide.startsWith('plane:') || action.guide === 'cheeks.contour')).toBe(true)
  expect(program.actions.some(action => action.guide.includes('width') || action.guide.includes('midface'))).toBe(false)
})
test('contrasting lighting and profile clauses become exact separate visual evidence beats', () => {
  const script=createProductionDraft('Clavicular'),images=creatorSubjectPhotos(creatorSubjects.find(subject=>subject.id==='clavicular')!)!
  const plan=productionVisualPlan(script,input,images,reportCategories,'feature-study')
  const lighting=plan.filter(shot=>shot.cue.sourceId==='light')
  expect(lighting.some(shot=>shot.direction.portraitFX?.lighting?.preset==='split')).toBe(true)
  expect(lighting.some(shot=>shot.direction.portraitFX?.lighting?.preset==='soft')).toBe(true)
  const views=plan.filter(shot=>shot.cue.sourceId==='perspective')
  expect(views.some(shot=>shot.direction.imageId?.includes('profile'))).toBe(true)
  expect(views.some(shot=>shot.direction.imageId?.includes('three-quarter'))).toBe(true)
  for(const section of productionTimeline(script)) expect(plan.filter(shot=>shot.cue.sourceId===section.id).map(shot=>shot.beat.quote).join(' ')).toBe(section.text)
})

 test('recorded overlays dwell for at least 1.8 seconds and short tails do not flash a new guide', () => {
  const program = preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',0,'front'),source)
  const words=scriptTokens(text).map((_,i)=>({startMs:i*140}))
  let previous=samplePortraitProgram(program,0,6000,words)!.to, last=0
  for(let ms=10;ms<6000;ms+=10) {
    const current=samplePortraitProgram(program,ms,6000,words)!
    if(current.to!==previous) { expect(ms-last).toBeGreaterThanOrEqual(1800); expect(6000-ms).toBeGreaterThanOrEqual(1500); previous=current.to;last=ms }
  }
})
test('stroke patterns vary and unrelated guides redraw from a point instead of morphing', () => {
  const planned=planPortraitProgram(text,'jaw','feature-study',0,'front')
  expect(new Set(planned.actions.map(action=>action.stroke))).toEqual(new Set(['solid','dotted','dashed']))
  const prepared=preparePortraitProgram(planned,source)
  const jaw=prepared.actions.find(action=>action.feature==='jaw')!
  const cheeks={...jaw,feature:'cheeks' as const,word:0}
  const program={...prepared,wordCount:12,actions:[cheeks,{...jaw,word:6}]}
  const activity=samplePortraitProgram(program,2100,4000)!
  expect(activity.from).toBeUndefined(); expect(activity.first).toBe(true)
  expect(activity.phase).toBeLessThan(.1)
  expect(samplePortraitProgram(program,2100,4000,undefined,true)!.phase).toBe(1)
})

test('annotations quote descriptive words and keep their original narration word offset', () => {
  const text='The arched brow sits slightly higher above the eye.'
  const annotation=portraitAnnotation(text,'brows',5)!
  expect(annotation.label).toBe('slightly higher')
  expect(annotation.labelWord).toBe(4)
  expect(text.toLowerCase()).toContain(annotation.label.toLowerCase())
  expect(portraitAnnotation('The thinner lips keep their original contour.','lips')!.label).toBe('thinner lips')
  expect(portraitAnnotation('The jaw outline changes with the light.','brows')).toBeUndefined()
})
test('descriptive brow and lip guides use actual contours and anchored brackets', () => {
  for(const [text,feature,guide] of [['The arched brow frames this eye.','brows','detail:brow-outline'],['The thinner lips have a defined outline.','lips','detail:lip-bracket']] as const) {
    const program=planPortraitProgram(text,feature,'feature-study',0,'front')
    expect(feature==='brows' ? ['detail:brow-outline','detail:brow-outline-left','detail:brow-outline-right','detail:brow-upper'].includes(program.actions[0].guide) : program.actions[0].guide===guide).toBe(true)
    const prepared=preparePortraitProgram(program,source)
    expect(prepared.actions[0].overlay.primitives.length).toBeGreaterThan(0)
    const points=prepared.actions[0].overlay.primitives.flatMap(p=>p.kind==='polyline'?p.pixelPoints:[])
    expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true)
  }
})
test('typewriter characters retain the same final positions during partial and full reveals', () => {
  const draws:Array<{letter:string,x:number,y:number}>=[]
  const ctx={globalAlpha:1,save(){},restore(){},measureText(text:string){return{width:text.length*10}},fillText(letter:string,x:number,y:number){draws.push({letter,x,y})}} as unknown as CanvasRenderingContext2D
  drawPortraitLabel(ctx,'SLIGHTLY HIGHER',100,200,.5)
  const partial=[...draws];draws.length=0
  drawPortraitLabel(ctx,'SLIGHTLY HIGHER',100,200,1)
  expect(partial.length).toBeGreaterThan(0);expect(partial.length).toBeLessThan(draws.length)
  expect(partial).toEqual(draws.slice(0,partial.length))
  expect(portraitLabelLines(ctx,'SLIGHTLY HIGHER',90)).toEqual(['SLIGHTLY','HIGHER'])
  draws.length=0;drawPortraitLabel(ctx,'ARCHED BROW',100,200,0,true)
  expect(draws.length).toBe('ARCHED BROW'.length)
})
test('keyword labels wait for their measured spoken word and reduced motion reveals immediately', () => {
  const planned=planPortraitProgram('The brow sits slightly higher in this portrait.','brows','feature-study',0,'front')
  const prepared=preparePortraitProgram({...planned,actions:[{...planned.actions[0],label:'slightly higher',labelWord:3}]},source)
  const words=scriptTokens('The brow sits slightly higher in this portrait.').map((_,i)=>({startMs:i*500}))
  expect(samplePortraitProgram(prepared,1400,4000,words)!.labelPhase).toBe(0)
  expect(samplePortraitProgram(prepared,2200,4000,words)!.labelPhase).toBe(1)
  expect(samplePortraitProgram(prepared,0,4000,words,true)!.labelPhase).toBe(1)
})

test('zoomed annotation text stays inside the visible video safe area', () => {
  const prepared=preparePortraitProgram(planPortraitProgram('The arched brow sits slightly higher above the eye.','brows','feature-study',0,'front'),source)
  const activity={...samplePortraitProgram(prepared,1200,4000)!,label:'SLIGHTLY HIGHER',labelPhase:1,phase:.7,treatment:'inset' as const}
  const draws:Array<{x:number,y:number}>=[]
  const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:2,b:0,c:0,d:2,e:-700,f:-600}},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},roundRect(){},measureText(text:string){return{width:text.length*8}},fillText(_text:string,x:number,y:number){draws.push({x:2*x-700,y:2*y-600})}} as unknown as CanvasRenderingContext2D
  drawPortraitActivity(ctx,activity,1200,1800)
  expect(draws.length).toBeGreaterThan(0)
  expect(draws.every(p=>p.x>=64&&p.x<=1016&&p.y>=540&&p.y<=1960)).toBe(true)
})

test('portrait annotations remain white inside the detected face, including grayscale highlights', () => {
  const face=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]
  expect(portraitAnnotationInk({} as CanvasRenderingContext2D,{x:20,y:20,width:40,height:20},face)).toBe('#fff')
})
test('dark mode never inverts portrait-program strokes or annotation ink', () => {
  const strokes:string[]=[]
  const native={globalAlpha:1,save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},roundRect(){},measureText(text:string){return{width:text.length*12}},fillText(){},set strokeStyle(value:string){strokes.push(value)}} as unknown as CanvasRenderingContext2D
  const prepared=preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',0,'front'),source)
  const activity={...samplePortraitProgram(prepared,1200,5000)!,phase:.6,labelPhase:1}
  drawPortraitActivity(videoThemeContext(native,'dark'),activity,1200,1800)
  expect(strokes).toContain('#fff')
  expect(strokes.some(color=>color.startsWith('rgba(17,17,17'))).toBe(false)
})

test('the same spoken brow feature produces genuinely different registered views across variants',()=>{
  const text='The arched brow sits slightly higher above the eye and its contour continues toward the outer tail.'
  const guides=new Set<string>(), geometries=new Set<string>(), treatments=new Set<string>()
  for(let variant=0;variant<16;variant++){
    const planned=planPortraitProgram(text,'brows','feature-study',variant,'front')
    const prepared=preparePortraitProgram(planned,source)
    expect(prepared.actions.length).toBe(planned.actions.length)
    for(const action of prepared.actions){guides.add(action.guide);geometries.add(JSON.stringify(action.overlay.primitives));treatments.add(action.treatment)}
  }
  expect(guides.has('detail:brow-outline-left')).toBe(true)
  expect(guides.has('detail:brow-outline-right')).toBe(true)
  expect(guides.has('detail:brow-outline')).toBe(true)
  expect(geometries.size).toBeGreaterThanOrEqual(4)
  expect(treatments.has('inset')).toBe(true);expect(treatments.has('trace')).toBe(true)
})
test('eye and jaw alternatives change actual anatomy paths while remaining within the narrated feature',()=>{
  for(const [text,feature] of [['Follow this eye shape as the outline draws around the eyelid.','eyes'],['Follow the jaw outline from the lower face toward the chin.','jaw']] as const){
    const geometries=new Set<string>()
    for(let variant=0;variant<12;variant++){
      const prepared=preparePortraitProgram(planPortraitProgram(text,feature,'measurement-explainer',variant,'front'),source)
      expect(prepared.actions.every(action=>action.feature===feature)).toBe(true)
      for(const action of prepared.actions)geometries.add(JSON.stringify(action.overlay.primitives))
    }
    expect(geometries.size).toBeGreaterThanOrEqual(3)
  }
})

test('consecutive variants traverse the anatomy pool before repeating a first view',()=>{
  const text='The arched brow curves toward the outer tail.'
  const first=Array.from({length:4},(_,variant)=>planPortraitProgram(text,'brows','feature-study',variant,'front').actions[0].guide)
  expect(new Set(first).size).toBe(4)
  const eye=Array.from({length:5},(_,variant)=>planPortraitProgram('Follow the eye shape around this region.','eyes','feature-study',variant,'front').actions[0].guide)
  expect(new Set(eye).size).toBe(5)
})

test('annotation placement moves off a mixed shoulder/background boundary into a clear region',()=>{
  const alpha=Uint8ClampedArray.from({length:100},(_,i)=>Math.floor(i/10)>=5 && i%10>=5?255:0)
  const frame={x:40,y:50,width:40,height:20},safe={left:0,right:100,top:0,bottom:100}
  const placed=placePortraitAnnotation(frame,safe,.2,100,100,{width:10,height:10,alpha})
  expect(placed).not.toEqual(frame)
  expect(placed.y+placed.height<50 || placed.x+placed.width<50).toBe(true)
  expect(placePortraitAnnotation(frame,safe,1,100,100)).toEqual(frame)
})


test('callout and bracket treatments add no swinging leader or unrelated side rail',()=>{
  const prepared=preparePortraitProgram(planPortraitProgram(text,'jaw','portrait-audit',0,'front'),source)
  const activity={...samplePortraitProgram(prepared,1200,5000)!,first:true,elapsedMs:800,labelPhase:1}
  const paths=(treatment:typeof activity.treatment)=>{
    const lines:number[][]=[]
    const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},moveTo(x:number,y:number){lines.push([x,y])},lineTo(x:number,y:number){lines.at(-1)!.push(x,y)},stroke(){},fill(){},arc(){},measureText(text:string){return{width:text.length*8}},fillText(){}} as unknown as CanvasRenderingContext2D
    drawPortraitActivity(ctx,{...activity,treatment},1200,1800)
    return lines
  }
  expect(paths('callout')).toEqual(paths('trace'))
  expect(paths('bracket')).toEqual(paths('trace'))
})

test('open brows preserve all detected vertices and broken contours never bridge missing data',()=>{
  const brow=[{x:.3,y:.3},{x:.34,y:.28},{x:.38,y:.27},{x:.42,y:.28},{x:.45,y:.3}]
  const face={...source.landmarks!,contours:{...source.landmarks!.contours,leftBrow:brow}}
  expect(faceContourPaths(face,'leftBrow')).toEqual([brow])
  expect(faceContourEdge(face,'leftBrow',true)).toEqual([brow])
  expect(faceContourEdge(face,'leftBrow',false)).toEqual([])
  expect(faceContourPaths({...face,contours:{leftBrow:[...brow,{x:NaN,y:.3}]}},'leftBrow')).toEqual([])
})


test('angle overlays acquire their arms before revealing the curved arc',()=>{
  const program=preparePortraitProgram({wordCount:10,actions:[{word:0,feature:'jaw',guide:'detail.gonial',treatment:'trace',stroke:'solid',label:'Jaw angle'}]},source)
  expect(program.actions[0].overlay.primitives.length).toBeGreaterThanOrEqual(3)
  const activity=samplePortraitProgram(program,0,4000)!
  const pathsAt=(elapsedMs:number)=>{
    const paths:number[][]=[]
    const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},moveTo(x:number,y:number){paths.push([x,y])},lineTo(x:number,y:number){paths.at(-1)!.push(x,y)},stroke(){},fill(){},arc(){},measureText(){return{width:80}},fillText(){}} as unknown as CanvasRenderingContext2D
    drawPortraitActivity(ctx,{...activity,elapsedMs},1200,1800)
    return paths.filter(path=>path.length>2)
  }
  expect(pathsAt(100)).toHaveLength(1)
  expect(pathsAt(200)).toHaveLength(2)
  expect(pathsAt(900).length).toBeGreaterThanOrEqual(3)
})
