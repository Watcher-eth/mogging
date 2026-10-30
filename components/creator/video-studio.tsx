import { creatorAnalysisInput, creatorAnalysisReports, creatorStoryDirections, creatorStoryOptions, loadCreatorStoryCatalog, loadCreatorStory, type CreatorStory, type CreatorStoryOption, type CreatorSubjectAnalysis } from '@/lib/creator/creator-stories'
import { featureTopics, featureTopicLabels, type FeatureTopic } from '@/lib/creator/feature-study'
import { createFeatureStudyDraft } from '@/lib/creator/feature-study-script'
import { featureVariantPhotos } from '@/lib/creator/feature-study-assets'
import useSWR from 'swr'
import { apiGet, apiPost } from '@/lib/api/client'
import { StudioPostDialog, type StudioExport } from './studio-post-dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, Clapperboard, Download, Focus, Loader2, Moon, PanelsTopLeft, Plus, RotateCcw, Ruler, ScanFace } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { customClipPreviewTime } from '@/lib/creator/custom-video'
import { CustomVideoEditor } from './custom-video-editor'
import { VideoCompositionPlayer } from './video-composition-player'
import { compileAnalysisVideo, videoImageIds, type VideoRecipe, type VideoComposition } from '@/lib/creator/video-composition'
import { prepareVideo, exportCompositionMp4, type PreparedVideo } from '@/lib/creator/video-renderer'
import { videoSize } from '@/lib/creator/video-layout'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles, validateCreatorPhotos, type CreatorSubjectId } from '@/lib/creator/creator-catalog'
import { reportCategories } from '@/lib/creator/mock-report-data'
import { downloadBlob } from '@/lib/creator/export-slides'
import type { AnalysisPostInput, AnalysisPostPlan } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { ProductionScriptEditor } from './production-script-editor'
import { createProductionDraft } from '@/lib/creator/production-drafts'
import { packProductionRecording, restoreProductionRecording, compileProductionVideo, productionVisualPlan, productionCut, productionTimingIssues, sectionAudioKey, assembleProductionAudio, type ProductionLength, type SectionAudio } from '@/lib/creator/video-production'
import type { VideoScript } from '@/lib/creator/video-script'
import { decodeVoiceover, type VideoVoiceover } from '@/lib/creator/video-voiceover'
import { voiceDirection } from '@/lib/creator/video-speech'
import styles from './video-studio.module.css'

type Props = { input: AnalysisPostInput; plan: AnalysisPostPlan; images: GeneratorImage[]; trackExports?: boolean; previewSubmission?: boolean }
type Selection = { id: CreatorSubjectId; name: string; images: GeneratorImage[]; darkImages?: GeneratorImage[]; story?: CreatorStory; stories?: CreatorStoryOption[]; analysis?: CreatorSubjectAnalysis }

const styleIcons = { 'portrait-audit': ScanFace, 'report-led': PanelsTopLeft, 'measurement-explainer': Ruler, 'feature-study': Focus, 'hybrid-story': Clapperboard }

export default function VideoStudio({ input, plan, images, trackExports = false, previewSubmission = false }: Props) {
  const { data: exports, mutate: refreshExports } = useSWR<{ generations: StudioExport[] }>(trackExports ? '/api/creator/studio' : null, apiGet)
  const [postExport, setPostExport] = useState<StudioExport | null>(() => previewSubmission ? { id: 'preview', title: 'Tom Holland · Detailed analysis', campaignName: 'Mogging Detailed Analysis MGC', minimumViews: 5000 } : null)
  const [master, setMaster] = useState<VideoScript | null>(null)
  const [length, setLength] = useState<ProductionLength>(75)
  const [sectionIds, setSectionIds] = useState<string[] | undefined>()
  const [voice, setVoice] = useState(() => voiceDirection('editorial'))
  const [featureAmount, setFeatureAmount] = useState(1)
  const [retouchOperation, setRetouchOperation] = useState<'add' | 'remove' | 'replace' | 'shorten' | 'lengthen' | 'align'>('add')
  const [featureTopic, setFeatureTopic] = useState<FeatureTopic>('philtrum')
  const [variation, setVariation] = useState(0)
  const [clips, setClips] = useState<ReadonlyMap<string, SectionAudio>>(new Map())
  const [generating, setGenerating] = useState<string | null>(null)
  const [audioStatus, setAudioStatus] = useState('')
  const [audioCut, setAudioCut] = useState<{ source: VideoComposition; composition: VideoComposition; audio: VideoVoiceover } | null>(null)
  const [storyCounts, setStoryCounts] = useState<Partial<Record<CreatorSubjectId, number>>>({})
  const [selection, setSelection] = useState<Selection | null>(null)
  const [theme, setTheme] = useState<VideoComposition['theme']>('light')
  const [mode, setMode] = useState<'format' | 'clips' | 'script'>('format')
  const editing = mode === 'clips', writing = mode === 'script'
  const [customComposition, setCustomComposition] = useState<VideoComposition | null>(null)
  const [seekMs, setSeekMs] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const previewPositionRef = useRef(0)
  const [recipe, setRecipe] = useState<VideoRecipe>('portrait-audit')
  const [customTarget, setCustomTarget] = useState<CreatorSubjectId | null>(null)
  const [customName, setCustomName] = useState('')
  const [frontPhotos, setFrontPhotos] = useState<File[]>([])
  const [sidePhoto, setSidePhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const photoTriggerRef = useRef<HTMLElement | null>(null)
  const urlsRef = useRef(new Set<string>())
  const photoCacheRef = useRef(new Map<string, GeneratorImage>())
  const abortRef = useRef<AbortController | null>(null)
  const sourceImages = selection?.images ?? images
  const studioInput = useMemo(() => selection ? creatorAnalysisInput(input, selection.name, selection.analysis) : input, [input, selection])
  const studioReports = useMemo(() => selection?.analysis ? creatorAnalysisReports(selection.analysis) : reportCategories, [selection])
  const cut = useMemo(() => master ? productionCut(master, length, sectionIds) : null, [master, length, sectionIds])
  const baseComposition = useMemo(() => {
    if (cut) {
      const directions = selection?.story ? creatorStoryDirections(selection.story, cut, studioInput, sourceImages, studioReports, recipe, variation) : undefined
      return { ...compileProductionVideo(cut, studioInput, sourceImages, studioReports, recipe, voice, variation, featureTopic, featureAmount, directions), title: selection?.story?.title ?? `${selection?.name ?? input.subject} · Modular editorial`, disclosure: selection?.analysis ? 'Editorial photo study · Saved front-photo assessment · No endorsement implied' : 'Editorial photo study · No measured subject scores supplied' }
    }
    return compileAnalysisVideo(plan, input, sourceImages.map(image => image.id), 'brand', reportCategories, { recipe })
  }, [selection, recipe, input, studioInput, studioReports, plan, sourceImages, cut, voice, variation, featureTopic, featureAmount])
  const visualPlan = useMemo(() => {
    if (!writing || !cut) return []
    const directions = selection?.story ? creatorStoryDirections(selection.story, cut, studioInput, sourceImages, studioReports, recipe, variation) : {}
    return productionVisualPlan(cut, studioInput, sourceImages, studioReports, recipe, variation, featureTopic, featureAmount).map(shot => ({ ...shot.decision,
      ...(directions[shot.id]?.kind === 'report' ? { primitive: 'report' as const, reason: `Open the saved ${directions[shot.id].categoryId} report for this narrated category.` }
        : directions[shot.id]?.featureStudy ? { primitive: directions[shot.id].featureStudy!.layout === 'detail' ? 'detail' as const : directions[shot.id].featureStudy!.edit ? 'edit' as const : 'portrait' as const, reason: 'A single registered portrait keeps the same crop and original texture while the named feature changes locally.' } : {}), sourceId: shot.cue.sourceId }))
  }, [writing, cut, selection, studioInput, studioReports, sourceImages, recipe, variation, featureTopic, featureAmount])
  const draft = customComposition ?? baseComposition
  const renderImages = useMemo(() => {
    if (theme !== 'dark' || !selection?.darkImages) return sourceImages
    const registered = videoImageIds(draft.scenes.filter(scene => scene.featureStudy))
    return sourceImages.map(image => registered.has(image.id) ? image : selection.darkImages!.find(dark => dark.id === image.id) ?? image)
  }, [theme, selection, sourceImages, draft])
  const activeAudio = audioCut?.source === draft ? audioCut : null
  const composition = useMemo(() => ({ ...(activeAudio?.composition ?? draft), theme }), [draft, theme, activeAudio])
  const timingIssues = activeAudio ? productionTimingIssues(composition, length) : []
  const [preparation, setPreparation] = useState<{ source: typeof composition; video: PreparedVideo } | null>(null)
  const prepared = preparation?.source === composition ? preparation.video : null
  const busy = loading || progress !== null || generating !== null

  useEffect(() => {
    let disposed = false
    void Promise.allSettled(creatorSubjects.map(async subject => [subject.id, creatorStoryOptions(await loadCreatorStoryCatalog(subject.id)).length] as const)).then(results => {
      if (!disposed) setStoryCounts(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])))
    })
    return () => { disposed = true }
  }, [])

  // Hot updates must also discover new scripts for a person already open in the studio.
  useEffect(() => {
    if (!selection || selection.id === 'custom' || selection.stories) return
    let disposed = false
    const subjectId = selection.id
    void loadCreatorStoryCatalog(subjectId).then(catalog => {
      if (!disposed) setSelection(current => current?.id === subjectId && !current.stories ? { ...current, stories: creatorStoryOptions(catalog) } : current)
    }).catch(reason => { if (!disposed) toast.error(reason instanceof Error ? reason.message : 'Could not refresh the story choices') })
    return () => { disposed = true }
  }, [selection])

  useEffect(() => {
    if (!selection) return
    let disposed = false
    setError('')
    void prepareVideo(composition, renderImages).then(video => { if (!disposed) setPreparation({ source: composition, video }) }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not prepare the preview') })
    return () => { disposed = true }
  }, [selection, composition, renderImages])
  useEffect(() => {
    const urls = urlsRef.current
    return () => { abortRef.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [])

  useEffect(() => {
    if (!clips.size || !draft.script) { setAudioStatus('No voiceover recorded. Preview and export are silent.'); return }
    let disposed = false
    let url: string | undefined
    try {
      const result = assembleProductionAudio(draft, clips)
      void decodeVoiceover(result.file, 'mogging-voiceover.wav').then(audio => {
        url = audio.url
        if (disposed) { URL.revokeObjectURL(url); return }
        setAudioCut({ source: draft, composition: result.composition, audio })
        setAudioStatus(result.alignmentError ? `Audio ready; word timing is estimated. ${result.alignmentError}` : result.composition.timing === 'words' ? 'Voiceover ready · measured word timing' : 'Voiceover ready · section timing measured, word timing estimated')
      }).catch(reason => { if (!disposed) setAudioStatus(reason instanceof Error ? reason.message : 'Could not decode the voiceover.') })
    } catch (reason) { setAudioStatus(reason instanceof Error ? reason.message : 'Record the selected sections.') }
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [draft, clips])

  function startScript(name: string, topic = featureTopic) {
    setMaster(recipe === 'feature-study' ? createFeatureStudyDraft(name, topic) : createProductionDraft(name)); setLength(75); setSectionIds(undefined); setVariation(0); setClips(new Map()); setAudioCut(null); setMode('format')
  }
  function approveScript(script: VideoScript) {
    // Validate the requested cut before committing a new master; no stale audio is attached to edited wording.
    productionCut(script, length)
    setMaster(script); setSectionIds(undefined); setCustomComposition(null); setSeekMs(0)
  }
  async function recordVoiceover() {
    if (!master || busy) return
    const controller = new AbortController(); abortRef.current = controller
    const next = new Map(clips)
    setGenerating('Checking speech configuration')
    try {
      const readiness = await fetch('/api/creator/voiceover', { signal: controller.signal }).then(response => response.json())
      const configured = readiness.data ?? readiness
      if (!configured.configured) throw new Error('Speech is not configured. Set GEMINI_API_KEY on the server, then generate the approved sections.')
      for (const cue of master.cues) {
        const key = sectionAudioKey(cue, voice)
        if (next.has(key)) continue
        setGenerating(cue.section!.title)
        const response = await fetch('/api/creator/voiceover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cue.text, voice, delivery: cue.delivery }), signal: controller.signal })
        const payload = await response.json()
        const value = payload.data ?? payload
        if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : value.error?.message ?? value.message ?? 'Speech generation failed.')
        if (controller.signal.aborted) break
        const pcm = Uint8Array.from(atob(value.audio), character => character.charCodeAt(0))
        next.set(key, { key, cueId: cue.id, pcm, words: value.words }); setClips(new Map(next))
      }
    } catch (reason) { if (!controller.signal.aborted) { const message = reason instanceof Error ? reason.message : 'Could not generate the voiceover.'; setAudioStatus(message); toast.error(message) } }
    finally { abortRef.current = null; setGenerating(null) }
  }

  async function detectPhotos(photos: GeneratorImage[]) {
    const { detectFaceLandmarksFromDataUrl } = await import('@/lib/client/faceLandmarks')
    const result: GeneratorImage[] = []
    for (const photo of photos) {
      const cached = photoCacheRef.current.get(photo.dataUrl)
      if (cached) { result.push(cached); continue }
      if (photo.landmarks) { result.push(photo); continue }
      const detected = await detectFaceLandmarksFromDataUrl(photo.dataUrl)
      if (detected.status !== 'detected') throw new Error(`${photo.name}: ${detected.message}`)
      const image = { ...photo, landmarks: detected.landmarks }
      photoCacheRef.current.set(photo.dataUrl, image); result.push(image)
    }
    return result
  }
  function openPhotoDialog(target: CreatorSubjectId) {
    photoTriggerRef.current = document.activeElement as HTMLElement | null
    setCustomTarget(target); setPhotoError(''); setFrontPhotos([]); setSidePhoto(null)
  }
  async function selectPerson(subject: (typeof creatorSubjects)[number]) {
    if (busy) return
    if (!creatorSubjectPhotos(subject)?.length) { openPhotoDialog(subject.id); return }
    setLoading(true); setPhotoError('')
    try {
      const saved = await loadCreatorStory(subject.id)
      const [photos, darkImages] = await Promise.all([
        detectPhotos(saved.story.images),
        'darkImages' in subject ? detectPhotos(creatorSubjectPhotos(subject, 'dark')!.map((photo, index) => ({ ...photo, id: index === 0 ? saved.story.images[0].id : photo.id }))) : undefined,
      ])
      setMaster(saved.script); setVoice(saved.voice); setClips(saved.clips); setLength(75); setSectionIds(undefined); setVariation(0); setAudioCut(null); setMode('format')
      const extras = featureVariantPhotos(subject.id, photos[0].id).filter(photo => !photos.some(existing => existing.id === photo.id || existing.retouch && photo.retouch && existing.retouch.feature === photo.retouch.feature && existing.retouch.operation === photo.retouch.operation))
      setCustomComposition(null); setSeekMs(0); setSelection({ id: subject.id, name: subject.name, images: [...photos, ...extras], darkImages, story: saved.story, stories: saved.stories, analysis: saved.analysis }); setCustomTarget(null)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not load this person') }
    finally { setLoading(false) }
  }
  async function selectStory(storyId: string) {
    if (!selection || busy || selection.story?.id === storyId) return
    setLoading(true)
    try {
      const saved = await loadCreatorStory(selection.id, storyId)
      setMaster(saved.script); setVoice(saved.voice); setClips(saved.clips); setAudioCut(null)
      setLength(75); setSectionIds(undefined); setVariation(0); setCustomComposition(null); setSeekMs(0)
      setSelection({ ...selection, story: saved.story, stories: saved.stories, analysis: saved.analysis })
      if (saved.story.kind === 'score-walkthrough') setRecipe('report-led')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not load this story') }
    finally { setLoading(false) }
  }
  async function uploadPhotos(files: File[]) {
    if (!files?.length || busy || !customTarget) return
    setLoading(true); setPhotoError('')
    const urls: string[] = []
    try {
      if (frontPhotos.length !== 2 || files.length > 3) throw new Error('Choose two front-facing portraits and, optionally, one side profile.')
      const photos: GeneratorImage[] = []
      for (const [index, file] of files.entries()) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Use JPG, PNG or WebP originals, up to 20 MB each.')
        const url = URL.createObjectURL(file); urls.push(url)
        const image = new Image(); image.src = url; await image.decode()
        photos.push({ id: `custom-${index === 2 ? 'profile' : 'front'}-${crypto.randomUUID()}`, name: `${index === 2 ? 'Side profile' : 'Front portrait'} · ${file.name}`, dataUrl: url, width: image.naturalWidth, height: image.naturalHeight, status: 'ready', landmarks: null })
      }
      validateCreatorPhotos(photos)
      const detected = await detectPhotos(photos)
      const subject = creatorSubjects.find(subject => subject.id === customTarget)
      const name = subject?.name ?? (customName.trim() || 'Your person')
      setFeatureTopic('philtrum'); startScript(name, 'philtrum'); setCustomComposition(null); setSeekMs(0); setSelection({ id: customTarget, name, images: detected })
      urls.forEach(url => urlsRef.current.add(url)); setCustomTarget(null)
    } catch (reason) { urls.forEach(url => { URL.revokeObjectURL(url); photoCacheRef.current.delete(url) }); setPhotoError(reason instanceof Error ? reason.message : 'Could not load the photos') }
    finally { setLoading(false) }
  }
  async function uploadFeatureEdit(file: File | undefined) {
    if (!file || !selection || busy) return
    setLoading(true)
    const url = URL.createObjectURL(file)
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Use JPG, PNG or WebP, up to 20 MB.')
      const image = new Image(); image.src = url; await image.decode()
      validateCreatorPhotos([{ width: image.naturalWidth, height: image.naturalHeight }])
      const id = `${selection.id}-study-${featureTopic}-${retouchOperation}`
      const baseline = selection.images.find(photo => /front/.test(photo.id) && !photo.retouch) ?? selection.images[0]
      const [edited] = await detectPhotos([{ id, name: `Edited illustration · ${file.name}`, dataUrl: url, width: image.naturalWidth, height: image.naturalHeight, status: 'ready', landmarks: null, retouch: { feature: featureTopic, operation: retouchOperation, baselineImageId: baseline.id } }])
      urlsRef.current.add(url)
      setSelection({ ...selection, images: [...selection.images.filter(photo => photo.id !== id), edited] })
      setCustomComposition(null); setSeekMs(0)
    } catch (reason) { URL.revokeObjectURL(url); toast.error(reason instanceof Error ? reason.message : 'Could not register the edited photo.') }
    finally { setLoading(false) }
  }
  async function downloadVideo() {
    if (!prepared || busy || timingIssues.length) return
    const controller = new AbortController(); abortRef.current = controller; setProgress(0)
    try {
      const video = await exportCompositionMp4(prepared, setProgress, controller.signal, activeAudio?.audio.buffer)
      if (controller.signal.aborted) return
      if (trackExports) {
        const bytes = await video.arrayBuffer()
        const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
        const { generation } = await apiPost<{ generation: StudioExport }>('/api/creator/studio', { id: crypto.randomUUID(), personId: selection?.id ?? 'custom', storyId: selection?.story?.id ?? composition.script?.revision ?? 'custom', contentHash, composition }, { signal: controller.signal })
        setPostExport(generation)
        void refreshExports()
      }
      downloadBlob(video, `${selection?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'mogging'}-${customComposition ? 'custom' : recipe}.mp4`)
    } catch (reason) { if (!controller.signal.aborted) toast.error(reason instanceof Error ? reason.message : 'Could not download the video') }
    finally { abortRef.current = null; setProgress(null) }
  }

  const storyPicker = selection?.stories?.length ? <fieldset disabled={busy} className="grid gap-3">
    <legend className="mb-2 text-sm font-medium">Choose a script</legend>
    <div className={styles.storyChoices}>{selection.stories.map(story => <button key={story.id} type="button" aria-pressed={selection.story?.id === story.id} className={styles.storyChoice} onClick={() => void selectStory(story.id)}>
      <span className={styles.storyHeading}><span className={styles.storyLabel}>{story.kind === 'score-walkthrough' ? <Focus size={18} strokeWidth={1.5} aria-hidden="true" /> : <BookOpen size={18} strokeWidth={1.5} aria-hidden="true" />}{story.kind === 'score-walkthrough' ? 'Detailed analysis' : 'Story'}</span><span className={styles.selectionBox} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></span>
      <span className={styles.storyTitle}>{story.title}</span>
    </button>)}</div>
  </fieldset> : null

  return <div className={styles.studio}>
    <StudioPostDialog key={postExport?.id ?? 'closed'} generation={postExport} preview={previewSubmission} onClose={() => setPostExport(null)} onSubmitted={() => { setPostExport(null); void refreshExports() }} />
    {exports?.generations.length ? <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-neutral-500"><span>Ready to post</span>{exports.generations.map(generation => <button type="button" className="max-w-64 truncate rounded-full border border-neutral-200 px-3 py-2 text-neutral-800" key={generation.id} onClick={() => setPostExport(generation)}>{generation.title} · Submit link</button>)}</div> : null}
    <Dialog open={customTarget !== null} onOpenChange={open => { if (!open && !loading) setCustomTarget(null) }}>
      {customTarget ? <DialogContent onCloseAutoFocus={event => { event.preventDefault(); photoTriggerRef.current?.focus() }} className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto border-0 p-7 sm:p-8">
        <DialogTitle>{customTarget === 'custom' ? 'Add your person' : `Add ${creatorSubjects.find(subject => subject.id === customTarget)?.name ?? ''} photos`}</DialogTitle>
        <DialogDescription>Two high-quality front-facing portraits, plus an optional side profile. Same person, even lighting, face unobstructed.</DialogDescription>
        <form className="grid gap-5" onSubmit={event => { event.preventDefault(); void uploadPhotos([...frontPhotos, ...(sidePhoto ? [sidePhoto] : [])]) }}>
          <fieldset disabled={busy} className="grid gap-5">
            {customTarget === 'custom' ? <label className={styles.photoField}><span>Name</span><input aria-label="Person’s name" value={customName} maxLength={80} onChange={event => setCustomName(event.target.value)} placeholder="Person’s name" className="min-h-11 rounded-xl bg-neutral-50 px-3 text-sm" /></label> : null}
            <label className={styles.photoField}><span>Front portraits <small>2 required</small></span><input aria-label="Two front-facing portraits" type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={event => { setFrontPhotos(Array.from(event.target.files ?? [])); setPhotoError('') }} /><small>{frontPhotos.length ? `${frontPhotos.length} of 2 selected` : 'Choose two clear, front-facing photos.'}</small></label>
            <label className={styles.photoField}><span>Side profile <small>Optional</small></span><input aria-label="Optional side profile" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setSidePhoto(event.target.files?.[0] ?? null); setPhotoError('') }} /></label>
            <p className="text-xs leading-5 text-neutral-500">Minimum Full HD: 1080 × 1920 portrait or 1920 × 1080 landscape. Bigger is better. JPG, PNG or WebP, up to 20 MB each.</p>
            {photoError ? <p role="alert" className="text-xs text-red-700">{photoError}</p> : null}
            {frontPhotos.length > 2 ? <p role="alert" className="text-xs text-red-700">Choose exactly two front-facing photos.</p> : null}
            <button type="submit" disabled={busy || frontPhotos.length !== 2} className={styles.photoSubmit}>{loading ? <><Loader2 size={16} className="animate-spin" /> Loading story & photos…</> : 'Use photos'}</button>
          </fieldset>
        </form>
      </DialogContent> : null}
    </Dialog>

    <div className={styles.studioLayout}>
      <h1 className={styles.studioTitle}>Creator video studio</h1>
      <div className={styles.studioToolbar}><nav className={styles.editorModes} aria-label="Studio navigation"><button type="button" aria-pressed={!editing && !writing} onClick={() => { setMode('format') }}>Format</button><button type="button" disabled={!selection || busy} aria-pressed={editing} onClick={() => { if (!customComposition) { setCustomComposition(baseComposition); setSeekMs(customClipPreviewTime(baseComposition.scenes[0])) } setMode('clips') }}>Edit clips</button><button type="button" disabled={!selection || busy} aria-pressed={writing} onClick={() => { setMode('script') }}>Script & voice</button></nav><button type="button" role="switch" aria-checked={theme === 'dark'} aria-label="Dark mode" disabled={busy} className={styles.themeToggle} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}><Moon size={16} aria-hidden="true" /><span>Dark mode</span><span aria-hidden="true" className={styles.themeTrack} /></button></div>
      <section className={styles.studioPreview}>
        {selection && !prepared && !error ? <span role="status" className="sr-only">Preparing selected style…</span> : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <VideoCompositionPlayer prepared={prepared} composition={composition} seekMs={seekMs} audioUrl={activeAudio?.audio.url} onTime={time => { previewPositionRef.current = time; if (customComposition) setPlayhead(time) }} />
      </section>
      <div className={styles.studioEditor}>

        {writing || editing ? storyPicker : null}
        {writing && master && cut ? <ProductionScriptEditor recordedComposition={activeAudio?.composition} subjectAnalysis={selection?.analysis} visualPlan={visualPlan} key={master.revision} script={master} cut={cut} length={length} voice={voice} generating={generating} audioStatus={audioStatus} onApprove={approveScript} onLength={seconds => { if (master) productionCut(master, seconds); setLength(seconds); setSectionIds(undefined); setCustomComposition(null); setSeekMs(0) }} onSections={ids => { productionCut(master, length, ids); setSectionIds(ids); setCustomComposition(null); setSeekMs(0) }} onVoice={next => { setVoice(next); setCustomComposition(null) }} onRecord={() => void recordVoiceover()} onCancel={() => abortRef.current?.abort()} onSaveRecording={() => downloadBlob(new Blob([JSON.stringify(packProductionRecording(master, voice, clips))], { type: 'application/json' }), 'mogging-script-recording.json')} onRestoreRecording={value => { const restored = restoreProductionRecording(value); productionCut(restored.script, length); setMaster(restored.script); setVoice(restored.voice); setClips(restored.clips); setSectionIds(undefined); setCustomComposition(null); setSeekMs(0) }} /> : null}
        {!editing && !writing ? <><fieldset disabled={busy} className="grid gap-5"><legend className="sr-only">Choose a person</legend>
          <div><p className={styles.eyebrow}>01 · The person</p><h2 className="mt-2 text-lg font-semibold tracking-tight">Who’s the video about?</h2></div>
          <div className={styles.personGrid}>{creatorSubjects.map(subject => <button key={subject.id} type="button" aria-pressed={selection?.id === subject.id} className={styles.person} onClick={() => void selectPerson(subject)}>
            {creatorSubjectPhotos(subject)?.[0] ? <img src={creatorSubjectPhotos(subject)![0].dataUrl} alt="" className={styles.personAvatar} /> : <span className={styles.personAvatar}>{subject.initials}</span>}
            <span className={styles.personText}><strong>{subject.name}</strong><span>{storyCounts[subject.id] === undefined ? 'Scripts' : `${storyCounts[subject.id]} ${storyCounts[subject.id] === 1 ? 'Script' : 'Scripts'}`}</span></span>
          </button>)}<button type="button" aria-pressed={selection?.id === 'custom'} className={styles.person} onClick={() => openPhotoDialog('custom')}><span className={styles.personAvatar}><Plus size={25} aria-hidden="true" /></span><span className={styles.personText}><strong>Your own person</strong><span>Upload photos</span></span></button></div>

          {loading ? <p role="status" className="text-xs text-zinc-500">Loading story & photos…</p> : null}
        </fieldset>
        {storyPicker}
        <fieldset disabled={busy || !selection} className="grid gap-4"><legend className="sr-only">Choose a starting style</legend>
          <div className={styles.styleHeading}><h2>Choose a style</h2><button type="button" className={styles.refreshStyle} aria-label="Try another style variation" title="Try another style variation" onClick={() => { setVariation(value => value + 1); setCustomComposition(null); setSeekMs(0) }}><RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" /></button></div>
          <div className="grid gap-2" role="group" aria-label="Starting style">{creatorVideoStyles.map(style => {
            const Icon = styleIcons[style.id]
            return <button key={style.id} type="button" aria-pressed={recipe === style.id} className={styles.styleOption} onClick={() => { setRecipe(style.id); setCustomComposition(null); setSeekMs(previewPositionRef.current) }}>
              <Icon size={20} strokeWidth={1.5} className={styles.styleIcon} aria-hidden="true" /><span className="flex-1"><span className="block text-sm font-medium">{style.label}</span><span className="mt-1 block text-[11px] leading-4 text-zinc-500">{style.detail}</span></span><span className={styles.selectionBox} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
            </button>
          })}</div>
          {recipe === 'feature-study' ? <div className="grid gap-3">
            <label className="text-xs font-medium" htmlFor="feature-topic">Study topic</label>
            <select id="feature-topic" className="min-h-11 rounded-xl bg-neutral-100 px-3 text-sm" value={featureTopic} onChange={event => { setFeatureTopic(event.target.value as FeatureTopic); setFeatureAmount(1); setCustomComposition(null); setSeekMs(0) }}>{featureTopics.map(topic => <option key={topic} value={topic}>{featureTopicLabels[topic]}</option>)}</select>{['freckles', 'facial-hair'].includes(featureTopic) && !sourceImages.some(image => image.retouch?.feature === featureTopic) ? <p role="status" className="text-xs leading-5 text-neutral-500">Upload an edited copy below to show this change. The preview keeps the original unchanged until then.</p> : null}<label className="grid gap-2 text-xs" htmlFor="feature-amount">
            <span className="flex justify-between">
            <span>Edit amount</span>
            <span>{Math.round(featureAmount * 100)}%</span>
            </span>
            <input id="feature-amount" className="w-full accent-neutral-900" type="range" min={['freckles', 'facial-hair', 'symmetry'].includes(featureTopic) ? 0 : -100} max={100} step={5} value={featureAmount * 100} onChange={event => { setSeekMs(previewPositionRef.current); setFeatureAmount(Number(event.target.value) / 100); setCustomComposition(null) }} />
            <span className="text-neutral-500">{['freckles', 'facial-hair'].includes(featureTopic) ? 'Original → edited photograph' : featureTopic === 'symmetry' ? 'Original → aligned paired features' : 'Negative and positive values show opposite shape changes.'}</span>
            </label>
            <button type="button" className="justify-self-start rounded-full bg-neutral-900 px-4 py-3 text-xs text-white" onClick={() => { setMaster(createFeatureStudyDraft(selection!.name, featureTopic)); setClips(new Map()); setAudioCut(null); setCustomComposition(null); setSectionIds(undefined); setSeekMs(0) }}>Use a focused {featureTopicLabels[featureTopic].toLowerCase()} script</button>
            <label className="grid gap-2 text-xs font-medium">What does your edited portrait change?<select aria-label="Edited portrait operation" className="min-h-11 rounded-xl bg-neutral-100 px-3 text-sm" value={retouchOperation} onChange={event => setRetouchOperation(event.target.value as typeof retouchOperation)}><option value="add">Add the feature</option><option value="remove">Remove the feature</option><option value="replace">Replace or restyle it</option><option value="shorten">Shorten it</option><option value="lengthen">Lengthen it</option><option value="align">Align it</option></select></label>
            <label className="grid gap-2 text-xs font-medium">Edited portrait <span className="font-normal text-neutral-500">Optional: upload an edited copy of the same front photo for freckles, hair, ear swaps or other retouching. Keep pose, crop and lighting unchanged. Minimum Full HD.</span>
            <input className="text-xs file:mr-3 file:rounded-full file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-neutral-900" aria-label="Edited comparison portrait" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { void uploadFeatureEdit(event.target.files?.[0]); event.target.value = '' }} />
            </label>
            <p className="text-xs leading-5 text-neutral-500">Preview the visual treatment with your current script, or start a focused topic script. Starting a new script clears its previous voice recording.</p>
            </div> : null}

        </fieldset></> : null}
        {customComposition ? <fieldset id="custom-video-editor" hidden={!editing} disabled={busy} className="min-w-0"><legend className="sr-only">Clip editor</legend>
          <p className={styles.editingContext}>{selection?.name} · Based on {creatorVideoStyles.find(style => style.id === recipe)?.label}</p>
          <CustomVideoEditor composition={composition} prepared={prepared} images={renderImages} input={studioInput} reports={studioReports} playhead={playhead} onChange={setCustomComposition} onSeek={setSeekMs} />
        </fieldset> : null}
        <div className="grid gap-3 pb-8 pt-3">
          <button type="button" disabled={!prepared || busy || timingIssues.length > 0} onClick={() => void downloadVideo()} className={styles.download}>{progress !== null ? <Loader2 className="size-5 animate-spin" /> : <Download size={20} />}{progress !== null ? `Downloading ${Math.round(progress * 100)}%` : 'Download video'}</button>
          <p className="text-center text-[10px] leading-4 text-zinc-400">{videoSize.width} × {videoSize.height} · MP4 · {activeAudio ? 'Voiceover included' : 'Silent preview'}</p>
          {timingIssues.map(issue => <p key={issue} role="alert" className="text-xs leading-5 text-red-700">{issue}</p>)}
          {progress !== null ? <button type="button" className="text-xs text-zinc-500" onClick={() => abortRef.current?.abort()}>Cancel</button> : null}
        </div>
      </div>
    </div>
  </div>
}
