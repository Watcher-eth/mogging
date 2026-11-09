import { RenderTimeRemaining } from './render-time-remaining'
import dynamic from 'next/dynamic'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { StudioPostingGuide } from './studio-posting-guide'
import { TextMorph } from 'torph/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Loader2, PencilLine, RotateCcw, Moon, Sun, Check } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { bufferToWav } from '@web-kits/audio'
import { apiGet, apiPost } from '@/lib/api/client'
import { AnimatedGroup } from '@/components/core/animated-group'
import { creatorAnalysisInput, creatorAnalysisReports, creatorStoryDirections, creatorStoryOptions, creatorStoryCut, loadSculptureStory, loadCreatorStoryCatalog, loadCreatorStory, type CreatorStory, type CreatorStoryOption, type CreatorSubjectAnalysis } from '@/lib/creator/creator-stories'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles, creatorContentStyles, creatorContentStyle, contentStyleSupportsScript, chooseCreatorTake, type CreatorTake, type CreatorSubjectId, type CreatorContentStyleId } from '@/lib/creator/creator-catalog'
import { editorialRatingReports, editorialRatingInput, editorialRatingVisibility, type PrivateCharacterDetail } from '@/lib/creator/private-character'
import { mixVideoSounds, suggestVideoSounds } from '@/lib/creator/video-sound'
import { compileAnalysisVideo, type VideoRecipe, type VideoComposition } from '@/lib/creator/video-composition'
import { disposePreparedVideo, prepareVideo, exportCompositionMp4, type PreparedVideo } from '@/lib/creator/video-renderer'
import { compileProductionVideo, productionCut, productionTimingIssues, assembleProductionAudio, restoreProductionRecording, sectionAudioKey, type SectionAudio } from '@/lib/creator/video-production'
import { sculptureScripts } from '@/lib/creator/cephra-scripts'
import { sculptureModels, sculptureModelLabels, sculptureMaterialLabels, sculptureFinishes, type SculptureModel, type SculptureMaterial } from '@/lib/creator/cephra-study'
import { reportCategories } from '@/lib/creator/mock-report-data'
import { downloadBlob } from '@/lib/creator/export-slides'
import { decodeVoiceover, type VideoVoiceover } from '@/lib/creator/video-voiceover'
import { voiceDirection } from '@/lib/creator/video-speech'
import type { VideoScript } from '@/lib/creator/video-script'
import type { AnalysisPostInput, AnalysisPostPlan } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { videoExportSize } from '@/lib/creator/video-layout'
import { customClipPreviewTime } from '@/lib/creator/custom-video'
import { CreatorPortrait } from './creator-portrait'
import { ContentStylePicker } from './content-style-picker'
import { StudioPostDialog, type StudioExport } from './studio-post-dialog'
import { VideoCompositionPlayer } from './video-composition-player'
import styles from './video-studio.module.css'

const PrivateCharacterStudio = dynamic(() => import('./private-character-studio').then(module => module.PrivateCharacterStudio))
const DocumentarySceneEditor = dynamic(() => import('./documentary-scene-editor').then(module => module.DocumentarySceneEditor))
const CustomVideoEditor = dynamic(() => import('./custom-video-editor').then(module => module.CustomVideoEditor))

type Props = { input: AnalysisPostInput; plan: AnalysisPostPlan; images: GeneratorImage[]; trackExports?: boolean; previewSubmission?: boolean; privatePreview?: boolean }
type Selection = { sculpture?: { model: SculptureModel; material: SculptureMaterial }; id: string; name: string; title?: string; images: GeneratorImage[]; assets?: GeneratorImage[]; story?: CreatorStory; analysis?: CreatorSubjectAnalysis; editorialRatings?: PrivateCharacterDetail['editorialRatings'] }
type Step = 'style' | 'sculpture' | 'person' | 'preview'
type LengthChoice = 30 | 45 | 'full'
const defaultLength=45
const takeStorageKey=(person:string,style:CreatorContentStyleId)=>`creator-take:${style}:${person}`
function previousTake(person:string,style:CreatorContentStyleId):CreatorTake|undefined {
  try { const value=JSON.parse(localStorage.getItem(takeStorageKey(person,style))??'null');return value && typeof value.storyId==='string' && typeof value.recipe==='string' && Number.isInteger(value.variation)?{...value,storyCycle:Array.isArray(value.storyCycle)?value.storyCycle.filter((id:unknown)=>typeof id==='string'):undefined}:undefined } catch { return }
}
function rememberTake(person:string,style:CreatorContentStyleId,take:CreatorTake){
  try { localStorage.setItem(takeStorageKey(person,style),JSON.stringify(take)) } catch { /* Private browsing can disable storage. */ }
}

export default function VideoStudio({ input, plan, images, trackExports = false, previewSubmission = false, privatePreview = false }: Props) {
  const reduced=useReducedMotion()
  const [step,setStep]=useState<Step>('style')
  const [backwards,setBackwards]=useState(false)
  const editorRef=useRef<HTMLElement>(null)
  const headingRef=useRef<HTMLHeadingElement>(null)
  const requestRef=useRef(false)
  const { data: exports, mutate: refreshExports } = useSWR<{ generations: StudioExport[] }>(trackExports ? '/api/creator/studio' : null, apiGet)
  const [postExport, setPostExport] = useState<StudioExport | null>(() => previewSubmission ? { id: 'preview', title: 'Tom Holland · Detailed analysis', campaignName: 'Mogging Detailed Analysis MGC', minimumViews: 5000 } : null)
  const [master,setMaster]=useState<VideoScript|null>(null)
  const [voice,setVoice]=useState(()=>voiceDirection('editorial'))
  const [variation,setVariation]=useState(0)
  const [lengthChoice,setLengthChoice]=useState<LengthChoice>(defaultLength)
  const [clips,setClips]=useState<ReadonlyMap<string,SectionAudio>>(new Map())
  const [audioCut,setAudioCut]=useState<{source:VideoComposition;composition:VideoComposition;audio:VideoVoiceover}|null>(null)
  const [storyOptions,setStoryOptions]=useState<Partial<Record<CreatorSubjectId,CreatorStoryOption[]>>>({})
  const [selection,setSelection]=useState<Selection|null>(null)
  const [recipe,setRecipe]=useState<VideoRecipe>('portrait-audit')
  const [themeOverride,setThemeOverride]=useState<'light'|'dark'|null>(null)
  const [stylePreview,setStylePreview]=useState<CreatorContentStyleId|null>(null)
  const [editing,setEditing]=useState(false)
  const [customComposition,setCustomComposition]=useState<VideoComposition|null>(null)
  const [seekMs,setSeekMs]=useState(0)
  const [playhead,setPlayhead]=useState(0)
  const previewPositionRef=useRef(0)
  const photoCacheRef=useRef(new Map<string,GeneratorImage>())
  const abortRef=useRef<AbortController|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [progress,setProgress]=useState<number|null>(null)
  const [downloaded,setDownloaded]=useState(false)
  const [exportStatus,setExportStatus]=useState('Preparing video…')
  const [remainingSeconds,setRemainingSeconds]=useState<number|null>(null)
  const contentStyle=creatorContentStyle(recipe)
  const busy=loading || progress!==null
  const sourceImages=useMemo(()=>recipe==='documentary-studio' && selection?.assets?selection.assets.map(image=>selection.images.find(ready=>ready.id===image.id)??image):selection?.images??images,[recipe,selection,images])
  const studioInput=useMemo(()=>selection?.editorialRatings?editorialRatingInput(input,selection.name,selection.editorialRatings):selection?creatorAnalysisInput(input,selection.name,selection.analysis):input,[input,selection])
  const studioReports=useMemo(()=>selection?.editorialRatings?editorialRatingReports(selection.editorialRatings,selection.story?.images[0]?.id):selection?.analysis?creatorAnalysisReports(selection.analysis):reportCategories,[selection])
  const cuts=useMemo(()=>{
    const available=new Map<LengthChoice,VideoScript>()
    if(master)for(const choice of [30,45,'full'] as const){try{available.set(choice,creatorStoryCut(master,choice==='full'?75:choice,selection?.story))}catch{/* A length is available only when its complete recorded sections fit. */}}
    return available
  },[master,selection?.story])
  const activeLength=cuts.has(lengthChoice)?lengthChoice:'full'
  const length=activeLength==='full'?75:activeLength
  const cut=cuts.get(activeLength)??null
  const fullSeconds=master?Math.round(master.cues.reduce((sum,cue)=>sum+(clips.get(sectionAudioKey(cue,voice))?.pcm.byteLength??0)/48000,0)*10)/10:0
  const baseComposition=useMemo(()=>{
    if(!cut)return compileAnalysisVideo(plan,input,sourceImages.map(image=>image.id),'brand',reportCategories,{recipe})
    const directions=selection?.story?creatorStoryDirections(selection.story,cut,studioInput,sourceImages,studioReports,recipe,variation):undefined
    const compiled=compileProductionVideo(cut,studioInput,sourceImages,studioReports,recipe,voice,variation,undefined,selection?.editorialRatings?0:1,directions,selection?.story?.media)
    const sculpture = selection?.sculpture
    if (sculpture) compiled.scenes = compiled.scenes.map(scene => scene.sculpture
      ? { ...scene, sculpture: { ...scene.sculpture, ...sculpture } }
      : scene)
    return {...(selection?.editorialRatings?editorialRatingVisibility(compiled,selection.editorialRatings):compiled),title:selection?.title??selection?.story?.title??`${selection?.name??input.subject} · Editorial`,disclosure:recipe==='sculpture-study'?'Illustrative sculpture · App demo values, not a person’s assessment':selection?.editorialRatings?'Creator’s subjective ratings · No new provider analysis':selection?.analysis?'Editorial photo study · Saved front-photo assessment · No endorsement implied':'Editorial photo study · No measured subject scores supplied'}
  },[cut,plan,input,sourceImages,recipe,selection,studioInput,studioReports,variation,voice])
  const draft=customComposition??baseComposition
  const activeAudio=audioCut?.source===draft?audioCut:null
  const videoTheme=themeOverride??draft.theme
  const composition=useMemo(()=>({...activeAudio?.composition??draft,theme:videoTheme}),[activeAudio,draft,videoTheme])
  const renderImages=sourceImages
  const voiceBuffer=activeAudio?.audio.buffer
  const soundPlan=useMemo(()=>suggestVideoSounds(composition),[composition])
  const [soundMix,setSoundMix]=useState<{source:typeof composition;voice?:AudioBuffer;buffer?:AudioBuffer;url?:string;error?:boolean}>()
  const currentMix=soundMix?.source===composition && soundMix.voice===voiceBuffer?soundMix:undefined
  const soundActive=soundPlan.length>0
  const mixingSound=soundActive&&!currentMix
  const timingIssues=activeAudio?productionTimingIssues(composition,length):[]
  const [preparation,setPreparation]=useState<{source:typeof composition;video:PreparedVideo}|null>(null)
  const prepared=preparation?.source===composition?preparation.video:null

  useEffect(()=>{
    if(step!=='person')return
    let disposed=false
    void Promise.allSettled(creatorSubjects.map(async subject=>[subject.id,creatorStoryOptions(await loadCreatorStoryCatalog(subject.id))] as const)).then(results=>{
      if(!disposed)setStoryOptions(Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])))
    })
    return()=>{disposed=true}
  },[step])
  useEffect(()=>{
    if(!selection || step!=='preview' || !activeAudio)return
    let disposed=false,video:PreparedVideo|undefined
    setError('');setPreparation(null)
    void prepareVideo(composition,renderImages).then(result=>{video=result;if(disposed)disposePreparedVideo(result);else setPreparation({source:composition,video:result})}).catch(reason=>{if(!disposed)setError(reason instanceof Error?reason.message:'Could not prepare this video.')})
    return()=>{disposed=true;if(video)disposePreparedVideo(video)}
  },[selection,step,composition,renderImages,Boolean(activeAudio)])
  useEffect(()=>{
    if(!clips.size || !draft.script)return
    let disposed=false,url:string|undefined
    try{
      const result=assembleProductionAudio(draft,clips)
      void decodeVoiceover(result.file,'mogging-voiceover.wav').then(audio=>{
        url=audio.url;if(disposed){URL.revokeObjectURL(url);return}
        setAudioCut({source:draft,composition:result.composition,audio})
      }).catch(reason=>{if(!disposed)setError(reason instanceof Error?reason.message:'Could not load the narration.')})
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not align the narration.')}
    return()=>{disposed=true;if(url)URL.revokeObjectURL(url)}
  },[draft,clips])
  useEffect(()=>{
    if(!soundActive)return
    let disposed=false,url:string|undefined
    void mixVideoSounds(composition.durationMs,voiceBuffer,soundPlan,.5).then(buffer=>{
      if(disposed)return
      if(buffer)url=URL.createObjectURL(bufferToWav(buffer))
      setSoundMix({source:composition,voice:voiceBuffer,buffer:buffer??undefined,url})
    }).catch(()=>{if(!disposed)setSoundMix({source:composition,voice:voiceBuffer,error:true})})
    return()=>{disposed=true;if(url)URL.revokeObjectURL(url)}
  },[composition,voiceBuffer,soundPlan,soundActive])
  useEffect(()=>()=>abortRef.current?.abort(),[])

  function goTo(next:Step){setBackwards(['style','sculpture','person','preview'].indexOf(next)<['style','sculpture','person','preview'].indexOf(step));setStep(next);setEditing(false)}
  async function detectPhotos(photos:GeneratorImage[]){
    const {detectFaceLandmarksFromDataUrl}=await import('@/lib/client/faceLandmarks')
    const result:GeneratorImage[]=[]
    for(const photo of photos){
      const cached=photoCacheRef.current.get(photo.dataUrl)
      if(cached){result.push({...photo,landmarks:cached.landmarks});continue}
      if(photo.landmarks){photoCacheRef.current.set(photo.dataUrl,photo);result.push(photo);continue}
      const detected=await detectFaceLandmarksFromDataUrl(photo.dataUrl)
      if(detected.status!=='detected' && /profile/.test(photo.id)){result.push({...photo,landmarks:null});continue}
      if(detected.status!=='detected')throw new Error(`${photo.name}: ${detected.message}`)
      const ready={...photo,landmarks:detected.landmarks};photoCacheRef.current.set(photo.dataUrl,ready);result.push(ready)
    }
    return result
  }
  async function selectSculpture(model:SculptureModel,material:SculptureMaterial){
    if(requestRef.current || busy)return
    requestRef.current=true;setLoading(true);setError('')
    try{
      const previous=previousTake('sculptures','cephra')
      const compatible=sculptureScripts.filter(script=>script.model===(model==='female'?'female':'male'))
      const candidates=compatible.filter(script=>script.id!==previous?.storyId)
      const chosen=candidates[Math.floor(Math.random()*candidates.length)]??compatible[0]
      const saved=await loadSculptureStory(chosen.id,material,model)
      const take={storyId:chosen.id,recipe:'sculpture-study' as const,variation:Math.floor(Math.random()*10000)}
      productionCut(saved.script,75)
      setMaster(saved.script);setVoice(saved.voice);setClips(saved.clips);setRecipe(take.recipe);setVariation(take.variation);setAudioCut(null);setCustomComposition(null);setSeekMs(0)
      setSelection({sculpture:{model,material},id:`sculpture:${model}`,name:sculptureModelLabels[model],images:saved.story.images,story:saved.story})
      rememberTake('sculptures','cephra',take);goTo('preview')
    }catch(reason){toast.error(reason instanceof Error?reason.message:'Could not prepare this sculpture story.')}
    finally{requestRef.current=false;setLoading(false)}
  }
  async function selectPerson(subject:(typeof creatorSubjects)[number]){
    if(requestRef.current || busy)return
    requestRef.current=true;setLoading(true)
    try{
      const options=storyOptions[subject.id]??creatorStoryOptions(await loadCreatorStoryCatalog(subject.id))
      const take=chooseCreatorTake(contentStyle.id,options,previousTake(subject.id,contentStyle.id))
      const saved=await loadCreatorStory(subject.id,take.storyId)
      const photos=await detectPhotos(saved.story.images)
      // Accept longer recordings when the length picker can fall back to Full.
      creatorStoryCut(saved.script,75,saved.story)
      setMaster(saved.script);setVoice(saved.voice);setClips(saved.clips);setRecipe(take.recipe);setVariation(take.variation);setAudioCut(null);setCustomComposition(null);setSeekMs(0);setError('')
      setSelection({id:subject.id,name:subject.name,images:photos,assets:saved.assets,story:saved.story,analysis:saved.analysis,editorialRatings:saved.story.editorialRatings,})
      rememberTake(subject.id,contentStyle.id,take);goTo('preview')
    }catch(reason){toast.error(reason instanceof Error?reason.message:'Could not create this video.')}
    finally{requestRef.current=false;setLoading(false)}
  }
  async function selectPrivateCharacter(character:PrivateCharacterDetail){
    if(!character.recording)throw new Error('Approve and record this story first.')
    const saved=restoreProductionRecording(character.recording),photos=await detectPhotos(character.images)
    productionCut(saved.script,defaultLength)
    setMaster(saved.script);setVoice(saved.voice);setClips(saved.clips);setVariation(Math.floor(Math.random()*10000));setAudioCut(null);setCustomComposition(null);setSeekMs(0)
    setSelection({id:`private:${character.id}`,name:character.name||'Your person',title:character.title,images:photos,analysis:character.analysis,editorialRatings:character.editorialRatings});goTo('preview')
  }
  function newVariation(){
    if(!selection || busy)return
    if(contentStyle.id==='cephra'){setVariation(current=>current+1);setCustomComposition(null);setSeekMs(0);return}
    const subject=creatorSubjects.find(person=>person.id===selection.id)
    if(subject){void selectPerson(subject);return}
    setVariation(current=>current+1);setCustomComposition(null);setSeekMs(0)
  }
  function edit(){if(!customComposition){setCustomComposition(baseComposition);setSeekMs(customClipPreviewTime(baseComposition.scenes[0]))}setEditing(true)}
  async function downloadVideo() {
    if (!prepared || !activeAudio || busy || timingIssues.length || mixingSound || currentMix?.error) return
    const controller = new AbortController(); abortRef.current = controller; setProgress(0);setDownloaded(false);setExportStatus('Preparing video…');setRemainingSeconds(null);setSeekMs(previewPositionRef.current)
    try {
      const video = await exportCompositionMp4(prepared, setProgress, controller.signal, soundActive ? currentMix?.buffer : voiceBuffer, undefined, setExportStatus, setRemainingSeconds)
      if (controller.signal.aborted) return
      if (trackExports) {
        const bytes = await video.arrayBuffer()
        const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
        const { generation } = await apiPost<{ generation: StudioExport }>('/api/creator/studio', { id: crypto.randomUUID(), personId: selection?.id ?? 'custom', storyId: selection?.story?.id ?? composition.script?.revision ?? 'custom', contentHash, composition }, { signal: controller.signal })
        setPostExport(generation)
        void refreshExports()
      }
      const editName=creatorVideoStyles.find(style=>style.id===recipe)?.label.toLowerCase().replace(/[^a-z0-9]+/g,'-') ?? recipe
      const exportStyle=customComposition?'custom':`${contentStyle.id}-${editName}`
      setDownloaded(true)
      downloadBlob(video,`${selection?.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') ?? 'mogging'}-${exportStyle}.mp4`)
    } catch (reason) { if (!controller.signal.aborted) toast.error(reason instanceof Error ? reason.message : 'Could not download the video') }
    finally { abortRef.current = null; setProgress(null) }
  }

  useEffect(()=>setDownloaded(false),[composition])
  const ready=Boolean(prepared && activeAudio && !mixingSound && !currentMix?.error && !error)
  const pageTitle=step==='style'?'Choose a content style':step==='sculpture'?'Choose your sculpture':step==='person'?'Who’s the post about?':editing?'Make it yours':'Your post'
  const ease=[.22,1,.36,1] as const
  return <div className={styles.studio}>
    <StudioPostDialog key={postExport?.id??'closed'} generation={postExport} preview={previewSubmission} onClose={()=>setPostExport(null)} onSubmitted={()=>{setPostExport(null);void refreshExports()}}/>
    {exports?.generations.length?<div className={styles.pendingPosts}><span>Ready to post</span>{exports.generations.map(generation=><button type="button" key={generation.id} onClick={()=>setPostExport(generation)}>{generation.title} · Submit link</button>)}</div>:null}
    <header className={styles.flowHeader}>
      {step!=='style'?<button type="button" disabled={busy} className={styles.flowBack} onClick={()=>editing?setEditing(false):goTo(step==='preview'?(contentStyle.id==='cephra'?'sculpture':'person'):'style')}><ArrowLeft size={16}/>{editing?'Done':'Back'}</button>:null}
      <h1 ref={headingRef} tabIndex={-1}><TextMorph>{pageTitle}</TextMorph></h1>
      <p>{step==='style'?'Pick the feel. We’ll handle the edit.':step==='sculpture'?'Pick a figure and finish. We’ll build the story around it.':step==='person'?`${contentStyle.name} · A story built around them.`:'Made for your feed. Ready to make your own.'}</p>
    </header>
    <AnimatePresence mode="wait" initial={false} custom={backwards} onExitComplete={()=>headingRef.current?.focus({preventScroll:true})}>
      <motion.div key={step} className={styles.flowStep} custom={backwards} initial={reduced?false:'enter'} animate="visible" exit="exit" variants={{enter:(back:boolean)=>({opacity:0,transform:`perspective(1400px) translateX(${back?-28:28}px) rotateY(${back?-3:3}deg)`}),visible:{opacity:1,transform:'perspective(1400px) translateX(0px) rotateY(0deg)'},exit:(back:boolean)=>({opacity:0,transform:`perspective(1400px) translateX(${back?20:-20}px) rotateY(${back?2:-2}deg)`})}} transition={{duration:reduced?0:.24,ease}}>
        {step==='style'?<div className={styles.styleStep}><ContentStylePicker value={undefined} disabled={busy} previewId={stylePreview} onPreviewChange={setStylePreview} onChange={id=>{if(id==='cephra'){setRecipe('sculpture-study');goTo('sculpture');return}setRecipe(creatorContentStyles.find(style=>style.id===id)!.defaultRecipe);goTo('person')}}/></div>:null}
        {step==='style' && loading?<p className={styles.flowStatus} role="status"><Loader2 size={15} className="animate-spin"/>Lighting the sculpture and bringing your story together…</p>:null}
        {step==='sculpture'?<div className={styles.peopleStep} aria-busy={loading}>
          <AnimatedGroup className={styles.sculptureCards} preset="swing">{sculptureModels.filter(model=>model==='female' || model==='male').flatMap(model=>sculptureFinishes(model).map(material=><button key={`${model}-${material}`} type="button" disabled={busy} className={styles.personCard} onClick={()=>void selectSculpture(model,material)}>
            <span className={`${styles.personPhoto} ${styles.sculpturePhoto}`}><img src={`/creator/sculpture/${model}-${material}.webp`} alt={`${sculptureModelLabels[model]} in ${sculptureMaterialLabels[material].toLowerCase()}`} width={720} height={720}/></span>
            <strong>{sculptureModelLabels[model]}</strong><span>{sculptureMaterialLabels[material]}</span>
          </button>))}</AnimatedGroup>
          {loading?<p className={styles.flowStatus} role="status"><Loader2 size={15} className="animate-spin"/>Lighting your sculpture and bringing the story together…</p>:null}
        </div>:null}
        {step==='person'?<div className={styles.peopleStep} aria-busy={loading}>
          <AnimatedGroup className={styles.peopleCards} preset="swing">{creatorSubjects.map(subject=>{
            const available=storyOptions[subject.id]?.some(story=>story.recording && contentStyleSupportsScript(contentStyle.id,story))
            return <button key={subject.id} type="button" disabled={busy || available===false} className={styles.personCard} onClick={()=>void selectPerson(subject)}>
              <span className={styles.personPhoto}>{creatorSubjectPhotos(subject)?.[0]?<CreatorPortrait src={creatorSubjectPhotos(subject)![0].dataUrl} initials={subject.initials}/>:<span>{subject.initials}</span>}</span>
              <strong>{subject.name}</strong><span>{available===false?'Coming soon':'Create a post'}</span>
            </button>
          })}</AnimatedGroup>
          <PrivateCharacterStudio enabled={trackExports} preview={privatePreview} selectedId={selection?.id} onSelect={selectPrivateCharacter}/>
          {loading?<p className={styles.flowStatus} role="status"><Loader2 size={15} className="animate-spin"/>Finding their story and bringing the edit together…</p>:null}
        </div>:null}
        {step==='preview' && selection?<div className={styles.result} data-editing={editing}>
          <section className={styles.resultPreview} aria-label="Post preview">
            <VideoCompositionPlayer prepared={prepared} composition={composition} seekMs={seekMs} audioUrl={soundActive && currentMix?.url?currentMix.url:activeAudio?.audio.url} onTime={time=>{previewPositionRef.current=time;if(customComposition)setPlayhead(time)}}/>
          </section>
          <aside className={styles.resultDetails}>
            <div><div className={styles.resultHeadingRow}><span className={styles.resultStyle}>{contentStyle.name}</span><button type="button" className={styles.videoThemeToggle} aria-label="Dark mode" aria-pressed={videoTheme==='dark'} title={`Switch to ${videoTheme==='dark'?'light':'dark'} video`} disabled={busy} onClick={()=>{setSeekMs(previewPositionRef.current);setThemeOverride(videoTheme==='dark'?'light':'dark')}}>{videoTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</button></div><h2>{selection.name}</h2><div className={styles.resultTitle}><TextMorph style={{whiteSpace:'normal'}}>{selection.title??selection.story?.title??'Your story'}</TextMorph></div><p className={styles.resultMeta}>{Math.round(composition.durationMs/1000)} seconds · {creatorVideoStyles.find(style=>style.id===recipe)?.label}</p></div>
            <AnimatedDialogPanel contentKey={editing?'edit':'posting'} motionStyle="swish">
              {editing?<div className={styles.editIntro}><h3>Give it your finishing touches.</h3><p>Rearrange the clips or adjust the details below. Your changes stay in this preview.</p></div>:<StudioPostingGuide/>}
            </AnimatedDialogPanel>
            {!editing?<div className={styles.lengthPicker} role="group" aria-label="Video length">{([30,45,'full'] as const).map(choice=><button key={choice} type="button" aria-pressed={activeLength===choice} disabled={busy || !cuts.has(choice)} onClick={()=>{setLengthChoice(choice);setCustomComposition(null);setSeekMs(0)}}>{activeLength===choice?<motion.span className={styles.lengthSelection} layoutId="studio-length-selection" transition={{duration:reduced?0:.2,ease}}/>:null}<span>{choice==='full'?`Full · ${fullSeconds}s`:`${choice}s`}</span></button>)}</div>:null}
            {!ready && !error?<p role="status" className={styles.flowStatus}><Loader2 size={15} className="animate-spin"/>{loading?'Creating a new variation…':'Preparing your preview…'}</p>:null}
            {error?<p role="alert" className={styles.flowError}>{error}</p>:null}
            {currentMix?.error?<p role="alert" className={styles.flowError}>Audio effects couldn’t load. Try a new variation.</p>:null}
            <footer className={styles.resultActions}>
              <div className={styles.secondaryActions}><button type="button" disabled={busy || !prepared} onClick={()=>editing?setEditing(false):edit()}><PencilLine size={16}/>{editing?'Done editing':'Edit'}</button><motion.button type="button" disabled={busy || !ready && !error && !currentMix?.error} aria-busy={!ready && !error} onClick={newVariation} whileTap={reduced?undefined:{scale:.97}}>{!ready && !error && !reduced?<BorderBeam size={48} duration={2.2} colorFrom="#b5b5ba" colorTo="#52525b"/>:null}<motion.span animate={!ready && !reduced?{rotate:360}:{rotate:0}} transition={{duration:1.4,repeat:!ready?Infinity:0,ease:'linear'}}><RotateCcw size={16}/></motion.span><TextMorph>{!ready && !error?'Creating variation':'Variation'}</TextMorph></motion.button></div>
              <motion.button type="button" whileTap={reduced?undefined:{scale:.985}} className={styles.download} aria-busy={progress!==null || !ready} disabled={!ready || busy || timingIssues.length>0} onClick={()=>void downloadVideo()}>{progress!==null?<Loader2 size={19} className="animate-spin"/>:downloaded?<Check size={19}/>:<Download size={19}/>}<TextMorph>{progress!==null?exportStatus.startsWith('Rendering video')?`Rendering ${Math.min(99,Math.round(progress*100))}%`:exportStatus:!ready?'Preparing video':downloaded?'Download again':'Download video'}</TextMorph>{progress!==null?<motion.span aria-hidden="true" className={styles.downloadProgress} initial={{scaleX:0}} animate={{scaleX:progress}} transition={{duration:reduced?0:.2,ease:'linear'}}/>:null}</motion.button>
              {progress!==null?<RenderTimeRemaining seconds={remainingSeconds}/>:null}
              {progress!==null?<button type="button" className={styles.cancelExport} onClick={()=>abortRef.current?.abort()}>Cancel download</button>:null}
              <p className={styles.exportDetails}>{videoExportSize.width} × {videoExportSize.height} · MP4 · Voiceover included</p>
              {timingIssues.map(issue=><p key={issue} role="alert" className={styles.flowError}>{issue}</p>)}
              
            </footer>
          </aside>
          <AnimatePresence initial={false}>{editing && customComposition?<motion.section ref={editorRef} tabIndex={-1} className={styles.resultEditor} aria-label="Edit your post" initial={reduced?false:'hidden'} animate="visible" exit="exit" variants={{hidden:{opacity:0,transform:'translateY(14px)',filter:'blur(3px)'},visible:{opacity:1,transform:'translateY(0px)',filter:'blur(0px)'},exit:{opacity:0,transform:'translateY(7px)',filter:'blur(2px)'}}} transition={{duration:reduced?0:.26,ease}} onAnimationComplete={state=>{if(state==='visible'){editorRef.current?.focus({preventScroll:true});editorRef.current?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'nearest'})}}}><div className={styles.editBar}><span>Fine-tune your post</span><button type="button" onClick={()=>setEditing(false)}>Back to preview</button></div>{recipe==='documentary-studio'?<DocumentarySceneEditor composition={composition} prepared={prepared} images={renderImages} onChange={setCustomComposition} onSeek={setSeekMs}/>:<CustomVideoEditor composition={composition} prepared={prepared} images={renderImages} input={studioInput} reports={studioReports} playhead={playhead} onChange={setCustomComposition} onSeek={setSeekMs}/>}</motion.section>:null}</AnimatePresence>
        </div>:null}
      </motion.div>
    </AnimatePresence>
  </div>
}
