import type { VideoScene, VideoComposition } from './video-composition'
import { createHash } from 'node:crypto'
import { profileStudySchema, profileGeometry, registerProfileStudy } from './video-profile'
import { readFileSync } from 'node:fs'
import { isVideoCta } from './video-branding'
import {faceContourPaths,faceContourEdge} from './face-metric-guides'
import { videoThemeContext } from './video-theme'
import { expect, test } from 'bun:test'
import { portraitProgramRuns, portraitProgramSchedule, portraitOverlayMinimumMs, narratedPortraitProgram, planPortraitProgram, preparePortraitProgram, samplePortraitProgram, drawPortraitActivity, portraitAnnotation, drawPortraitLabel, portraitLabelLines, portraitAnnotationInk, placePortraitAnnotation } from './portrait-program'
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
    expect(video.scenes.filter(scene=>scene.source.kind==='portrait' && !isVideoCta(video,scene)).every(scene=>scene.portraitProgram?.actions.length || scene.study?.references.length || scene.featureStudy)).toBe(true)
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
  const script=createProductionDraft('Clavicular'),images=['front','three-quarter','profile'].map(view=>({id:`clavicular-studio-${view}-20261027`,name:view,dataUrl:`/creator/examples/clavicular-studio-20261027/clavicular-${view}-4k.jpg`,width:2160,height:3840,status:'ready' as const,landmarks:null}))
  const plan=productionVisualPlan(script,input,images,reportCategories,'feature-study')
  const lighting=plan.filter(shot=>shot.cue.sourceId==='light')
  expect(lighting.some(shot=>shot.direction.portraitFX?.lighting?.preset==='split')).toBe(true)
  expect(lighting.some(shot=>shot.direction.portraitFX?.lighting?.preset==='soft')).toBe(true)
  const views=plan.filter(shot=>shot.cue.sourceId==='perspective')
  expect(views.some(shot=>shot.direction.imageId?.includes('profile'))).toBe(true)
  expect(views.some(shot=>shot.direction.imageId?.includes('three-quarter'))).toBe(true)
  for(const section of productionTimeline(script)) expect(plan.filter(shot=>shot.cue.sourceId===section.id).map(shot=>shot.beat.quote).join(' ')).toBe(section.text)
})

 test('recorded overlays hold their complete geometry for two seconds and absorb short tails', () => {
  const program = preparePortraitProgram(planPortraitProgram(text,'jaw','feature-study',0,'front'),source)
  const words=scriptTokens(text).map((_,i)=>({startMs:i*140}))
  let previous=samplePortraitProgram(program,0,6000,words)!.to, last=0
  for(let ms=10;ms<6000;ms+=10) {
    const current=samplePortraitProgram(program,ms,6000,words)!
    if(current.to!==previous) { expect(ms-last-250).toBeGreaterThanOrEqual(portraitOverlayMinimumMs); expect(6000-ms-250).toBeGreaterThanOrEqual(portraitOverlayMinimumMs); previous=current.to;last=ms }
  }
})
test('stroke patterns vary and unrelated guides redraw from a point instead of morphing', () => {
  const planned=planPortraitProgram(text,'jaw','feature-study',0,'front')
  expect(new Set(planned.actions.map(action=>action.stroke))).toEqual(new Set(['solid','dotted','dashed']))
  const prepared=preparePortraitProgram(planned,source)
  const jaw=prepared.actions.find(action=>action.feature==='jaw')!
  const cheeks={...jaw,feature:'cheeks' as const,word:0}
  const program={...prepared,wordCount:12,actions:[cheeks,{...jaw,word:6}]}
  const activity=samplePortraitProgram(program,2600,5000)!
  expect(activity.from).toBeUndefined(); expect(activity.first).toBe(true)
  expect(activity.phase).toBeLessThan(.1)
  expect(samplePortraitProgram(program,2600,5000,undefined,true)!.phase).toBe(1)
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
  const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:2,b:0,c:0,d:2,e:-700,f:-600}},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},roundRect(){},clip(){},fillRect(){},measureText(text:string){return{width:text.length*8}},fillText(_text:string,x:number,y:number){draws.push({x:2*x-700,y:2*y-600})}} as unknown as CanvasRenderingContext2D
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
  expect(strokes).toContain('rgba(255,255,255,.88)')
  expect(strokes.some(color=>color.startsWith('rgba(17,17,17'))).toBe(false)
})

test('the same spoken brow feature produces genuinely different registered views across variants',()=>{
  const detected = JSON.parse(readFileSync('public/creator/stories/marlon/story.json','utf8')).images[0] as GeneratorImage
  const text='The arched brow sits slightly higher above the eye and its contour continues toward the outer tail.'
  const guides=new Set<string>(), geometries=new Set<string>(), treatments=new Set<string>()
  for(let variant=0;variant<16;variant++){
    const planned=planPortraitProgram(text,'brows','feature-study',variant,'front')
    const prepared=preparePortraitProgram(planned,detected)
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


test('arrows, brackets and scribbles add distinct stable marks to the registered contour',()=>{
  const prepared=preparePortraitProgram(planPortraitProgram(text,'jaw','portrait-audit',0,'front'),source)
  const activity={...samplePortraitProgram(prepared,1200,5000)!,first:true,elapsedMs:800,labelPhase:1}
  const paths=(treatment:typeof activity.treatment)=>{
    const lines:number[][]=[]
    const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},closePath(){},moveTo(x:number,y:number){lines.push([x,y])},lineTo(x:number,y:number){lines.at(-1)!.push(x,y)},stroke(){},fill(){},arc(){},measureText(text:string){return{width:text.length*8}},fillText(){}} as unknown as CanvasRenderingContext2D
    drawPortraitActivity(ctx,{...activity,treatment},1200,1800)
    return lines
  }
  for(const treatment of ['callout','arrow','bracket','scribble','note'] as const) {
    expect(paths(treatment)).not.toEqual(paths('trace'))
    expect(paths(treatment)).toEqual(paths(treatment))
    expect(paths(treatment)[0]).toEqual(paths('trace')[0])
  }
})

test('open brows preserve all detected vertices and broken contours never bridge missing data',()=>{
  const brow=[{x:.3,y:.3},{x:.34,y:.28},{x:.38,y:.27},{x:.42,y:.28},{x:.45,y:.3}]
  const face={...source.landmarks!,contours:{...source.landmarks!.contours,leftBrow:brow}}
  expect(faceContourPaths(face,'leftBrow')).toEqual([brow])
  expect(faceContourEdge(face,'leftBrow',true)).toEqual([brow])
  expect(faceContourEdge(face,'leftBrow',false)).toEqual([])
  expect(faceContourPaths({...face,contours:{leftBrow:[...brow,{x:NaN,y:.3}]}},'leftBrow')).toEqual([])
})


test('all gonial angle arms and the arc finish revealing within 250ms and stay visible',()=>{
  const program=preparePortraitProgram({wordCount:10,actions:[{word:0,feature:'jaw',guide:'detail.gonial',treatment:'trace',stroke:'solid',label:'Jaw angle'}]},source)
  expect(program.actions[0].overlay.primitives.length).toBeGreaterThanOrEqual(3)
  const activity=samplePortraitProgram(program,0,4000)!
  const pathsAt=(elapsedMs:number)=>{
    const paths:number[][]=[]
    const ctx={globalAlpha:1,save(){},restore(){},getTransform(){return{a:1,b:0}},setLineDash(){},beginPath(){},moveTo(x:number,y:number){paths.push([x,y])},lineTo(x:number,y:number){paths.at(-1)!.push(x,y)},stroke(){},fill(){},arc(){},measureText(){return{width:80}},fillText(){}} as unknown as CanvasRenderingContext2D
    drawPortraitActivity(ctx,{...activity,treatment:'trace',elapsedMs},1200,1800)
    return paths.filter(path=>path.length>2)
  }
  expect(pathsAt(250).length).toBeGreaterThanOrEqual(3)
  expect(pathsAt(250)).toEqual(pathsAt(2250))
})


test('editorial variants frame the jaw, gonial corner, cheekbones and lower cheek with distinct registered geometry', () => {
  const photo = JSON.parse(readFileSync('public/creator/stories/marlon/story.json','utf8')).images[0] as GeneratorImage
  const guides = new Map<string, ReturnType<typeof preparePortraitProgram>['actions'][number]>()
  const text = 'The jawline and cheekbones define the shape of the face.'
  for (let variant=0;variant<8;variant++) {
    const program = narratedPortraitProgram(text,'portrait-audit',variant)!
    const prepared = preparePortraitProgram(program,photo)
    expect(prepared.actions).toHaveLength(program.actions.length)
    for (const action of prepared.actions) {
      expect(['jaw','cheeks']).toContain(action.feature)
      expect(action.word).toBeLessThan(scriptTokens(text).length)
      guides.set(action.guide,action)
    }
  }
  for (const id of ['jaw-outline','jaw-frame','gonial','jaw-offset','cheeks','cheek-frame','under-cheekbones','cheek-levels']) expect(guides.has(`detail:${id}`)).toBe(true)
  expect(new Set([...guides.values()].map(action=>JSON.stringify(action.overlay.primitives))).size).toBeGreaterThanOrEqual(6)
  const centerY = (id:string) => {
    const points=guides.get(id)!.overlay.primitives.flatMap(primitive=>primitive.kind==='polyline'?primitive.pixelPoints:[])
    return points.reduce((sum,point)=>sum+point.y,0)/points.length
  }
  expect(centerY('detail:under-cheekbones')).toBeGreaterThan(centerY('detail:cheeks'))
})


test('authored profile guides remain registered through the source crop without frontal landmarks', () => {
  const entry=JSON.parse(readFileSync('public/creator/profile-guides.json','utf8'))['v-profile']
  expect(createHash('sha256').update(readFileSync(`public${entry.dataUrl}`)).digest('hex')).toBe(entry.sha256)
  const study=profileStudySchema.parse({view:entry.view,side:entry.side,feature:'chin',contours:entry.contours,angle:entry.angle})
  const image={...source,width:1296,height:2304,landmarks:null}
  const original=profileGeometry(image,study)
  const crop={x:80,y:120,width:1100,height:2000}
  const registered=registerProfileStudy(study,image,crop)
  const cropped={...image,width:crop.width,height:crop.height}
  const geometry=profileGeometry(cropped,registered)
  expect(geometry.contour[0].x).toBeCloseTo(original.contour[0].x-crop.x)
  expect(geometry.contour[0].y).toBeCloseTo(original.contour[0].y-crop.y)
  expect(geometry.faceBottom).toBeCloseTo(original.faceBottom!-crop.y)
  expect(geometry.faceBottom).toBeGreaterThanOrEqual(Math.max(...geometry.contour.map(point=>point.y)))
  const prepared=preparePortraitProgram({wordCount:3,view:'profile',actions:[{word:0,feature:'jaw',guide:'profile:chin',label:'Chin projection',treatment:'callout'}]},cropped,registered)
  expect(prepared.actions).toHaveLength(1)
  expect(samplePortraitProgram(prepared,1000,3000,undefined,true)?.view).toBe('profile')
})

test('angled cheek guides trace one visible cheekbone arc', () => {
  const image=JSON.parse(readFileSync('public/creator/stories/marlon/story.json','utf8')).images[0] as GeneratorImage
  const geometry=profileGeometry(image,{view:'three-quarter',side:'left',feature:'cheek'})
  expect(geometry.contour).toHaveLength(5)
  const below=profileGeometry(image,{view:'three-quarter',side:'left',feature:'under-cheek'})
  expect(below.contour[3].y).toBeGreaterThan(geometry.contour[3].y)
})


test('annotation clocks span caption cuts and restart for a new image or crop',()=>{
  const program=narratedPortraitProgram('Look at the jawline and cheekbones.','feature-study')
  const scene=(id:string,startMs:number,durationMs:number,imageId='face')=>({id,startMs,durationMs,source:{kind:'portrait',imageId},portraitProgram:program,words:scriptTokens('Look at the jawline and cheekbones.').map((_,i)=>({startMs:i*200}))}) as Parameters<typeof portraitProgramRuns>[0][number]
  const a=scene('a',0,1200),b=scene('b',1200,1200),c=scene('c',2400,3000,'other'),d={...scene('d',5400,3000,'other'),portraitCrop:{x:.2,y:.3,width:.6,height:.4}}
  const runs=portraitProgramRuns([a,b,c,d]),run=runs.get('a')!
  expect(runs.get('b')).toBe(run)
  expect(run.durationMs).toBe(2400)
  expect(run.words[program.wordCount].startMs).toBe(1200)
  const prepared=preparePortraitProgram(run.program,source)
  expect(samplePortraitProgram(prepared,1100,run.durationMs,run.words)!.to).toBe(samplePortraitProgram(prepared,1300,run.durationMs,run.words)!.to)
  expect(portraitProgramSchedule(prepared,run.durationMs,run.words)).toHaveLength(1)
  expect(runs.get('c')).not.toBe(run)
  expect(runs.get('d')).not.toBe(runs.get('c'))
  expect(samplePortraitProgram(prepared,500,2200)).toBeUndefined()
})


test('a decorative repeat waits for an imminent narrated feature change',()=>{
  const prepared=preparePortraitProgram(narratedPortraitProgram('The eyes frame the face, then follow the jawline.','portrait-audit'),source)
  const base=prepared.actions[0],jaw=prepared.actions.find(action=>action.feature==='jaw')!
  const program={...prepared,actions:[{...base,feature:'eyes' as const,word:0},{...base,feature:'eyes' as const,word:1},{...jaw,word:2}]}
  const schedule=portraitProgramSchedule(program,6000,[{startMs:0},{startMs:2300},{startMs:3000}])
  expect(schedule.map(cue=>cue.action.feature)).toEqual(['eyes','jaw'])
  expect(schedule.map(cue=>cue.start)).toEqual([0,3000])
})


test('controlled morphs keep fixed anatomy, paired timing and one clock across caption cuts', async()=>{
  const {photoStudyGesture,photoStudyRegions,photoStudyClock}=await import('./video-photo-study')
  const {warpSourcePoint,warpDestinationPoint}=await import('./video-portrait-effects')
  const image=JSON.parse(readFileSync('public/creator/stories/marlon/story.json','utf8')).images[0] as GeneratorImage
  const landmarks=image.landmarks!,study={feature:'cheeks' as const,amount:.2},regions=photoStudyRegions(landmarks,'cheeks')
  const warp=photoStudyGesture(study,regions,2500,6000,false,landmarks).warp
  expect(warp.strengths).toEqual([.2,.2])
  for(const anchor of [landmarks.anchors.leftPupil!,landmarks.anchors.rightPupil!,landmarks.anchors.noseTip!,landmarks.anchors.mouthCenter!])expect(warpDestinationPoint(anchor,warp)).toEqual(anchor)
  for(const region of regions){const target=warpDestinationPoint(region,warp);expect(target.y).toBeLessThan(region.y);const restored=warpSourcePoint(target,warp);expect(restored.x).toBeCloseTo(region.x,7);expect(restored.y).toBeCloseTo(region.y,7)}
  const eyeStudy={feature:'eyes' as const,mode:'drag' as const,axis:'x' as const,amount:.1}
  const eyeWarp=photoStudyGesture(eyeStudy,photoStudyRegions(landmarks,'eyes'),2500,6000,false,landmarks).warp
  expect(warpDestinationPoint(landmarks.anchors.leftPupil!,eyeWarp).x).toBeGreaterThan(landmarks.anchors.leftPupil!.x)
  expect(photoStudyGesture(study,regions,0,6000,false,landmarks).warp.strengths).toEqual([0,0])
  expect(photoStudyGesture(study,regions,6000,6000,false,landmarks).warp.strengths).toEqual([0,0])
  const scenes=[{cueId:'same',startMs:0,durationMs:3000,source:{imageId:'front'},photoStudy:study},{cueId:'same',startMs:3000,durationMs:3000,source:{imageId:'front'},photoStudy:study}]
  expect(photoStudyClock(scenes,scenes[1],500)).toEqual({timeMs:3500,durationMs:6000})
})

test('metric pills bind the active feature to its image and never rerate a simulated edit', async()=>{
  const {portraitMetricFor,overlayPillEligible}=await import('./portrait-metric')
  const image=JSON.parse(readFileSync('public/creator/stories/marlon/story.json','utf8')).images[0] as GeneratorImage
  const scene={cueId:'metrics',source:{kind:'portrait',imageId:image.id,report:{assessmentId:'saved',assessmentImageId:image.id,id:'nose',title:'Nose',score:7}},scoreCallouts:[{label:'Nose',value:7,word:0}],words:[{text:'seven',startMs:0,endMs:500}],narration:'seven',durationMs:5000} as VideoScene
  const activity={feature:'nose',guide:'nose.test',index:0} as Parameters<typeof portraitMetricFor>[1]
  expect(portraitMetricFor(scene,activity,image.landmarks,100)?.value).toBe(7)
  expect(portraitMetricFor({...scene,source:{...scene.source,imageId:'different-photo'}},activity,image.landmarks,100)).toBeUndefined()
  expect(portraitMetricFor(scene,{...activity!,feature:'brows'},image.landmarks,100)).toBeUndefined()
  expect(portraitMetricFor(scene,activity,image.landmarks,100,{regions:[],strengths:[.1],mode:'pinch',axis:'x'})).toBeUndefined()
  const selected=Array.from({length:300},(_,i)=>overlayPillEligible('cue-'+i,'nose.width')).filter(Boolean).length
  expect(selected).toBeGreaterThan(75);expect(selected).toBeLessThan(125)
})

test('scientific cards follow a specific claim and do not invalidate approved speech', async()=>{
  const {scriptSchema,scriptRevision}=await import('./video-script')
  const {scientificEvidenceAt}=await import('./video-research')
  const {studyBindingSchema}=await import('./creator-studies')
  const text='Brow thickness and jaw prominence influence facial attractiveness ratings.'
  const evidence={studyId:'mogilski-welling-2018' as const,claimId:'feature-salience',anchor:text}
  const cues=[{id:'claim',sourceId:'claim',text,section:{id:'claim',title:'Feature roles',role:'explanation' as const,priority:50,dependsOn:[],visuals:[{treatment:'detail' as const,categoryId:'jaw',view:'front' as const,reason:'Show the feature discussed by the supported claim.'}],evidence:[evidence]}}]
  const revision=scriptRevision(cues),script=scriptSchema.parse({version:1,revision,cues})
  expect(scriptRevision(cues.map(c=>({...c,section:undefined})))).toBe(revision)
  expect(studyBindingSchema.safeParse({...evidence,claimId:'jaw-score-ten'}).success).toBe(false)
  expect(studyBindingSchema.safeParse({...evidence,claimId:'constructor'}).success).toBe(false)
  expect(scriptSchema.safeParse({...script,cues:[{...cues[0],text:'Different words',section:cues[0].section}],revision:scriptRevision([{...cues[0],text:'Different words'}])}).success).toBe(false)
  const scene={cueId:'claim',scriptRange:{cueId:'claim',startWord:0,wordCount:10,startChar:0,endChar:text.length},startMs:0,durationMs:6000,narration:text,source:{kind:'portrait'}} as VideoScene
  const composition={script,scenes:[scene]} as VideoComposition
  expect(scientificEvidenceAt(composition,1000)?.binding.studyId).toBe(evidence.studyId)
  expect(scientificEvidenceAt({...composition,scenes:[{...scene,source:{...scene.source,kind:'report'}}]},1000)).toBeUndefined()
  expect(scientificEvidenceAt({...composition,scenes:[{...scene,durationMs:2000}]},1000)).toBeUndefined()
})


test('compact Torph pills fit their content and preserve continuity when retargeted or scrubbed',async()=>{
  const {createPortraitPillTrack,portraitMetricText,pillMotion}=await import('./video-pill-morph')
  const metric=(value:number)=>({label:'Nose',value,unit:'/10' as const,basis:'assessment' as const,imageId:'front'})
  const measure=(text:string)=>text.length*10
  const track=createPortraitPillTrack(measure,time=>time<500?metric(7):time<700?metric(8.25):time<1400?metric(9):undefined,2000)
  expect(track.sample(450).width).toBe(measure(portraitMetricText(metric(7)))+pillMotion.padding*2)
  const first=track.sample(450),fraction=track.sample(600)
  expect(fraction.width).toBeGreaterThan(first.width)
  expect(fraction.width).toBeLessThan(measure(portraitMetricText(metric(8.25)))+pillMotion.padding*2)
  const zero=first.glyphs.find(g=>g.string==='0'&&g.opacity>.99)!
  expect(fraction.glyphs.some(g=>g.id===zero.id)).toBe(true)
  expect(Math.abs(track.sample(700).width-track.sample(699.99).width)).toBeLessThan(.02)
  expect(track.sample(600)).toEqual(fraction)
  expect(track.sample(1100).width).toBe(measure(portraitMetricText(metric(9)))+pillMotion.padding*2)
  expect(track.sample(1850).opacity).toBe(0)
  expect(track.sample(600,true).width).toBe(measure(portraitMetricText(metric(8.25)))+pillMotion.padding*2)
})
