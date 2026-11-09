import {editorialCursorTiming,sampleEditorialCursor} from './editorial-cursor'
import { expect, test } from 'bun:test'
import { planEditorialPresentation } from './editorial-planning'
import vStory from '../../public/creator/stories/v/story.json'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { editorialFeatureGeometry, editorialSceneClock, editorialMicroLabel, editorialPresentationSchema, editorialWordEvents, editorialTileFrames } from './editorial-scenes'
import { compileProductionVideo } from './video-production'
import { createFeatureStudyDraft } from './feature-study-script'
import { creatorSubjects, creatorSubjectPhotos } from './creator-catalog'
import { reportCategories } from './mock-report-data'
import { voiceDirection } from './video-speech'
import { createMotionTrack, parseComposition, videoImageIds } from './video-composition'
import type { PreparedVideo } from './video-renderer'
import type { CreatorStory } from './creator-stories'
import type { AnalysisPostInput } from './analysis-post'

const input: AnalysisPostInput = { formatId:'feature-audit', subject:'Marlon', hook:'', overallScore:'7.1', potentialScore:'8.2', strongestFeature:'Eyes', strongestScore:'8.1', opportunityFeature:'Jaw', opportunityScore:'6.2', recommendation:'', productFeatures:[], cta:'' }
const images = creatorSubjectPhotos(creatorSubjects[0])!
const voice = voiceDirection('editorial')
const draft = createFeatureStudyDraft('Marlon','philtrum')
const compile = () => compileProductionVideo(draft,input,images,reportCategories,'feature-study',voice)

test('claims and source stacks require reviewed sources rather than invented attribution', () => {
  expect(() => editorialPresentationSchema.parse({kind:'claim'})).toThrow('reviewed attribution')
  expect(() => editorialPresentationSchema.parse({kind:'research'})).toThrow('curated study')
  expect(() => editorialPresentationSchema.parse({kind:'claim',claim:{author:'Someone',text:'Claim',sourceUrl:'javascript:alert(1)',reviewed:true}})).toThrow()
  expect(editorialPresentationSchema.parse({kind:'research',studies:['ward-2018']}).studies).toEqual(['ward-2018'])
})

test('feature targets scale the current image geometry without inventing missing cheek boundaries', () => {
  const landmarks = vStory.images[0].landmarks as FaceLandmarksPayload
  expect(landmarks).toBeDefined()
  const photo = {image:{width:1000,height:1600} as HTMLImageElement,landmarks}
  const eyes = editorialFeatureGeometry(photo,'eyes')!
  const lips = editorialFeatureGeometry(photo,'lips')!
  expect(eyes.frame.y).toBeLessThan(lips.frame.y)
  const doubled = editorialFeatureGeometry({...photo,image:{width:2000,height:3200} as HTMLImageElement},'eyes')!
  expect(doubled.points[0].x).toBeCloseTo(eyes.points[0].x*2)
  const missing = {...landmarks!,contours:{...landmarks!.contours,leftCheekbone:undefined,rightCheekbone:undefined}}
  expect(editorialFeatureGeometry({...photo,landmarks:missing},'cheeks')).toBeUndefined()
  expect(editorialFeatureGeometry({...photo,landmarks:{...landmarks!,confidence:.3}},'jaw')).toBeUndefined()
})

test('automatic treatments follow narration and leave score delivery and clean variations alone', () => {
  expect(['reference-inset','tile-expand','cursor-tour','callout','network','line-art']).toContain(planEditorialPresentation('Look closer at this detail.','eyes',1)?.kind ?? '')
  expect(['comparison','focus-grid','reference-hinge','orbit','reference-inset','evidence-fan']).toContain(planEditorialPresentation('Compare both pictures side by side.','jaw',1,true)?.kind ?? '')
  expect(planEditorialPresentation('Compare both pictures side by side.','jaw',1,false)?.kind).not.toBe('comparison')
  expect(planEditorialPresentation('Compare the original and edited versions.','jaw',1,true)).toBeUndefined()
  expect(planEditorialPresentation('His jaw scores seven out of ten.','jaw',1)).toBeUndefined()
  expect(planEditorialPresentation('Look at his brows.','brows',5)).toBeDefined()
  expect(editorialMicroLabel('Brow shape',400)).toBe('Brow shape')
  expect(editorialMicroLabel('Brow shape',0,2,true)).toBe('Brow shape')
})

test('registered scene primitives round-trip through composition parsing and retain reference assets', () => {
  const video = compile()
  const scene = video.scenes.find(scene => scene.source.kind==='portrait' && !scene.featureStudy?.edit && !scene.photoStudy && !scene.study && !scene.profileStudy && !scene.portraitFX)!
  expect(scene).toBeDefined()
  scene.presentation = undefined
  scene.tracks.push(createMotionTrack('editorial-network','content',scene.durationMs))
  const parsed = parseComposition(video)
  const restored = parsed.scenes.find(item => item.id===scene.id)!
  expect(restored.presentation?.kind).toBe('network')
  expect(restored.featureStudy).toBeUndefined()
  restored.presentation!.imageIds = ['reviewed-profile']
  expect(videoImageIds(parsed.scenes).has('reviewed-profile')).toBe(true)
  restored.source.kind = 'report'
  expect(() => parseComposition(parsed)).toThrow()
})

test('feature generation uses the new renderer without changing approved words or voice identity', () => {
  const video = compile()
  expect(video.scenes.some(scene=>scene.presentation)).toBe(true)
  expect(video.script!.cues.map(cue=>cue.text)).toEqual(draft.cues.map(cue=>cue.text))
  expect(video.voice).toEqual(voice)
  expect(video.scenes.filter(scene=>scene.presentation).every(scene=>!scene.featureStudy && !scene.portraitProgram && scene.source.overlay==='none')).toBe(true)
})


test('motion continues across adjacent recorded caption fragments but restarts for a later or unbound shot', () => {
  const presentation=editorialPresentationSchema.parse({kind:'network'})
  const scenes=Array.from({length:4},(_,i)=>({startMs:i*1000,durationMs:1000,source:{imageId:'face'},scriptRange:{cueId:i===2?'other':'claim'},presentation}))
  expect(editorialSceneClock(scenes,scenes[1],200)).toEqual({time:1200,duration:2000})
  expect(editorialSceneClock(scenes,scenes[3],200)).toEqual({time:200,duration:1000})
  const unbound=scenes.map(({scriptRange,...scene})=>scene)
  expect(editorialSceneClock(unbound,unbound[1],200)).toEqual({time:200,duration:1000})
})

test('visual arrivals follow exact spoken phrases, preserve pauses and omit an absent anchor', () => {
  const beats=editorialPresentationSchema.parse({kind:'feature-tray',beats:[{feature:'brows',anchor:'the brows'},{feature:'lips',anchor:'lips'},{feature:'jaw',anchor:'the jaw'}]}).beats
  const words=[{text:'First,',startMs:90},{text:'the',startMs:500},{text:'brows.',startMs:740},{text:'Then',startMs:2300},{text:'lips.',startMs:2900}]
  expect(editorialWordEvents(beats,words)).toEqual([{feature:'brows',label:undefined,atMs:500},{feature:'lips',label:undefined,atMs:2900}])
})

test('comparison surfaces reserve caption and platform margins, including their label strip', () => {
  for(const count of [3,4]){
    const frames=editorialTileFrames(count,{width:1080,height:1920})
    expect(frames).toHaveLength(count)
    for(const frame of frames){expect(frame.x).toBeGreaterThan(40);expect(frame.x+frame.width).toBeLessThan(1040);expect(frame.y).toBeGreaterThan(380);expect(frame.y+frame.height+35).toBeLessThan(1700)}
    if(count===4)expect(frames[2].y-(frames[0].y+frames[0].height)).toBeGreaterThan(40)
  }
})

test('the Qoves editorial recipe reaches saved-story production without changing its recording or sourcing a different score', async () => {
  const {creatorStoryOptions,creatorStoryDirections,creatorAnalysisInput,creatorAnalysisReports}=await import('./creator-stories')
  const {restoreProductionRecording,assembleProductionAudio,productionWritingBrief}=await import('./video-production')
  const {creatorContentStyle,creatorContentStyles}=await import('./creator-catalog')
  const catalog=vStory as unknown as CreatorStory,option=creatorStoryOptions(catalog)[0]
  const story={...catalog,...option,featureOpening:option.featureOpening,directions:option.directions,editorialRatings:option.editorialRatings,images:option.imageIds?option.imageIds.map(id=>catalog.images.find(image=>image.id===id)!):catalog.images}
  const saved=restoreProductionRecording(await Bun.file('public'+option.recording).json())
  const analysis=await Bun.file('public'+catalog.analysis).json(),reports=creatorAnalysisReports(analysis),actual=creatorAnalysisInput(input,'V',analysis)
  const treatments=new Set<string>()
  for(let variation=0;variation<6;variation++){
    const directions=creatorStoryDirections(story,saved.script,actual,story.images,reports,'editorial-story',variation)
    const video=compileProductionVideo(saved.script,actual,story.images,reports,'editorial-story',saved.voice,variation,'philtrum',1,directions)
    for(const scene of video.scenes){
      if(scene.presentation){treatments.add(scene.presentation.kind);expect(scene.tracks.every(track=>['text','content'].includes(track.target))).toBe(true)}
      if(scene.scoreCallouts?.length)expect(scene.source.imageId).toBe(analysis.source.imageId)
    }
    const audio=assembleProductionAudio(video,saved.clips)
    expect(audio.alignmentError).toBeUndefined()
    expect(video.script!.revision).toBe(saved.script.revision)
    expect(video.voice).toEqual(saved.voice)
  }
  expect(treatments.size).toBeGreaterThanOrEqual(3)
  expect(creatorContentStyle('editorial-story').id).toBe('qoves')
  expect(creatorContentStyles.find(style=>style.id==='qoves')!.defaultRecipe).toBe('editorial-story')
  const brief=productionWritingBrief(saved.script).referenceEditorial
  expect(brief.sources).toHaveLength(3)
  expect(new Set(brief.structures.map(structure=>structure.id)).size).toBe(3)
})

test('context footage requires its source and seeks an explicit held frame on the same preview/export clock', async () => {
  const {seekPreparedMedia}=await import('./video-renderer')
  const {seekContextVideo}=await import('./context-video')
  const composition=compile(),scene=composition.scenes.find(scene=>scene.source.kind==='portrait' && !scene.featureStudy?.edit && !scene.photoStudy && !scene.study && !scene.profileStudy && !scene.portraitFX)!
  scene.featureStudy=undefined;scene.portraitProgram=undefined
  scene.presentation=editorialPresentationSchema.parse({kind:'reference-hinge',mediaId:'owned-context',mediaOffsetMs:1000,holdMediaAtMs:500})
  expect(()=>parseComposition(composition)).toThrow('supplied video asset')
  composition.media=[{id:'owned-context',kind:'video',url:'/creator/context.mp4',width:1920,height:1080,durationMs:10000,role:'context',source:{provider:'uploaded',url:'https://www.mogging.com',author:'Mogging',license:'Owned',usage:'owned'},scope:{kind:'public'}}]
  const parsed=parseComposition(composition)
  class SourceVideo extends EventTarget {
    duration=10;readyState=2;position=0
    get currentTime(){return this.position}
    set currentTime(value:number){this.position=value;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')))}
  }
  const source=new SourceVideo(),prepared={composition:parsed,contextVideos:new Map([['owned-context',source]])} as unknown as PreparedVideo
  await seekPreparedMedia(prepared,scene.startMs+100)
  expect(source.currentTime).toBe(1.5)
  await seekPreparedMedia(prepared,scene.startMs+300)
  expect(source.currentTime).toBe(1.5)
  const aborted=new AbortController();aborted.abort()
  await expect(seekContextVideo(source as unknown as HTMLVideoElement,4000,aborted.signal)).rejects.toHaveProperty('name','AbortError')
})


test('cursor clicks and drops own the guide entrance, including double-click and reduced motion',()=>{
  for(const action of ['click','double-click','drag'] as const)for(let variant=0;variant<6;variant++){
    const from={x:100,y:300},target={x:500,y:500},timing=editorialCursorTiming(1200,variant,action)
    const before=sampleEditorialCursor(timing.clickAtMs-1,from,target,1200,variant,action)
    const click=sampleEditorialCursor(timing.clickAtMs,from,target,1200,variant,action)
    const after=sampleEditorialCursor(timing.clickAtMs+200,from,target,1200,variant,action)
    expect(before.clicked).toBe(false);expect(before.effectMs).toBe(-1)
    expect(click.clicked).toBe(true);expect(click.effectMs).toBe(0)
    expect(click.x).toBeCloseTo(target.x);expect(click.y).toBeCloseTo(target.y)
    expect(after.effectMs).toBe(200)
    if(action==='drag'){
      const middle=sampleEditorialCursor((timing.downAtMs+timing.clickAtMs)/2,from,target,1200,variant,action)
      expect(middle.kind).toBe('closed-hand');expect(middle.x).toBeGreaterThan(from.x);expect(middle.x).toBeLessThan(target.x)
    }
  }
  const reduced=sampleEditorialCursor(1200,{x:0,y:0},{x:40,y:20},1200,0,undefined,true)
  expect(reduced.opacity).toBe(0);expect(reduced.effectMs).toBe(0)
})


test('editorial sequencing balances treatments while preserving semantic and asset requirements',()=>{
  const history: NonNullable<ReturnType<typeof planEditorialPresentation>>['kind'][]=[]
  for(let seed=1;seed<80;seed++){
    const presentation=planEditorialPresentation('The eyes sit inside a strong frame formed by the brows.','eyes',seed,false,history)
    if(!presentation)continue
    expect(presentation.kind).not.toBe(history.at(-1))
    expect(['comparison','orbit','evidence-fan','claim','research','device','color-reveal']).not.toContain(presentation.kind)
    history.push(presentation.kind)
  }
  expect(new Set(history).size).toBeGreaterThanOrEqual(6)
  expect(planEditorialPresentation('His jaw scores seven out of ten.','jaw',13,true,history)).toBeUndefined()
})

test('Qoves captions shrink only for its recipes and retain the recorded word clock',async()=>{
 const {captionStyle}=await import('./video-captions')
 const qoves=compileProductionVideo(draft,input,images,reportCategories,'editorial-story',voice)
 const standard=compileProductionVideo(draft,input,images,reportCategories,'portrait-audit',voice)
 for(const scene of qoves.scenes){
  expect(scene.captionScale).toBe(.9)
  expect(captionStyle(scene).size).toBeCloseTo(captionStyle({...scene,captionScale:undefined}).size*.9)
 }
 expect(standard.scenes.every(scene=>scene.captionScale===undefined)).toBe(true)
 expect(qoves.script!.cues.map(cue=>cue.text)).toEqual(standard.script!.cues.map(cue=>cue.text))
})


test('an authored detail crop becomes a full-context inset rather than an isolated strip',async()=>{
 const {referenceEditorialDirection}=await import('./editorial-planning')
 const {decodeVisualBeat}=await import('./video-semantics')
 const cue=draft.cues[1]
 const direction=referenceEditorialDirection({kind:'portrait',imageId:images[0].id,categoryId:'jaw',portraitCrop:{x:.2,y:.4,width:.6,height:.2}},decodeVisualBeat('You see the edge without the shape that leads into it.'),cue.section!,images,1)
 expect(direction.presentation?.kind).toBe('reference-inset')
 expect(direction.presentation?.feature).toBe('jaw')
 expect(direction.portraitCrop).toBeUndefined()
 expect(direction.imageId).toBe(images[0].id)
})
