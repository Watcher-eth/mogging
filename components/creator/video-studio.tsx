import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy, Download, Film, Layers3, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from './creator-shell'
import { VideoCompositionPlayer } from './video-composition-player'
import { activeScene, allowedPrimitives, arrangeVideoScenes, compileAnalysisVideo, createMotionTrack, parseComposition, retimeVideoScene, videoStyles, type MotionTrack, type TrackTarget, type VideoScene, type VideoStyleId } from '@/lib/creator/video-composition'
import { motionPrimitives, primitiveDefinition, type MotionPrimitiveCategory, type MotionPrimitiveId } from '@/lib/creator/motion-primitives'
import { drawVideoFrame, exportCompositionMp4, prepareVideo, type PreparedVideo } from '@/lib/creator/video-renderer'
import { downloadBlob } from '@/lib/creator/export-slides'
import { packVideoProject, unpackVideoProject } from '@/lib/creator/video-project'
import { reportCategories } from '@/lib/creator/mock-report-data'
import type { AnalysisPostInput, AnalysisPostPlan } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { cn } from '@/lib/utils'
import { scriptToPlan } from '@/lib/creator/script-edit'

type Props = { input: AnalysisPostInput; plan: AnalysisPostPlan; images: GeneratorImage[]; onBack: () => void }
const categoryTarget: Record<MotionPrimitiveCategory, TrackTarget> = { transition: 'content', camera: 'camera', entry: 'content', exit: 'content', text: 'text', cursor: 'decoration', cinematic: 'decoration', overlay: 'overlay', report: 'report' }

export default function VideoStudio({ input, plan, images, onBack }: Props) {
  const [editPlan, setEditPlan] = useState(plan)
  const [script, setScript] = useState(() => plan.scenes.map(scene => scene.narration).join('\n\n'))
  const [readingPace, setReadingPace] = useState(165)
  const [composition, setComposition] = useState(() => compileAnalysisVideo(plan, input, images.map(image => image.id), 'brand', reportCategories))
  const [selectedId, setSelectedId] = useState(composition.scenes[0].id)
  const [prepared, setPrepared] = useState<PreparedVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seekMs, setSeekMs] = useState(0)
  const [timeMs, setTimeMs] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [screens, setScreens] = useState<GeneratorImage[]>([])
  const [panel, setPanel] = useState<'scene' | 'library' | 'json'>('scene')
  const [json, setJson] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const screenInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef(new Set<string>())
  const allImages = useMemo(() => [...images.filter(image => !screens.some(screen => screen.id === image.id)), ...screens], [images, screens])
  const scene = composition.scenes.find(item => item.id === selectedId) ?? composition.scenes[0]
  const nowScene = activeScene(composition, timeMs)
  const regions = prepared?.scenes.get(scene.id)?.regions ?? []
  const exporting = progress !== null
  const catalog = motionPrimitives.filter(item => item.id !== 'layout-scale' && (category === 'all' || category === item.category) && `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    let disposed = false
    setPrepared(null); setError(null)
    void prepareVideo(composition, allImages).then(value => { if (!disposed) setPrepared(value) }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not prepare the video') })
    return () => { disposed = true }
  }, [composition, allImages])
  useEffect(() => {
    const urls = urlsRef.current
    return () => { abortRef.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [])

  function editScene(patch: Partial<VideoScene>) {
    setComposition(current => parseComposition({ ...current, scenes: current.scenes.map(item => item.id === scene.id ? { ...item, ...patch } : item) }))
  }
  function editTrack(id: string, patch: Partial<MotionTrack>) {
    editScene({ tracks: scene.tracks.map(track => track.id === id ? { ...track, ...patch } : track) })
  }
  function changeSceneSource(kind: VideoScene['source']['kind']) {
    const tracks = kind === 'component' && !scene.tracks.some(track => track.primitive === 'component-focus') ? [...scene.tracks, { ...createMotionTrack('component-focus', 'report', scene.durationMs), section: scene.focus, durationMs: Math.min(900, scene.durationMs * .5) }] : scene.tracks
    editScene({ source: { ...scene.source, kind, overlay: ['portrait', 'component', 'title'].includes(kind) ? 'category' : 'none' }, tracks })
  }
  function addPrimitive(id: MotionPrimitiveId) {
    if (scene.tracks.length >= 30) return toast.error('Use up to 30 tracks per scene')
    const definition = primitiveDefinition(id)
    const target = id === 'line-draw' ? 'overlay' : categoryTarget[definition.category]
    const track = { ...createMotionTrack(id, target, scene.durationMs), id: crypto.randomUUID(), ...(target === 'report' ? { section: scene.focus, durationMs: id === 'scroll-to-section' ? Math.min(900, scene.durationMs * .4) : scene.durationMs } : {}) }
    const previousTracks = definition.category === 'transition' ? scene.tracks.filter(item => !(item.target === 'content' && primitiveDefinition(item.primitive).category === 'transition')) : scene.tracks
    const geometry = ['line-draw', 'landmark-stagger', 'contour-trace'].includes(id)
    const emphasis = target === 'report' && id !== 'scroll-to-section'
    editScene({ tracks: [...previousTracks, track], ...(geometry || id === 'report-scroll' || target === 'report' ? { source: { ...scene.source, ...(id === 'report-scroll' || target === 'report' ? { kind: emphasis ? 'component' as const : 'report' as const } : {}), ...(geometry || emphasis ? { overlay: id === 'landmark-stagger' ? 'face-map' as const : 'category' as const } : {}) } } : {}) })
    setSeekMs(scene.startMs); setTimeMs(scene.startMs)
    toast.success(`${definition.label} added to ${scene.label}`)
  }
  function selectScene(id: string) {
    const next = composition.scenes.find(item => item.id === id)!
    setSelectedId(id); setSeekMs(next.startMs); setTimeMs(next.startMs)
  }
  function setStyle(style: VideoStyleId) {
    const next = compileAnalysisVideo(editPlan, input, images.map(image => image.id), style, reportCategories)
    setComposition(next); setSelectedId(next.scenes[0].id); setSeekMs(0); setTimeMs(0)
  }
  function recutScript() {
    try {
      const nextPlan = scriptToPlan(script, readingPace)
      const next = compileAnalysisVideo(nextPlan, input, images.map(image => image.id), composition.style, reportCategories)
      setEditPlan(nextPlan); setComposition(next); setSelectedId(next.scenes[0].id); setSeekMs(0); setTimeMs(0)
      toast.success(`Recut into ${next.scenes.length} app-led shots · ${(next.durationMs / 1000).toFixed(1)}s`)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not recut script') }
  }
  function arrange(scenes: VideoScene[], focusId: string) {
    try {
      const next = arrangeVideoScenes(composition, scenes)
      const focus = next.scenes.find(item => item.id === focusId) ?? next.scenes[0]
      setComposition(next); setSelectedId(focus.id); setSeekMs(focus.startMs); setTimeMs(focus.startMs)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message.slice(0, 160) : 'Could not update timeline') }
  }
  function moveScene(direction: -1 | 1) {
    const index = composition.scenes.indexOf(scene), nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= composition.scenes.length) return
    const scenes = [...composition.scenes]; [scenes[index], scenes[nextIndex]] = [scenes[nextIndex], scenes[index]]
    arrange(scenes, scene.id)
  }
  function importJson(value: string) {
    try {
      const next = parseComposition(JSON.parse(value))
      setComposition(next); setSelectedId(next.scenes[0].id); setSeekMs(0); setTimeMs(0)
      toast.success('Composition loaded')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message.slice(0, 220) : 'Invalid composition JSON') }
  }
  async function addScreen(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) return toast.error('Choose a PNG, JPG or WebP under 20 MB')
    const url = URL.createObjectURL(file); urlsRef.current.add(url)
    const image = new Image()
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not read app screen')); image.src = url })
      const id = crypto.randomUUID()
      setScreens(current => [...current, { id, name: file.name, dataUrl: url, width: image.width, height: image.height, status: 'ready', landmarks: null }])
      editScene({ source: { ...scene.source, kind: 'screen', imageId: id, overlay: 'none' } })
      toast.success('App screen added to this scene')
    } catch (reason) { URL.revokeObjectURL(url); urlsRef.current.delete(url); toast.error(reason instanceof Error ? reason.message : 'Could not load screen') }
  }
  async function exportMp4() {
    if (!prepared || exporting) return
    const controller = new AbortController(); abortRef.current = controller; setProgress(0)
    try {
      const blob = await exportCompositionMp4(prepared, setProgress, controller.signal)
      downloadBlob(blob, 'mogging-analysis-video.mp4'); toast.success('Visual video exported')
    } catch (reason) { if (!controller.signal.aborted) toast.error(reason instanceof Error ? reason.message : 'Could not export video') }
    finally { if (abortRef.current === controller) { abortRef.current = null; setProgress(null) } }
  }
  async function exportFrame() {
    if (!prepared) return
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920
    drawVideoFrame(canvas.getContext('2d')!, prepared, timeMs, 1080, 1920)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (blob) downloadBlob(blob, `mogging-frame-${Math.round(timeMs)}.png`)
  }
  async function exportBundle() {
    try {
      downloadBlob(await packVideoProject(composition, allImages), 'mogging-video-project.zip')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not package project') }
  }
  async function importBundle(file: File | undefined) {
    if (!file) return
    try {
      const project = await unpackVideoProject(file)
      project.objectUrls.forEach(url => urlsRef.current.add(url))
      setScreens(project.images); setComposition(project.composition); setSelectedId(project.composition.scenes[0].id); setSeekMs(0); setTimeMs(0)
      toast.success('Video project and face geometry restored')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message.slice(0, 220) : 'Could not import project') }
  }

  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="outline" className="rounded-full" disabled={exporting} onClick={onBack}><ArrowLeft className="size-4" />Post plan</Button><div><h2 className="text-xl font-semibold tracking-tight">Visual engine</h2><p className="text-xs text-zinc-500">{motionPrimitives.length} primitives · real face geometry · 1080 × 1920 · 30 fps</p></div></div><div className="flex flex-wrap gap-2"><input ref={projectInputRef} className="sr-only" type="file" accept="application/zip,.zip" onChange={event => { void importBundle(event.target.files?.[0]); event.target.value = '' }} /><Button variant="outline" disabled={exporting} onClick={() => projectInputRef.current?.click()}><Upload className="size-4" />Open project</Button><Button variant="outline" disabled={exporting} onClick={() => void exportBundle()}><Download className="size-4" />Project ZIP</Button><Button disabled={!prepared || exporting} onClick={() => void exportMp4()}>{exporting ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}{exporting ? `Exporting ${Math.round(progress * 100)}%` : 'Export MP4'}</Button>{exporting ? <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel export</Button> : null}</div></div>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,.95fr)_minmax(0,1.05fr)]">
      <section className="grid gap-4 rounded-[28px] border border-zinc-200 bg-[#eef2f5] p-4 text-zinc-900 sm:p-5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-zinc-600">{nowScene.label}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-sky-700">{videoStyles[composition.style].label}</span></div>
        {error ? <p role="alert" className="rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}</p> : null}
        {!prepared && !error ? <p role="status" className="flex items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="size-3 animate-spin" />Preparing report and face layers…</p> : null}
        <VideoCompositionPlayer prepared={prepared} composition={composition} seekMs={seekMs} onTime={setTimeMs} />
        <div className="flex justify-between gap-2"><p className="text-[10px] leading-4 text-zinc-500">Visual track only. Voice is added in the audio stage.</p><button type="button" disabled={!prepared || exporting} onClick={() => void exportFrame()} className="shrink-0 text-xs font-semibold text-sky-700 active:scale-[.98]">Save frame</button></div>
      </section>

      <section className="grid min-w-0 gap-4">
        <fieldset disabled={exporting} className="creator-surface grid gap-4 p-4 sm:p-5"><legend className="sr-only">Composition settings</legend>
          <Field label="Narration script" hint="Every recut follows these words"><textarea aria-label="Narration script" className={`${fieldClass} min-h-36 py-3 text-sm leading-6`} maxLength={12000} value={script} onChange={event => setScript(event.target.value)} /></Field>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3"><Field label="Reading pace"><select className={fieldClass} value={readingPace} onChange={event => setReadingPace(Number(event.target.value))}><option value={145}>Measured · 145 words/min</option><option value={165}>Natural · 165 words/min</option><option value={190}>Fast · 190 words/min</option></select></Field><Button className="h-11 rounded-full" onClick={recutScript}>Recut from script</Button></div>
          <Field label="Style recipe" hint="Rebuilds the timeline"><select className={fieldClass} value={composition.style} onChange={event => setStyle(event.target.value as VideoStyleId)}>{Object.entries(videoStyles).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select></Field>
          <p className="text-xs leading-5 text-zinc-500">{videoStyles[composition.style].description} Script cues select the app category, scroll destination and card to emphasize.</p>
          <div className="grid grid-cols-3 gap-2 border-t pt-4">{(['scene', 'library', 'json'] as const).map(tab => <button key={tab} type="button" aria-pressed={panel === tab} onClick={() => { setPanel(tab); if (tab === 'json') setJson(JSON.stringify(composition, null, 2)) }} className={cn('min-h-11 rounded-xl px-2 text-xs font-semibold capitalize active:scale-[.98]', panel === tab ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500')}>{tab === 'library' ? `${motionPrimitives.length} primitives` : tab === 'json' ? 'Composition JSON' : 'Scene editor'}</button>)}</div>
        </fieldset>

        <fieldset disabled={exporting} className="creator-surface min-w-0 p-4 sm:p-5"><legend className="sr-only">Timeline and scene controls</legend>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Timeline</h3><span className="text-xs text-zinc-400">{composition.scenes.length} scenes · {composition.durationMs / 1000}s</span></div>
          <div className="mb-4 flex h-8 overflow-hidden rounded-lg bg-zinc-100" aria-label="Scene timeline">{composition.scenes.map(item => <button key={item.id} type="button" style={{ flex: item.durationMs }} aria-label={`Seek to ${item.label}`} onClick={() => selectScene(item.id)} className={cn('min-w-[3px] border-r border-white/30 transition-colors', item.id === scene.id ? 'bg-[#00a8ef]' : item.id === nowScene.id ? 'bg-cyan-300' : 'bg-zinc-300 hover:bg-zinc-400')} />)}</div>
          <Field label="Selected scene"><select className={fieldClass} value={scene.id} onChange={event => selectScene(event.target.value)}>{composition.scenes.map(item => <option key={item.id} value={item.id}>{(item.startMs / 1000).toFixed(1)}s · {item.label}</option>)}</select></Field>

          {panel === 'scene' ? <div className="mt-4 grid gap-4">
            <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-900"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide">Script cue</span>{scene.narration || 'Add narration or recut the full script to generate app actions.'}</p>
            <div className="flex flex-wrap items-end gap-2"><div className="w-32"><Field label="Scene length (s)"><input className={fieldClass} type="number" min={.1} max={60} step={.1} value={scene.durationMs / 1000} onChange={event => { const duration = Math.max(100, Math.min(60000, Number(event.target.value) * 1000)); arrange(composition.scenes.map(item => item.id === scene.id ? retimeVideoScene(item, duration) : item), scene.id) }} /></Field></div><Button variant="outline" size="icon" aria-label="Move scene earlier" disabled={composition.scenes[0].id === scene.id} onClick={() => moveScene(-1)}><ArrowLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Move scene later" disabled={composition.scenes.at(-1)?.id === scene.id} onClick={() => moveScene(1)}><ArrowRight className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Duplicate scene" onClick={() => { const id = crypto.randomUUID(); const next = composition.scenes.flatMap(item => item.id === scene.id ? [item, { ...item, id, label: `${item.label} copy` }] : [item]); arrange(next, id) }}><Copy className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Remove scene" disabled={composition.scenes.length <= 1} onClick={() => arrange(composition.scenes.filter(item => item.id !== scene.id), composition.scenes[0].id)}><Trash2 className="size-4" /></Button></div>
            <Field label="On-screen headline"><textarea className={`${fieldClass} min-h-20 py-3`} maxLength={240} value={scene.text} onChange={event => editScene({ text: event.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Scene source"><select className={fieldClass} value={scene.source.kind} onChange={event => changeSceneSource(event.target.value as VideoScene['source']['kind'])}><option value="portrait">Cutout portrait + overlays</option><option value="report">Editable mobile report</option><option value="component" disabled={scene.id === composition.scenes[0].id}>Centered app component</option><option value="title" disabled={scene.id === composition.scenes[0].id}>Brand title card</option><option value="screen">Captured app screen</option></select></Field><Field label="Photo / app screen"><select className={fieldClass} value={scene.source.imageId ?? ''} onChange={event => editScene({ source: { ...scene.source, imageId: event.target.value || null } })}><option value="">No image</option>{allImages.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}</select></Field></div>
            {scene.tracks.some(track => track.primitive === 'split-screen') ? <Field label="Comparison photo"><select className={fieldClass} value={scene.source.secondaryImageId ?? ''} onChange={event => editScene({ source: { ...scene.source, secondaryImageId: event.target.value || null } })}><option value="">Use primary photo</option>{allImages.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}</select></Field> : null}
            <div className="grid grid-cols-2 gap-3"><Field label="Report / overlay category"><select className={fieldClass} value={scene.source.categoryId} onChange={event => { const focus = scene.focus.startsWith('feature:') ? 'features' : scene.focus; editScene({ source: { ...scene.source, categoryId: event.target.value, report: reportCategories.find(item => item.id === event.target.value) }, focus, tracks: scene.tracks.map(track => track.target === 'report' && track.section?.startsWith('feature:') ? { ...track, section: 'features' } : track) }) }}>{reportCategories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field label="Overlay"><select className={fieldClass} value={scene.source.overlay} onChange={event => editScene({ source: { ...scene.source, overlay: event.target.value as VideoScene['source']['overlay'] } })}><option value="none">None</option><option value="category">Real category geometry</option><option value="face-map">Full face map</option></select></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="App section to emphasize"><select className={fieldClass} value={scene.focus} onChange={event => editScene({ focus: event.target.value, tracks: scene.tracks.map(track => track.target === 'report' ? { ...track, section: event.target.value } : track) })}>{regions.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}</select></Field><Field label="Canvas layout"><div className={`${fieldClass} flex items-center text-xs`}>{['report', 'screen'].includes(scene.source.kind) ? 'Full app · 1080 × 1920' : 'Face + native metric · 1080 × 1920'}</div></Field></div>
            <p className="text-[11px] leading-5 text-zinc-500">Reports always fill the canvas at their native proportions. Feature stages pair a large portrait and white geometry with the selected native metric. Card entrances, meter builds and whole-scene transitions stay independently editable.</p>
            {scene.source.kind === 'screen' ? <div className="grid grid-cols-2 gap-3">{(['top', 'bottom'] as const).map(edge => <Field key={edge} label={`Remove ${edge} system UI (%)`}><input className={fieldClass} type="number" min={0} max={20} step={.5} value={Math.round((scene.source.captureInsets?.[edge] ?? (edge === 'top' ? .06 : .03)) * 1000) / 10} onChange={event => editScene({ source: { ...scene.source, captureInsets: { ...(scene.source.captureInsets ?? { top: .06, bottom: .03 }), [edge]: Math.max(0, Math.min(.2, Number(event.target.value) / 100)) } } })} /></Field>)}</div> : null}
            <div className="grid grid-cols-3 gap-2">{(['currentScore', 'potentialScore', 'metricScore'] as const).map((key, index) => <Field key={key} label={['Overall', 'Potential', 'Feature score'][index]}><input className={fieldClass} type="number" min={0} max={10} step={.1} value={scene.source[key]} onChange={event => editScene({ source: { ...scene.source, [key]: Math.max(0, Math.min(10, Number(event.target.value))) } })} /></Field>)}</div>
            {scene.source.report ? <details className="rounded-2xl border border-zinc-200 p-3"><summary className="min-h-8 cursor-pointer text-xs font-semibold">Edit the app’s report content</summary><div className="mt-3 grid max-h-96 gap-3 overflow-y-auto">{scene.source.report.features.map((feature, index) => <Field key={feature.id ?? index} label={feature.label}><input className={fieldClass} maxLength={300} value={feature.value} onChange={event => { const report = scene.source.report!; editScene({ source: { ...scene.source, report: { ...report, features: report.features.map((item, i) => i === index ? { ...item, value: event.target.value } : item) } } }) }} /></Field>)}<Field label="Action plan"><textarea className={`${fieldClass} min-h-24 py-3`} maxLength={2500} value={scene.source.report.recommendation} onChange={event => editScene({ source: { ...scene.source, report: { ...scene.source.report!, recommendation: event.target.value } } })} /></Field></div></details> : null}
            <input ref={screenInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { void addScreen(event.target.files?.[0]); event.target.value = '' }} />
            <Button variant="outline" className="justify-self-start rounded-full" onClick={() => screenInputRef.current?.click()}><Upload className="size-4" />Add real app screenshot</Button>
            <div className="flex items-center justify-between border-t pt-4"><h3 className="text-sm font-semibold">Animation tracks</h3><Button variant="ghost" size="sm" onClick={() => setPanel('library')}><Plus className="size-3" />Add primitive</Button></div>
            {scene.tracks.map(track => <TrackEditor key={track.id} track={track} regions={regions} durationMs={scene.durationMs} onChange={patch => editTrack(track.id, patch)} onRemove={() => editScene({ tracks: scene.tracks.filter(item => item.id !== track.id) })} />)}
          </div> : panel === 'library' ? <div className="mt-4 grid gap-3">
            <Field label="Find a primitive"><input className={fieldClass} placeholder="Try zoom, scan, cursor, type…" value={search} onChange={event => setSearch(event.target.value)} /></Field>
            <Field label="Primitive category"><select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{['report', 'transition', 'camera', 'entry', 'exit', 'text', 'cursor', 'cinematic', 'overlay'].map(item => <option key={item} value={item}>{item}</option>)}</select></Field>
            <div className="grid max-h-[660px] gap-2 overflow-y-auto sm:grid-cols-2">{catalog.map(item => <button key={item.id} type="button" onClick={() => addPrimitive(item.id as MotionPrimitiveId)} className="rounded-2xl border border-zinc-200 p-3 text-left transition-[background-color,transform] duration-150 hover:bg-zinc-50 active:scale-[.98]"><span className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.label}</span><Plus className="size-3 text-[#00a8ef]" /></span><span className="mt-1 block text-[10px] uppercase tracking-wide text-[#00a8ef]">{item.category} · {item.durationMs}ms</span><span className="mt-2 block text-[11px] leading-4 text-zinc-500">{item.description}</span></button>)}</div>
          </div> : <div className="mt-4 grid gap-3"><p className="text-xs leading-5 text-zinc-500">The composition is a portable, validated timeline. Project ZIP includes source images and landmark metadata; JSON keeps asset IDs so you can swap subjects without rewriting motion.</p><textarea aria-label="Composition JSON" spellCheck={false} className={`${fieldClass} min-h-[440px] py-3 font-mono text-[11px]`} value={json} onChange={event => setJson(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={() => importJson(json)}>Apply JSON</Button><Button variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify(composition, null, 2)], { type: 'application/json' }), 'mogging-composition.json')}><Download className="size-4" />JSON</Button><Button variant="outline" onClick={() => jsonInputRef.current?.click()}><Upload className="size-4" />Import JSON</Button></div><input ref={jsonInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file && file.size < 2 * 1024 * 1024) void file.text().then(importJson).catch(() => toast.error('Could not read JSON')); event.target.value = '' }} /></div>}
        </fieldset>
      </section>
    </div>
    <div className="creator-surface flex items-start gap-3 p-4 text-xs leading-5 text-zinc-500"><Layers3 className="mt-1 size-4 shrink-0 text-[#00a8ef]" /><p>App sections, camera, cuts, typography, face geometry and gestures stay independently editable. Section highlights and expansions use the report’s own layout. Preview, frame capture and MP4 export evaluate the same timeline.</p></div>
  </div>
}

function TrackEditor({ track, regions, durationMs, onChange, onRemove }: { track: MotionTrack; regions: Array<{ id: string; label: string }>; durationMs: number; onChange: (patch: Partial<MotionTrack>) => void; onRemove: () => void }) {
  return <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
    <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#00a8ef]">{track.target}</span><button type="button" aria-label={`Remove ${primitiveDefinition(track.primitive).label}`} onClick={onRemove} className="grid size-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 active:scale-[.98]"><Trash2 className="size-3.5" /></button></div>
    <Field label="Primitive"><select className={fieldClass} value={track.primitive} onChange={event => onChange({ primitive: event.target.value as MotionPrimitiveId })}>{allowedPrimitives(track.target).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    {track.target === 'report' ? <Field label="Target app section"><select className={fieldClass} value={track.section ?? 'scores'} onChange={event => onChange({ section: event.target.value })}>{regions.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}</select></Field> : null}
    <div className="grid grid-cols-3 gap-2"><Field label="Start (ms)"><input className={fieldClass} type="number" step={10} min={0} max={durationMs - 1} value={track.startMs} onChange={event => { const startMs = Math.max(0, Math.min(durationMs - 1, Number(event.target.value))); onChange({ startMs, durationMs: Math.min(track.durationMs, durationMs - startMs) }) }} /></Field><Field label="Length (ms)"><input className={fieldClass} type="number" step={10} min={1} max={durationMs - track.startMs} value={track.durationMs} onChange={event => onChange({ durationMs: Math.max(1, Math.min(durationMs - track.startMs, Number(event.target.value))) })} /></Field><Field label="Intensity"><input className={fieldClass} type="number" min={0} max={3} step={.1} value={track.intensity} onChange={event => onChange({ intensity: Math.max(0, Math.min(3, Number(event.target.value))) })} /></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Anchor X"><input className="w-full accent-cyan-600" type="range" min={0} max={1} step={.01} value={track.anchor.x} onChange={event => onChange({ anchor: { ...track.anchor, x: Number(event.target.value) } })} /></Field><Field label="Anchor Y"><input className="w-full accent-cyan-600" type="range" min={0} max={1} step={.01} value={track.anchor.y} onChange={event => onChange({ anchor: { ...track.anchor, y: Number(event.target.value) } })} /></Field></div>
  </div>
}
