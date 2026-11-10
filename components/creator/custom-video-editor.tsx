import { portraitInstrumentSchema } from '@/lib/creator/portrait-instruments'
import type { ReportCategory } from '@/lib/creator/mobile-overlay-engine/report-data'
import { faceMetricAreas } from '@/lib/creator/face-metric-guides'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { customSlides, customSlideTemplates, customSlideId, customClipPreviewTime, customLibraryComposition, replaceCustomSlide, updatePortraitInstrument, moveCustomClip, slideCategories, portraitTreatments, portraitTreatment, type PortraitTreatment, type SlideCategory } from '@/lib/creator/custom-video'
import { prepareVideo, type PreparedVideo } from '@/lib/creator/video-renderer'
import type { VideoComposition, VideoScene } from '@/lib/creator/video-composition'
import type { AnalysisPostInput } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { VideoThumbnail } from './video-thumbnail'
import styles from './video-studio.module.css'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
function Clip({ scene, index, selected, zoom, onSelect, prepared }: { scene: VideoScene; index: number; selected: boolean; zoom: number; onSelect: () => void; prepared: PreparedVideo | null }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: scene.id, transition: { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' } })
  const label = customSlides.find(slide => slide.id === customSlideId(scene))!.label
  return <button type="button" ref={setNodeRef} {...attributes} {...listeners} className={styles.clip} data-selected={selected} data-dragging={isDragging} style={{ width: 80 * zoom, transform: `${CSS.Translate.toString(transform) ?? ''} ${isDragging ? 'scale(1.04)' : ''}`, transition: [transition, 'width 180ms cubic-bezier(.22,1,.36,1)'].filter(Boolean).join(', '), zIndex: isDragging ? 2 : undefined }} aria-label={`Segment ${index + 1}: ${scene.narration}. Drag to reorder`} aria-pressed={selected} title="Click to select · Drag anywhere to reorder · Space and arrow keys on keyboard" onClick={onSelect}>
    <span className={styles.clipFrame}><VideoThumbnail prepared={prepared} scene={scene} /></span>
    <span className={styles.clipDuration}>{String(index + 1).padStart(2, '0')} · {seconds(scene.durationMs)}</span><strong>{label}</strong>
  </button>
}
export function CustomVideoEditor({ composition, prepared, images, input, reports, playhead, onChange, onSeek }: { composition: VideoComposition; prepared: PreparedVideo | null; images: GeneratorImage[]; input: AnalysisPostInput; reports?: ReportCategory[]; playhead: number; onChange: (composition: VideoComposition) => void; onSeek: (time: number) => void }) {
  const segmentSummaryRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState(composition.scenes[0].id)
  const [optionStep, setOptionStep] = useState<{ sceneId: string; templateId: string; treatment: PortraitTreatment } | null>(null)
  const [guideArea, setGuideArea] = useState('')
  const [zoom, setZoom] = useState(1)
  const [category, setCategory] = useState<SlideCategory>('All layouts')
  const reduced = useReducedMotion()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const selected = composition.scenes.find(scene => scene.id === selectedId) ?? composition.scenes[0]
  const index = composition.scenes.indexOf(selected)
  const activeId = composition.scenes.find(scene => playhead >= scene.startMs && playhead < scene.startMs + scene.durationMs)?.id
  const selectedSlide = customSlideId(selected)
  const instrument = portraitInstrumentSchema.parse(selected.portraitFX?.instrument ?? {})
  const setInstrument = (patch: Parameters<typeof updatePortraitInstrument>[2]) => onChange(updatePortraitInstrument(composition, selected.id, patch, input, reports))
  const selectedOption = customSlides.find(slide => slide.id === selectedSlide)!
  const template = optionStep?.sceneId === selected.id ? customSlideTemplates.find(item => item.id === optionStep.templateId) : undefined
  const currentTemplate = customSlideTemplates.find(item => item.options.some(slide => slide.id === selectedSlide))!
  const faceGuideArea = guideArea || (faceMetricAreas.some(area => area.id === selected.source.categoryId) ? selected.source.categoryId : 'all')
  function chooseClip(scene: VideoScene) { setGuideArea(''); setOptionStep(null); setSelectedId(scene.id); onSeek(customClipPreviewTime(scene)) }
  const cards = useMemo(() => template
    ? template.options.filter(slide => template.id !== 'portrait' || portraitTreatment(slide) === optionStep?.treatment && (optionStep?.treatment !== 'Face guides' || faceGuideArea === 'all' || slide.categoryId === faceGuideArea || slide.id === 'portrait')).map(slide => ({ ...slide, key: `option:${slide.id}`, templateId: template.id, count: 0, optionNoun: template.optionNoun }))
    : customSlideTemplates.filter(item => category === 'All layouts' || item.category === category).map(item => ({ ...item.options.find(slide => slide.id === selectedSlide) ?? item.options[0], label: item.label, detail: item.detail, key: `template:${item.id}`, templateId: item.id, count: item.options.length, optionNoun: item.optionNoun })), [template, optionStep?.treatment, faceGuideArea, category, selectedSlide])
  const library = useMemo(() => customLibraryComposition(composition, selected.id, input, cards, reports), [composition, selected.id, input, cards, reports])
  const [previews, setPreviews] = useState<{ source: VideoComposition; video: PreparedVideo } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const libraryVideo = previews?.source === library ? previews.video : null
  useEffect(() => {
    let disposed = false
    setPreviewError('')
    void prepareVideo(library, images, 'selection').then(video => { if (!disposed) setPreviews({ source: library, video }) }).catch(reason => { if (!disposed) setPreviewError(reason instanceof Error ? reason.message : 'Could not prepare slide previews') })
    return () => { disposed = true }
  }, [library, images])
  return <div className={styles.customEditor}>
    <div className={styles.timelineHeading}><div><h3>1. Choose a clip</h3><p>Tap to edit. Drag a clip to reorder.</p></div><label>Zoom<input aria-label="Timeline zoom" type="range" min=".6" max="2" step=".1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (!over || active.id === over.id) return
      const next = moveCustomClip(composition, String(active.id), String(over.id))
      setOptionStep(null); setSelectedId(String(active.id)); onChange(next); onSeek(customClipPreviewTime(next.scenes.find(scene => scene.id === active.id)!))
    }}>
      <div className={styles.timelineScroll} aria-label="Video timeline"><SortableContext items={composition.scenes.map(scene => scene.id)} strategy={horizontalListSortingStrategy}><div className={styles.timelineClips}>{composition.scenes.map((scene, index) => <div key={scene.id} className={styles.clipWrap} data-playing={scene.id === activeId} style={{ '--clip-progress': `${Math.max(0, Math.min(1, (playhead - scene.startMs) / scene.durationMs)) * 100}%` } as CSSProperties}><span className={styles.clipTime}>{seconds(scene.startMs)}</span><Clip scene={scene} index={index} zoom={zoom} selected={scene.id === selected.id} prepared={prepared} onSelect={() => chooseClip(scene)} /></div>)}</div></SortableContext></div>
    </DndContext>
    <div ref={segmentSummaryRef} className={styles.segmentSummary} aria-live="polite"><div className={styles.clipNavigation}><span>Editing clip {index + 1} of {composition.scenes.length} · {seconds(selected.startMs)}–{seconds(selected.startMs + selected.durationMs)}</span><div><button type="button" aria-label="Previous clip" disabled={index === 0} onClick={() => chooseClip(composition.scenes[index - 1])}>←</button><button type="button" aria-label="Next clip" disabled={index === composition.scenes.length - 1} onClick={() => chooseClip(composition.scenes[index + 1])}>→</button></div></div><p>{selected.narration}</p><div className={styles.currentLayout}><span>{currentTemplate.label}</span>{!template && currentTemplate.options.length > 1 ? <button type="button" onClick={() => setOptionStep({ sceneId: selected.id, templateId: currentTemplate.id, treatment: portraitTreatment(selectedOption) })}>Adjust appearance →</button> : null}</div></div>
    <div className={styles.libraryHeading} data-options={Boolean(template)}>{template ? <button type="button" className={styles.libraryBack} onClick={() => { setOptionStep(null); segmentSummaryRef.current?.scrollIntoView({ block: 'start' }) }}>← Choose another layout</button> : null}<h3>{template ? `3. ${template.optionTitle}` : '2. Choose a layout'}</h3><p className={styles.libraryHint}>{template ? `${template.label} · Changes apply to this clip` : 'Choose what appears on screen for this clip.'}</p>
      {template?.id === 'portrait' ? <div className={styles.categoryFilters} role="group" aria-label="Portrait appearance">{portraitTreatments.map(item => <button key={item} type="button" aria-pressed={optionStep?.treatment === item} onClick={() => setOptionStep({ sceneId: selected.id, templateId: template.id, treatment: item })}>{item}</button>)}</div> : null}
    </div>
    {!template ? <div className={styles.categoryFilters} role="group" aria-label="Layout categories">{slideCategories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}<span className={styles.filterCount}>{' '}{customSlideTemplates.filter(layout => item === 'All layouts' || layout.category === item).length}</span></button>)}</div> : optionStep?.treatment === 'Filters' && template.id === 'portrait' ? <p className={styles.libraryHint}>Effects are amplified in these tiles. The video uses a subtler filter.</p> : null}
    {template?.id === 'portrait' && optionStep?.treatment === 'Particles & tracking' ? <div className={styles.instrumentLayers}>
      <p className={styles.libraryHint}>Each layer works on its own. Combine any of them on this clip.</p>
      <div className={styles.categoryFilters} role="group" aria-label="Independent overlay layers">
        <button type="button" aria-pressed={instrument.trackers !== 'none'} onClick={() => setInstrument({ trackers: instrument.trackers === 'none' ? 'sparse' : 'none' })}>Tracks</button>
        {(['links', 'scan', 'trails', 'marks'] as const).map(key => <button key={key} type="button" aria-pressed={instrument[key]} onClick={() => setInstrument({ [key]: !instrument[key] })}>{key[0].toUpperCase() + key.slice(1)}</button>)}
      </div>
      <div className={styles.categoryFilters} role="group" aria-label="Image particle motion">{(['none','gather','drift','swarm'] as const).map(mode => <button key={mode} type="button" aria-pressed={instrument.particles === mode} onClick={() => setInstrument({particles:mode})}>{({none:'Photo',gather:'Gather',drift:'Drift',swarm:'Bloom'})[mode]}</button>)}</div>
      {instrument.trackers !== 'none' ? <div className={styles.categoryFilters} role="group" aria-label="Tracker density">{(['sparse','dense'] as const).map(density => <button key={density} type="button" aria-pressed={instrument.trackers === density} onClick={() => setInstrument({trackers:density})}>{density === 'sparse' ? 'Sparse tracks' : 'Dense tracks'}</button>)}</div> : null}
    </div> : null}
    {template?.id === 'portrait' && optionStep?.treatment === 'Face guides' ? <label className={styles.guideArea}>Face area<select aria-label="Face guide area" value={faceGuideArea} onChange={event => setGuideArea(event.target.value)}><option value="all">All areas</option>{faceMetricAreas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}</select></label> : null}
    {!libraryVideo && !previewError ? <p role="status" className={styles.libraryHint}>Preparing slide previews…</p> : null}
    {previewError ? <p role="alert" className={styles.libraryHint}>{previewError}</p> : null}
    <motion.div layout className={styles.slideLibrary} role="group" aria-label={template ? template.optionTitle : "Slide layouts"}><AnimatePresence mode="popLayout" initial={false}>{cards.map(slide => <motion.button layout key={slide.key} type="button" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={{ duration: reduced ? 0 : .22, ease: [.22, 1, .36, 1] }} className={styles.slideCard} aria-pressed={template ? slide.metricId ? selected.focus === `metric:${slide.metricId}` : slide.kind === 'print' ? selected.portraitFX?.print === slide.preset : selectedSlide === slide.id : customSlideTemplates.find(item => item.id === slide.templateId)!.options.some(option => option.id === selectedSlide)} onClick={() => { if (!template && slide.count > 1) setOptionStep({ sceneId: selected.id, templateId: slide.templateId, treatment: portraitTreatment(slide) }); onChange(replaceCustomSlide(composition, selected.id, slide.id, input, reports)); onSeek(customClipPreviewTime(selected)) }}><span className={styles.slidePreview}><VideoThumbnail prepared={libraryVideo} scene={library.scenes.find(scene => scene.id === slide.id)!} /></span><strong>{slide.label}{slide.count > 1 ? <small className={styles.optionCount}>{slide.count} {slide.optionNoun} →</small> : null}</strong><span>{slide.detail}</span></motion.button>)}</AnimatePresence></motion.div>
  </div>
}
