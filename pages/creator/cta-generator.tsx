import { CreatorStepper } from '@/components/creator/creator-stepper'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, CheckCircle2, Download, FileArchive, Film, ImagePlus, Loader2, RefreshCw, Send, Trash2, UploadCloud, type LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ContentSlidePreview } from '@/components/creator/content-slide'
import { ContentRequirementsNote } from '@/components/creator/content-guidelines'
import { CreatorHeader, CreatorShell, Field, areaClass, fieldClass } from '@/components/creator/creator-shell'
import { detectFaceLandmarksFromDataUrl } from '@/lib/client/faceLandmarks'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { buildZip, downloadBlob, renderSlideMp4, renderSlidePng } from '@/lib/creator/export-slides'
import type { CreatorCtaLibraryItem } from '@/lib/creator/cta-library'
import { categoryOptions, generateSlides, outputFormats, templateOptions, type ContentSlide, type GeneratorImage, type OutputFormatId, type SavedCampaign, type Tone } from '@/lib/creator/content-generator'
import { cn } from '@/lib/utils'
import { CreatorIcon, type CreatorIconName } from '@/components/creator/creator-icon'

const STORAGE_KEY = 'mogging:creator-content:v2'
const approvedExamples = [
  { id: 'approved-report', label: 'Feature breakdown', detail: 'Hook → mapped feature → CTA', category: 'Report series', status: 'Approved format' },
  { id: 'approved-scan', label: 'Scan reveal', detail: 'Upload → local scan → report reveal', category: 'Reveal series', status: 'Approved format' },
  { id: 'approved-progress', label: 'Progression story', detail: 'Frame one → frame two → link in bio', category: 'Progress series', status: 'Approved format' },
]
type CtaLibraryResponse = { approved: CreatorCtaLibraryItem[]; mine: CreatorCtaLibraryItem[] }

export default function CtaGeneratorPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<GeneratorImage[]>([])
  const [formatId, setFormatId] = useState<OutputFormatId>('vertical')
  const [tone, setTone] = useState<Tone>('curious')
  const [offer, setOffer] = useState('Mogging')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['eyes', 'jaw', 'symmetry', 'overall'])
  const [featuredCategory, setFeaturedCategory] = useState('eyes')
  const [overlayStyle, setOverlayStyle] = useState<'category' | 'face-map'>('category')
  const [currentScore, setCurrentScore] = useState('')
  const [potentialScore, setPotentialScore] = useState('')
  const [categoryScoreValues, setCategoryScoreValues] = useState<Record<string, string>>({})
  const [slides, setSlides] = useState<ContentSlide[]>([])
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null)
  const [seed, setSeed] = useState(0)
  const [savedCampaigns, setSavedCampaigns] = useState<SavedCampaign[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportedVideo, setExportedVideo] = useState<{ file: File; url: string; width: number; height: number } | null>(null)
  useEffect(() => () => { if (exportedVideo) URL.revokeObjectURL(exportedVideo.url) }, [exportedVideo])
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const [libraryTitle, setLibraryTitle] = useState('')
  const [libraryAssetType, setLibraryAssetType] = useState<'video/mp4' | 'image/png'>('video/mp4')
  const [librarySubmitting, setLibrarySubmitting] = useState(false)
  const [libraryProgress, setLibraryProgress] = useState<number | null>(null)
  const [submittedSlides, setSubmittedSlides] = useState<Record<string, string>>({})
  const { data: library, mutate: mutateLibrary } = useSWR<CtaLibraryResponse>('/api/creator/cta-library', apiGet)
  const format = outputFormats[formatId]
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? slides[0]
  const usableImages = images.filter((image) => image.status === 'ready')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedCampaign[]
      if (Array.isArray(saved)) setSavedCampaigns(saved.slice(0, 12))
    } catch { /* Ignore invalid legacy storage. */ }
  }, [])

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const accepted = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    if (!accepted.length) return toast.error('Choose a JPG, PNG, or WebP image')
    for (const file of accepted) {
      try {
        const dataUrl = await readFile(file)
        const dimensions = await readDimensions(dataUrl)
        const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`
        setImages((current) => [...current, { id, name: file.name, dataUrl, ...dimensions, landmarks: null, status: 'detecting' }])
        void detectImage(id, dataUrl, dimensions)
      } catch { toast.error(`Could not read ${file.name}. Try a JPG, PNG, or WebP image.`) }
    }
  }

  async function detectImage(id: string, dataUrl: string, dimensions: { width: number; height: number }) {
    setImages((current) => current.map((image) => image.id === id ? { ...image, status: 'detecting', landmarks: null, warning: undefined } : image))
    const result = await detectFaceLandmarksFromDataUrl(dataUrl)
    setImages((current) => current.map((image) => {
      if (image.id !== id) return image
      if (result.status !== 'detected') return { ...image, landmarks: null, status: result.status === 'no-face' ? 'no-face' : 'warning', warning: result.message }
      const landmarks = result.landmarks
      const score = Math.min(landmarks.confidence, landmarks.quality?.score ?? landmarks.confidence)
      if (score < 0.58 || Object.values(landmarks.anchors).filter(Boolean).length < 20 || (landmarks.quality?.contourPointCount ?? 0) < 90) return { ...image, landmarks: { ...landmarks, image: dimensions }, status: 'warning', warning: 'The face map is incomplete or unstable. Use a clearer, front-facing photo with the forehead and chin visible.' }
      const warnings = landmarks.quality?.warnings ?? []
      return { ...image, landmarks: { ...landmarks, image: dimensions }, status: 'ready', warning: warnings.length ? formatWarnings(warnings) : undefined }
    }))
  }

  function createCampaign() {
    if (!usableImages.length) return toast.error(images.some((image) => image.status === 'detecting') ? 'Landmark detection is still running' : 'Upload a clear image with a usable face first')
    if (!selectedCategories.length) return toast.error('Select at least one report value')
    if (!currentScore || !potentialScore) return toast.error('Enter current and potential scores before generating')
    const missingCategory = selectedCategories.find((categoryId) => !categoryScoreValues[categoryId])
    if (missingCategory) return toast.error(`Enter a score for ${categoryOptions.find((item) => item.id === missingCategory)?.label ?? missingCategory}`)
    const nextSeed = seed + 1
    const generated = generateSlides({ campaignGoal: 'traffic', tone, selectedCategories, images, offer, seed: nextSeed, primaryCategory: featuredCategory, currentScore, potentialScore, scoreValues: categoryScoreValues }).map((slide) => ({ ...slide, overlayStyle }))
    setSeed(nextSeed)
    setSlides(generated)
    setSelectedSlideId(generated[0]?.id ?? null)
    setSubmittedSlides({})
    setStep(3)
    const campaign: SavedCampaign = { id: `campaign-${Date.now()}`, createdAt: new Date().toISOString(), formatId, name: `${tone} template set`, slides: generated }
    setSavedCampaigns((current) => {
      const next = [campaign, ...current].slice(0, 12)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    toast.success(`${generated.length} templates generated and saved`)
  }

  function updateSlide(patch: Partial<ContentSlide>) {
    if (!selectedSlide) return
    setSlides((current) => current.map((slide) => slide.id === selectedSlide.id ? { ...slide, ...patch } : slide))
  }

  function updateCurrentScore(value: string) {
    setCurrentScore(value)
    setSlides((current) => current.map((slide) => ({ ...slide, currentScore: value, metricValue: slide.templateId === 'cta' ? slide.metricValue : formatMetricScore(slide.categoryScores.find((score) => score.categoryId === slide.categoryId)?.value || value) })))
  }

  function updatePotentialScore(value: string) {
    setPotentialScore(value)
    setSlides((current) => current.map((slide) => ({ ...slide, potentialScore: value })))
  }

  function updateCategoryScore(categoryId: string, value: string) {
    setCategoryScoreValues((current) => ({ ...current, [categoryId]: value }))
    setSlides((current) => current.map((slide) => ({ ...slide, metricValue: slide.templateId !== 'cta' && slide.categoryId === categoryId ? formatMetricScore(value || slide.currentScore) : slide.metricValue, categoryScores: slide.categoryScores.map((score) => score.categoryId === categoryId ? { ...score, value } : score) })))
  }

  async function downloadSlide(slide: ContentSlide, index: number) {
    try {
      const blob = await renderSlidePng({ slide, images, width: format.width, height: format.height })
      downloadBlob(blob, filenameFor(index, slide, formatId))
      toast.success(`Exported ${format.width} × ${format.height} PNG`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export slide') }
  }

  async function downloadAll() {
    if (!slides.length) return
    setExporting(true)
    try {
      const files = []
      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index]
        const blob = await renderSlidePng({ slide, images, width: format.width, height: format.height })
        files.push({ name: filenameFor(index, slide, formatId), data: new Uint8Array(await blob.arrayBuffer()) })
      }
      downloadBlob(buildZip(files), `mogging-content-${formatId}.zip`)
      toast.success(`Exported ${slides.length} PNGs in one ZIP`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export slides') }
    finally { setExporting(false) }
  }

  async function downloadVideo() {
    if (!selectedSlide) return
    setVideoProgress(0)
    try {
      const blob = await renderSlideMp4({ slide: selectedSlide, images, width: format.width, height: format.height }, setVideoProgress)
      const file = new File([blob], `mogging-${selectedSlide.templateId}-${formatId}.mp4`, { type: 'video/mp4' })
      setExportedVideo({ file, url: URL.createObjectURL(file), width: format.width, height: format.height })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export MP4') }
    finally { setVideoProgress(null) }
  }

  async function submitToLibrary() {
    if (!selectedSlide) return
    const title = libraryTitle.trim() || selectedSlide.headline.trim() || templateOptions.find((template) => template.id === selectedSlide.templateId)?.label || 'Mogging CTA'
    if (title.length < 2 || title.length > 100) return toast.error('Use a library title between 2 and 100 characters')
    setLibrarySubmitting(true)
    setLibraryProgress(libraryAssetType === 'video/mp4' ? 0 : null)
    try {
      const blob = libraryAssetType === 'video/mp4'
        ? await renderSlideMp4({ slide: selectedSlide, images, width: format.width, height: format.height }, setLibraryProgress)
        : await renderSlidePng({ slide: selectedSlide, images, width: format.width, height: format.height })
      const intent = await apiPost<{ key: string; publicUrl: string; uploadUrl: string; fallbackUploadUrl: string; method: 'PUT' | 'POST' }>('/api/creator/cta-library/upload-intent', { contentType: libraryAssetType, sizeBytes: blob.size })
      let upload: Response | null = null
      try {
        upload = await fetch(intent.uploadUrl, { method: intent.method, headers: { 'Content-Type': libraryAssetType }, body: blob })
      } catch {
        // A valid R2 presigned URL still fails in browsers when the bucket's CORS
        // policy does not allow this origin. Retry through Mogging's same-origin API.
      }
      if (!upload?.ok && intent.uploadUrl !== intent.fallbackUploadUrl) {
        upload = await fetch(intent.fallbackUploadUrl, { method: 'POST', headers: { 'Content-Type': libraryAssetType }, body: blob })
      }
      if (!upload?.ok) throw new Error('Could not upload the generated CTA. Please try again.')
      await apiPost('/api/creator/cta-library', { title, templateId: selectedSlide.templateId, formatId, assetStorageKey: intent.key, assetContentType: libraryAssetType, assetSizeBytes: blob.size })
      setSubmittedSlides((current) => ({ ...current, [selectedSlide.id]: title }))
      setLibraryTitle('')
      await mutateLibrary()
      toast.success('Submitted to the CTA library for admin review')
    } catch (error) {
      toast.error(error instanceof ApiClientError || error instanceof Error ? error.message : 'Could not submit to the CTA library')
    } finally {
      setLibrarySubmitting(false)
      setLibraryProgress(null)
    }
  }

  return (
    <CreatorShell>
      <CreatorHeader eyebrow="Creator Tools" title="CTA Studio" description="Create a CTA with your photos and report scores." action={step === 3 && slides.length ? <Button className="h-11 rounded-full px-5" disabled={exporting} onClick={() => void downloadAll()}>{exporting ? <Loader2 className="animate-spin" /> : <FileArchive />}Download Set</Button> : null} />
      <CreatorStepper step={step} labels={['Photos', 'Details & Scores', 'Preview & Export']} />
      {step === 1 ? <section className="creator-surface p-5 sm:p-6">
        <SectionTitle icon={UploadCloud} title="Add creator photos" detail="Upload a clear, front-facing photo. Face mapping stays in your browser." />
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 grid min-h-36 w-full place-items-center rounded-[18px] border border-dashed border-black/15 bg-[#f5f5f7]/70 p-5 text-center transition-[border-color,background-color,transform] duration-150 hover:border-[#0071e3]/40 hover:bg-[#f5f5f7] active:scale-[0.99]"><span><ImagePlus className="mx-auto size-5 text-[#0071e3]" /><span className="mt-3 block text-sm font-semibold">Upload Photos</span><span className="mt-1 block text-xs leading-5 text-[#86868b]">One clear face · JPG, PNG, WebP</span></span></button>
          <div className="mt-4 grid gap-2">{images.map((image) => <ImageStatus key={image.id} image={image} onRetry={() => void detectImage(image.id, image.dataUrl, image)} onRemove={() => setImages((current) => current.filter((item) => item.id !== image.id))} />)}</div>

        <div className="mt-6 flex justify-end"><Button className="h-11 rounded-full px-6" disabled={!usableImages.length || images.some((image) => image.status === 'detecting')} onClick={() => setStep(2)}>Continue to Details</Button></div>
      </section> : null}
      {step === 2 ? <section className="creator-surface p-5 sm:p-6">
        <SectionTitle asset="formats" title="Set up your templates" detail="Choose the format and enter real scores from your report." />
        <div className="mt-5 grid content-start gap-4">

            <div className="grid grid-cols-2 gap-2"><ScoreField label="Current score" value={currentScore} onChange={updateCurrentScore} /><ScoreField label="Potential" value={potentialScore} onChange={updatePotentialScore} /></div>
            <div className="grid gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Category scores</p>{selectedCategories.map((categoryId) => <ScoreField key={categoryId} label={categoryOptions.find((item) => item.id === categoryId)?.label.replace(' analysis', '') ?? categoryId} value={categoryScoreValues[categoryId] ?? ''} onChange={(value) => updateCategoryScore(categoryId, value)} />)}</div>
        </div><details className="mt-5 border-t pt-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Customize format, categories & style</summary>
          <div className="mt-5 grid gap-4">
            <Field label="Format"><select className={fieldClass} value={formatId} onChange={(event) => setFormatId(event.target.value as OutputFormatId)}>{Object.entries(outputFormats).map(([id, item]) => <option key={id} value={id}>{item.label} · {item.width}×{item.height}</option>)}</select></Field>
            <Field label="Tone"><select className={fieldClass} value={tone} onChange={(event) => setTone(event.target.value as Tone)}><option value="curious">Curious</option><option value="direct">Direct</option><option value="educational">Educational</option></select></Field>
            <Field label="Product or offer"><input className={fieldClass} maxLength={100} value={offer} onChange={(event) => setOffer(event.target.value)} /></Field>
            <Field label="Featured category"><select className={fieldClass} value={featuredCategory} onChange={(event) => { const value = event.target.value; setFeaturedCategory(value); setSelectedCategories((current) => current.includes(value) ? current : [value, ...current]) }}>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="Overlay style"><select className={fieldClass} value={overlayStyle} onChange={(event) => { const value = event.target.value as 'category' | 'face-map'; setOverlayStyle(value); setSlides((current) => current.map((slide) => ({ ...slide, overlayStyle: value }))) }}><option value="category">Mobile report · category lines</option><option value="face-map">Mobile report · full face map</option></select></Field>
            <fieldset><legend className="text-sm font-medium">Values to show</legend><div className="mt-2 grid grid-cols-2 gap-2">{categoryOptions.map((item) => { const active = selectedCategories.includes(item.id); return <button key={item.id} type="button" aria-pressed={active} onClick={() => setSelectedCategories((current) => active ? current.filter((id) => id !== item.id) : [...current, item.id])} className={cn('flex min-h-12 items-center gap-2 rounded-[14px] border px-3 text-left text-xs font-medium transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', active ? 'border-[#0071e3]/30 bg-[#e8f2ff] text-[#0071e3] shadow-[0_0_0_2px_rgba(0,113,227,0.06)]' : 'border-black/[0.08] bg-white text-[#6e6e73] hover:bg-[#f5f5f7]')}><span className={cn('grid size-4 shrink-0 place-items-center rounded-full border', active ? 'border-[#0071e3] bg-[#0071e3] text-white' : 'border-black/20')}>{active ? <Check className="size-2.5" /> : null}</span>{item.label}</button> })}</div></fieldset>
          </div>
        </details>
        <div className="creator-actions mt-6 flex flex-wrap justify-between gap-3"><Button variant="outline" className="h-11 rounded-full px-6" onClick={() => setStep(1)}>Back to Photos</Button><Button className="h-11 rounded-full px-6" onClick={createCampaign}><RefreshCw />{slides.length ? 'Regenerate 5 Templates' : 'Generate 5 Templates'}</Button></div>
      </section> : null}
      {step === 3 ? <>
        <Button variant="outline" className="mb-5 h-11 rounded-full px-6" disabled={exporting || videoProgress !== null || librarySubmitting} onClick={() => setStep(2)}>Back to Details</Button>
        <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-sm font-semibold">Template preview</p><p className="mt-1 text-xs text-zinc-400">{slides.length ? `5 templates · ${format.width} × ${format.height}` : 'Your generated templates will appear here'}</p></div></div>
          {selectedSlide ? <div className="mx-auto" style={{ maxWidth: `min(100%, ${40 * format.width / format.height}dvh)` }}><ContentSlidePreview key={selectedSlide.id} slide={selectedSlide} images={images} format={format} /></div> : <div className="grid min-h-[620px] place-items-center border border-dashed border-zinc-300 bg-zinc-50/50 text-center" style={{ aspectRatio: `${format.width} / ${format.height}` }}><div><ImagePlus className="mx-auto size-6 text-zinc-300" /><p className="mt-3 text-sm font-semibold text-zinc-500">No templates yet</p><p className="mt-1 text-xs text-zinc-400">Upload a clear face and generate templates.</p></div></div>}
          {slides.length ? <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{templateOptions.map((template, index) => { const slide = slides.find((item) => item.templateId === template.id); if (!slide) return null; return <button type="button" key={template.id} onClick={() => setSelectedSlideId(slide.id)} className={cn('min-h-11 min-w-28 flex-1 rounded-xl border p-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]', selectedSlide?.templateId === template.id ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white')}><span className="block font-mono text-[9px] uppercase opacity-50">Template {index + 1}</span><span className="mt-2 block text-[11px] font-semibold leading-4">{template.label}</span></button> })}</div> : null}
        </section>

        <section className="creator-surface grid gap-4 p-5 sm:p-6">
          <SectionTitle asset="cta" title="Personalize and export" detail="Choose a template, review its alignment, then save your video." />
            {selectedSlide ? <><details><summary className="min-h-11 cursor-pointer text-sm font-semibold">Edit template text</summary><div><p className="mt-1 text-[11px] leading-4 text-zinc-400">Fine-tune this template’s copy. To change shared scores, go back to Details.</p></div><Field label="Eyebrow"><input className={fieldClass} maxLength={80} value={selectedSlide.eyebrow} onChange={(event) => updateSlide({ eyebrow: event.target.value })} /></Field><Field label="Headline"><textarea className={areaClass} value={selectedSlide.headline} onChange={(event) => updateSlide({ headline: event.target.value.slice(0, 120) })} /></Field><Field label="Supporting copy"><textarea className={areaClass} value={selectedSlide.supportingCopy} onChange={(event) => updateSlide({ supportingCopy: event.target.value.slice(0, 220) })} /></Field></details><div className="grid gap-2"><Button className="h-11 rounded-xl" disabled={videoProgress !== null} onClick={() => void downloadVideo()}>{videoProgress !== null ? <Loader2 className="animate-spin" /> : <Film />}{videoProgress !== null ? `${Math.round(videoProgress * 100)}%` : 'Video (MP4)'}</Button><Button className="h-11 rounded-xl" variant="outline" onClick={() => void downloadSlide(selectedSlide, slides.indexOf(selectedSlide))}><Download />Screenshot (PNG)</Button></div>{submittedSlides[selectedSlide.id] ? <SubmissionConfirmation title={submittedSlides[selectedSlide.id]} /> : <details className="rounded-2xl border border-zinc-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Save to CTA library (optional)</summary><p className="mt-1 text-[11px] leading-4 text-zinc-500">This also saves the CTA to your personal library. Admins review it before other creators can see it.</p><div className="mt-4 grid gap-3"><Field label="Library title"><input className={fieldClass} value={libraryTitle} maxLength={100} placeholder={selectedSlide.headline || 'Mogging CTA'} onChange={(event) => setLibraryTitle(event.target.value)} /></Field><Field label="Asset format"><select className={fieldClass} value={libraryAssetType} onChange={(event) => setLibraryAssetType(event.target.value as 'video/mp4' | 'image/png')}><option value="video/mp4">Video (MP4) · default</option><option value="image/png">Screenshot (PNG)</option></select></Field><Button className="h-11 rounded-xl" variant="outline" disabled={librarySubmitting} onClick={() => void submitToLibrary()}>{librarySubmitting ? <Loader2 className="animate-spin" /> : <Send />}{librarySubmitting ? (libraryProgress === null ? 'Uploading…' : `Rendering ${Math.round(libraryProgress * 100)}%`) : 'Submit for approval'}</Button></div></details>}</> : <p className="rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-500">Enter every score above, then generate the templates. Overlays match the mobile report. Review eye, nose and jaw alignment before exporting.</p>}        </section></div>
      </> : null}
      <div className="mt-6"><ContentRequirementsNote /></div>
      <details className="creator-surface mt-6 p-5 sm:p-6"><summary className="cursor-pointer text-sm font-semibold">Your CTA libraries, examples & history</summary>
      <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Personal collection</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">My CTA library</h2><p className="mt-2 text-sm text-zinc-500">Your stored CTAs stay available here to download and reuse. Only approved submissions also appear in the shared library.</p></div><BookOpen className="size-5 text-zinc-300" /></div>{library?.mine.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{library.mine.map((item) => <CtaLibraryCard key={item.id} item={item} variant="owned" />)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-400">Submit a generated CTA and it will be stored here for you automatically.</div>}</section>
      <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Creator resources</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Approved CTA library</h2><p className="mt-2 text-sm text-zinc-500">Ready-to-use samples reviewed by the Mogging team.</p></div><BookOpen className="size-5 text-zinc-300" /></div>{library?.approved.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{library.approved.map((item) => <CtaLibraryCard key={item.id} item={item} variant="approved" />)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-400">Approved creator samples will appear here.</div>}</section>

      <section className="mt-10"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Proven starting points</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Approved examples</h2><p className="mt-2 text-sm text-zinc-500">Formats approved to work in the creator program.</p></div><div className="mt-5 grid gap-3 md:grid-cols-3">{approvedExamples.map((example) => <article key={example.id} className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{example.category}</span><span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-semibold text-emerald-300">{example.status}</span></div><h3 className="mt-8 text-xl font-semibold tracking-[-0.04em]">{example.label}</h3><p className="mt-2 text-xs leading-5 text-white/50">{example.detail}</p></article>)}</div></section>
      <section className="mt-10"><div className="flex items-end justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Local library</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Previously generated</h2></div>{savedCampaigns.length ? <button type="button" onClick={() => { localStorage.removeItem(STORAGE_KEY); setSavedCampaigns([]) }} className="text-xs font-medium text-zinc-400 hover:text-black">Clear history</button> : null}</div>{savedCampaigns.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{savedCampaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => { setStep(1); const restored = campaign.slides[0]; const restoredCategories = restored?.categoryScores.map((score) => score.categoryId) ?? []; setFormatId(campaign.formatId); setSlides(campaign.slides); setSelectedSlideId(restored?.id ?? null); setCurrentScore(restored?.currentScore ?? ''); setPotentialScore(restored?.potentialScore ?? ''); setSelectedCategories(restoredCategories); setFeaturedCategory(restored?.categoryId ?? 'eyes'); setOverlayStyle(restored?.overlayStyle ?? 'category'); setCategoryScoreValues(Object.fromEntries((restored?.categoryScores ?? []).map((score) => [score.categoryId, score.value]))); toast.message('Sequence restored. Add the original photos and generate again to preview and export.') }} className="rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-[border-color,transform] duration-150 ease-out hover:border-zinc-300 active:scale-[0.99]"><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-400">{new Date(campaign.createdAt).toLocaleDateString()} · {campaign.slides.length} slides</span><span className="mt-3 block text-sm font-semibold capitalize">{campaign.name}</span><span className="mt-1 block text-xs text-zinc-400">{outputFormats[campaign.formatId].label}</span></button>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-400">Generated sequences will be saved here. Uploaded photos are not persisted.</div>}</section>
      </details>
      <Dialog open={Boolean(exportedVideo)} onOpenChange={(open) => { if (!open) setExportedVideo(null) }}>
        <DialogContent className="max-h-[90dvh] max-w-md gap-5 overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="pr-8 text-left"><DialogTitle>Your video is ready</DialogTitle><DialogDescription>Preview your video, then download it or save it using your device’s share menu.</DialogDescription></DialogHeader>
          {exportedVideo ? <>
            <video aria-label="Exported CTA video" src={exportedVideo.url} controls playsInline className="mx-auto block h-auto rounded-xl" style={{ width: `min(100%, ${50 * exportedVideo.width / exportedVideo.height}dvh)`, aspectRatio: `${exportedVideo.width} / ${exportedVideo.height}` }} />
            <div className="grid gap-3"><Button asChild className="h-11 rounded-xl"><a href={exportedVideo.url} download={exportedVideo.file.name}><Download />Download MP4</a></Button>
            {typeof navigator !== 'undefined' && navigator.canShare?.({ files: [exportedVideo.file] }) ? <Button variant="outline" className="h-11 rounded-xl" onClick={async () => {
              try { await navigator.share({ files: [exportedVideo.file] }) }
              catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) toast.error('Could not share the video. Use Download MP4 instead.') }
            }}>Save or Share Video</Button> : null}</div>
          </> : null}
        </DialogContent>
      </Dialog>
    </CreatorShell>
  )
}

function SectionTitle({ icon: Icon, asset, title, detail }: { icon?: LucideIcon; asset?: CreatorIconName; title: string; detail: string }) { return <div className="flex items-center gap-3">{asset ? <CreatorIcon name={asset} className="size-11" /> : Icon ? <span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span> : null}<div><h2 className="text-sm font-semibold tracking-[-0.015em]">{title}</h2><p className="mt-0.5 text-xs text-zinc-400">{detail}</p></div></div> }
function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label} hint="0–10"><input className={fieldClass} inputMode="decimal" min="0" max="10" step="0.1" type="number" value={value} placeholder="—" onChange={(event) => onChange(clampScoreInput(event.target.value))} /></Field> }
function SubmissionConfirmation({ title }: { title: string }) { return <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><CheckCircle2 className="size-4" /></span><div><p className="text-sm font-semibold">Submitted for approval</p><p className="mt-1 text-[11px] leading-5 text-emerald-800"><span className="font-semibold">{title}</span> is saved in My CTA Library. You can download and reuse it while the admin review is pending.</p></div></div></div> }
function CtaLibraryCard({ item, variant }: { item: CreatorCtaLibraryItem; variant: 'approved' | 'owned' }) { const video = item.assetContentType === 'video/mp4'; const owned = variant === 'owned'; return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="aspect-[4/3] bg-zinc-950">{video ? <video className="size-full object-contain" src={item.assetUrl} controls preload="metadata" /> : <div role="img" aria-label={item.title} className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(item.assetUrl)})` }} />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.title}</h3><p className="mt-1 text-[11px] text-zinc-400">{item.creatorName} · {video ? 'Video (MP4)' : 'Screenshot (PNG)'}</p></div>{owned ? <LibraryStatus status={item.status} /> : null}</div>{owned && item.reviewNote ? <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">{item.reviewNote}</p> : null}<a className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-3 text-xs font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]" href={item.assetUrl} download><Download className="size-3.5" />Download to reuse</a></div></article> }
function LibraryStatus({ status }: { status: CreatorCtaLibraryItem['status'] }) { const classes = status === 'approved' ? 'bg-emerald-50 text-emerald-700' : status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'; return <span className={cn('shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold capitalize', classes)}>{status}</span> }
function ImageStatus({ image, onRemove, onRetry }: { image: GeneratorImage; onRemove: () => void; onRetry: () => void }) {
  const color = image.status === 'ready' ? 'bg-emerald-500' : image.status === 'detecting' ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="flex items-center gap-3">
        <span className={cn('size-2 shrink-0 rounded-full', color)} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{image.name}</span>
        <span className="text-[10px] capitalize text-zinc-400" role="status">{image.status.replace('-', ' ')}</span>
        <button type="button" aria-label={`Remove ${image.name}`} onClick={onRemove} className="grid size-11 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-black"><Trash2 className="size-3" /></button>
      </div>
      {image.warning ? <p className="mt-2 pl-5 text-[11px] leading-4 text-zinc-500">{image.warning}</p> : null}
      {image.status === 'warning' || image.status === 'no-face' ? <button type="button" className="mt-2 ml-5 text-xs font-medium text-[#0071e3]" onClick={onRetry}>Retry detection</button> : null}
      {image.status === 'ready' && image.landmarks ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-[#0071e3]">Review face alignment</summary>
          <div className="relative mt-3 overflow-hidden rounded-lg bg-zinc-100" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
            <Image src={image.dataUrl} alt="Face alignment review" fill sizes="360px" unoptimized className="object-contain" />
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${image.width} ${image.height}`} aria-hidden="true">
              {Object.entries(image.landmarks.contours ?? {}).map(([key, points]) => (
                <polyline key={key} points={points?.map((point) => `${point.x * image.width},${point.y * image.height}`).join(' ')} fill="none" stroke="white" strokeWidth={image.width / 400} />
              ))}
              {Object.entries(image.landmarks.anchors).map(([key, point]) => point ? (
                <circle key={key} cx={point.x * image.width} cy={point.y * image.height} r={image.width / 180} fill="#67e8f9" stroke="#09090b" strokeWidth={image.width / 800} />
              ) : null)}
            </svg>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">Check that points follow the eyes, nose, lips and chin. If they miss, remove this photo and upload a sharper, front-facing crop.</p>
        </details>
      ) : null}
      {image.status === 'detecting' ? <div className="mt-2 ml-5 h-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-400" /></div> : null}
    </div>
  )
}
function readFile(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
function readDimensions(src: string) { return new Promise<{ width: number; height: number }>((resolve, reject) => { const image = new window.Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = src }) }
function filenameFor(index: number, slide: ContentSlide, formatId: OutputFormatId) { return `mogging-${String(index + 1).padStart(2, '0')}-${slide.templateId}-${formatId}.png` }
function formatMetricScore(value: string) { return value ? `${value} / 10` : '— / 10' }
function formatWarnings(warnings: string[]) { const labels: Record<string, string> = { 'small-face': 'The face is small in frame.', 'tilted-face': 'The face is noticeably tilted.', 'sparse-contours': 'Some contours may be incomplete.', 'partial-anchors': 'Some anchors may be incomplete.', 'asymmetric-anchor-fit': 'Landmark fit may be less stable.' }; return warnings.map((warning) => labels[warning] ?? warning).join(' ') }
function clampScoreInput(value: string) { if (value === '') return ''; if (!/^\d{0,2}(?:\.\d*)?$/.test(value)) return ''; const score = Number(value); return !Number.isFinite(score) ? '' : score > 10 ? '10' : value }
