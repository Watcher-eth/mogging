import { useEffect, useRef, useState } from 'react'
import { Check, Download, FileArchive, Film, ImagePlus, Loader2, RefreshCw, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ContentSlidePreview } from '@/components/creator/content-slide'
import { CreatorHeader, CreatorShell, Field, areaClass, fieldClass } from '@/components/creator/creator-shell'
import { extractFaceLandmarksFromDataUrl } from '@/lib/client/faceLandmarks'
import { buildZip, downloadBlob, renderSlideMp4, renderSlidePng } from '@/lib/creator/export-slides'
import { categoryOptions, generateSlides, outputFormats, templateOptions, type ContentSlide, type GeneratorImage, type OutputFormatId, type SavedCampaign, type Tone } from '@/lib/creator/content-generator'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'mogging:creator-content:v2'
const approvedExamples = [
  { id: 'approved-report', label: 'Feature breakdown', detail: 'Hook → mapped feature → CTA', category: 'Report series', status: 'Approved format' },
  { id: 'approved-scan', label: 'Scan reveal', detail: 'Upload → local scan → report reveal', category: 'Reveal series', status: 'Approved format' },
  { id: 'approved-progress', label: 'Progression story', detail: 'Frame one → frame two → link in bio', category: 'Progress series', status: 'Approved format' },
]

export default function CtaGeneratorPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<GeneratorImage[]>([])
  const [formatId, setFormatId] = useState<OutputFormatId>('vertical')
  const [tone, setTone] = useState<Tone>('curious')
  const [offer, setOffer] = useState('Mogging')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['eyes', 'jaw', 'symmetry', 'overall'])
  const [featuredCategory, setFeaturedCategory] = useState('eyes')
  const [slides, setSlides] = useState<ContentSlide[]>([])
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null)
  const [seed, setSeed] = useState(0)
  const [savedCampaigns, setSavedCampaigns] = useState<SavedCampaign[]>([])
  const [exporting, setExporting] = useState(false)
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
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
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!accepted.length) return toast.error('Choose a JPG, PNG, or WebP image')
    for (const file of accepted) {
      const dataUrl = await readFile(file)
      const dimensions = await readDimensions(dataUrl)
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`
      setImages((current) => [...current, { id, name: file.name, dataUrl, ...dimensions, landmarks: null, status: 'detecting' }])
      void detectImage(id, dataUrl, dimensions)
    }
  }

  async function detectImage(id: string, dataUrl: string, dimensions: { width: number; height: number }) {
    const landmarks = await extractFaceLandmarksFromDataUrl(dataUrl)
    setImages((current) => current.map((image) => {
      if (image.id !== id) return image
      if (!landmarks) return { ...image, status: 'no-face', warning: 'No usable face was detected. Try a clear, front-facing image.' }
      const score = Math.min(landmarks.confidence, landmarks.quality?.score ?? landmarks.confidence)
      if (score < 0.58 || Object.values(landmarks.anchors).filter(Boolean).length < 8) return { ...image, landmarks: { ...landmarks, image: dimensions }, status: 'warning', warning: `Landmark confidence is ${Math.round(score * 100)}%. Use a clearer image before generating.` }
      const warnings = landmarks.quality?.warnings ?? []
      return { ...image, landmarks: { ...landmarks, image: dimensions }, status: 'ready', warning: warnings.length ? formatWarnings(warnings) : undefined }
    }))
  }

  function createCampaign() {
    if (!usableImages.length) return toast.error(images.some((image) => image.status === 'detecting') ? 'Landmark detection is still running' : 'Upload a clear image with a usable face first')
    if (!selectedCategories.length) return toast.error('Select at least one report value')
    const nextSeed = seed + 1
    const generated = generateSlides({ campaignGoal: 'traffic', tone, selectedCategories, images, offer, seed: nextSeed, primaryCategory: featuredCategory })
    setSeed(nextSeed)
    setSlides(generated)
    setSelectedSlideId(generated[0]?.id ?? null)
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

  function updateSharedScores(patch: Pick<Partial<ContentSlide>, 'currentScore' | 'potentialScore' | 'categoryScores'>) {
    setSlides((current) => current.map((slide) => ({ ...slide, ...patch })))
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
      downloadBlob(blob, `mogging-${selectedSlide.templateId}-${formatId}.mp4`)
      toast.success('Exported 4-second MP4')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export MP4') }
    finally { setVideoProgress(null) }
  }

  return (
    <CreatorShell>
      <CreatorHeader eyebrow="Creator content tool" title="Content Generator" description="Upload creator photos, choose the report values you want to show, then pick from five Mogging-native templates. Images and landmark detection stay in your browser." action={slides.length ? <Button className="h-10 rounded-xl" disabled={exporting} onClick={() => void downloadAll()}>{exporting ? <Loader2 className="animate-spin" /> : <FileArchive />}Download PNG set</Button> : null} />

      <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.7fr)_minmax(420px,1.05fr)_minmax(300px,0.7fr)]">
        <section className="h-fit rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-6">
          <SectionTitle icon={UploadCloud} title="1. Add creator images" detail="Local face mapping only" />
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 grid min-h-36 w-full place-items-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5 text-center transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.99]"><span><ImagePlus className="mx-auto size-5 text-zinc-400" /><span className="mt-3 block text-sm font-semibold">Upload one or more photos</span><span className="mt-1 block text-xs leading-5 text-zinc-400">Portrait, landscape, or square · JPG, PNG, WebP</span></span></button>
          <div className="mt-4 grid gap-2">{images.map((image) => <ImageStatus key={image.id} image={image} onRemove={() => setImages((current) => current.filter((item) => item.id !== image.id))} />)}</div>

          <div className="my-6 h-px bg-zinc-100" />
          <SectionTitle icon={Sparkles} title="2. Shape the series" detail="Deterministic copy" />
          <div className="mt-5 grid gap-4">
            <Field label="Format"><select className={fieldClass} value={formatId} onChange={(event) => setFormatId(event.target.value as OutputFormatId)}>{Object.entries(outputFormats).map(([id, item]) => <option key={id} value={id}>{item.label} · {item.width}×{item.height}</option>)}</select></Field>
            <Field label="Tone"><select className={fieldClass} value={tone} onChange={(event) => setTone(event.target.value as Tone)}><option value="curious">Curious</option><option value="direct">Direct</option><option value="educational">Educational</option></select></Field>
            <Field label="Product or offer"><input className={fieldClass} value={offer} onChange={(event) => setOffer(event.target.value)} /></Field>
            <Field label="Featured category"><select className={fieldClass} value={featuredCategory} onChange={(event) => { const value = event.target.value; setFeaturedCategory(value); setSelectedCategories((current) => current.includes(value) ? current : [value, ...current]) }}>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <fieldset><legend className="text-sm font-medium">Values to show</legend><div className="mt-2 grid grid-cols-2 gap-2">{categoryOptions.map((item) => { const active = selectedCategories.includes(item.id); return <button key={item.id} type="button" aria-pressed={active} onClick={() => setSelectedCategories((current) => active ? current.filter((id) => id !== item.id) : [...current, item.id])} className={cn('flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-xs font-medium transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]', active ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300')}><span className={cn('grid size-4 shrink-0 place-items-center rounded-full border', active ? 'border-white bg-white text-black' : 'border-zinc-300')}>{active ? <Check className="size-2.5" /> : null}</span>{item.label}</button> })}</div></fieldset>
            <Button className="h-12 rounded-xl" onClick={createCampaign}><RefreshCw />Generate 5 templates</Button>
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-sm font-semibold">Template preview</p><p className="mt-1 text-xs text-zinc-400">{slides.length ? `5 templates · ${format.width} × ${format.height}` : 'Your generated templates will appear here'}</p></div></div>
          {selectedSlide ? <ContentSlidePreview key={selectedSlide.id} slide={selectedSlide} images={images} format={format} /> : <div className="grid min-h-[620px] place-items-center border border-dashed border-zinc-300 bg-zinc-50/50 text-center" style={{ aspectRatio: `${format.width} / ${format.height}` }}><div><ImagePlus className="mx-auto size-6 text-zinc-300" /><p className="mt-3 text-sm font-semibold text-zinc-500">No templates yet</p><p className="mt-1 text-xs text-zinc-400">Upload a clear face and generate templates.</p></div></div>}
          {slides.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{templateOptions.map((template, index) => { const slide = slides.find((item) => item.templateId === template.id); if (!slide) return null; return <button type="button" key={template.id} onClick={() => setSelectedSlideId(slide.id)} className={cn('min-h-24 rounded-xl border p-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]', selectedSlide?.templateId === template.id ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white')}><span className="block font-mono text-[9px] uppercase opacity-50">Template {index + 1}</span><span className="mt-2 block text-[11px] font-semibold leading-4">{template.label}</span><span className="mt-1 line-clamp-2 block text-[9px] leading-3 opacity-50">{template.description}</span></button> })}</div> : null}
        </section>

        <aside className="h-fit rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-6">
          <SectionTitle icon={Sparkles} title="3. Edit content" detail="Geometry is locked" />
          {selectedSlide ? <div className="mt-5 grid gap-4"><Field label="Eyebrow"><input className={fieldClass} value={selectedSlide.eyebrow} onChange={(event) => updateSlide({ eyebrow: event.target.value })} /></Field><Field label="Headline"><textarea className={areaClass} value={selectedSlide.headline} onChange={(event) => updateSlide({ headline: event.target.value.slice(0, 120) })} /></Field><Field label="Supporting copy"><textarea className={areaClass} value={selectedSlide.supportingCopy} onChange={(event) => updateSlide({ supportingCopy: event.target.value.slice(0, 220) })} /></Field><div className="grid grid-cols-2 gap-2"><ScoreField label="Current score" value={selectedSlide.currentScore} onChange={(value) => updateSharedScores({ currentScore: value })} /><ScoreField label="Potential" value={selectedSlide.potentialScore} onChange={(value) => updateSharedScores({ potentialScore: value })} /></div><div className="grid gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Category scores</p>{selectedSlide.categoryScores.map((score) => <ScoreField key={score.categoryId} label={score.label} value={score.value} onChange={(value) => updateSharedScores({ categoryScores: selectedSlide.categoryScores.map((item) => item.categoryId === score.categoryId ? { ...item, value } : item) })} />)}</div><div className="grid grid-cols-2 gap-2"><Button className="h-11 rounded-xl" onClick={() => void downloadSlide(selectedSlide, slides.indexOf(selectedSlide))}><Download />PNG</Button><Button className="h-11 rounded-xl" variant="outline" disabled={videoProgress !== null} onClick={() => void downloadVideo()}>{videoProgress !== null ? <Loader2 className="animate-spin" /> : <Film />}{videoProgress !== null ? `${Math.round(videoProgress * 100)}%` : 'MP4'}</Button></div></div> : <p className="mt-5 rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-500">Generate templates to edit their copy and enter real scores. Canonical overlay geometry remains locked.</p>}
        </aside>
      </div>

      <section className="mt-10"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Proven starting points</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Approved examples</h2><p className="mt-2 text-sm text-zinc-500">Formats approved to work in the creator program.</p></div><div className="mt-5 grid gap-3 md:grid-cols-3">{approvedExamples.map((example) => <article key={example.id} className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{example.category}</span><span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-semibold text-emerald-300">{example.status}</span></div><h3 className="mt-8 text-xl font-semibold tracking-[-0.04em]">{example.label}</h3><p className="mt-2 text-xs leading-5 text-white/50">{example.detail}</p></article>)}</div></section>
      <section className="mt-10"><div className="flex items-end justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Local library</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Previously generated</h2></div>{savedCampaigns.length ? <button type="button" onClick={() => { localStorage.removeItem(STORAGE_KEY); setSavedCampaigns([]) }} className="text-xs font-medium text-zinc-400 hover:text-black">Clear history</button> : null}</div>{savedCampaigns.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{savedCampaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => { setFormatId(campaign.formatId); setSlides(campaign.slides); setSelectedSlideId(campaign.slides[0]?.id ?? null); toast.message('Sequence restored. Re-upload the original images to preview and export.') }} className="rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-[border-color,transform] duration-150 ease-out hover:border-zinc-300 active:scale-[0.99]"><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-400">{new Date(campaign.createdAt).toLocaleDateString()} · {campaign.slides.length} slides</span><span className="mt-3 block text-sm font-semibold capitalize">{campaign.name}</span><span className="mt-1 block text-xs text-zinc-400">{outputFormats[campaign.formatId].label}</span></button>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-400">Generated sequences will be saved here. Uploaded photos are not persisted.</div>}</section>
    </CreatorShell>
  )
}

function SectionTitle({ icon: Icon, title, detail }: { icon: typeof Sparkles; title: string; detail: string }) { return <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span><div><h2 className="text-sm font-semibold tracking-[-0.015em]">{title}</h2><p className="mt-0.5 text-xs text-zinc-400">{detail}</p></div></div> }
function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label} hint="0–10"><input className={fieldClass} inputMode="decimal" min="0" max="10" step="0.1" type="number" value={value} placeholder="—" onChange={(event) => onChange(clampScoreInput(event.target.value))} /></Field> }
function ImageStatus({ image, onRemove }: { image: GeneratorImage; onRemove: () => void }) { const color = image.status === 'ready' ? 'bg-emerald-500' : image.status === 'detecting' ? 'bg-amber-400' : 'bg-red-500'; return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex items-center gap-3"><span className={cn('size-2 shrink-0 rounded-full', color)} /><span className="min-w-0 flex-1 truncate text-xs font-medium">{image.name}</span><span className="text-[10px] capitalize text-zinc-400">{image.status.replace('-', ' ')}</span><button type="button" aria-label={`Remove ${image.name}`} onClick={onRemove} className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-black"><Trash2 className="size-3" /></button></div>{image.warning ? <p className="mt-2 pl-5 text-[11px] leading-4 text-zinc-500">{image.warning}</p> : null}{image.status === 'detecting' ? <div className="mt-2 ml-5 h-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-400" /></div> : null}</div> }
function readFile(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
function readDimensions(src: string) { return new Promise<{ width: number; height: number }>((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = src }) }
function filenameFor(index: number, slide: ContentSlide, formatId: OutputFormatId) { return `mogging-${String(index + 1).padStart(2, '0')}-${slide.templateId}-${formatId}.png` }
function formatWarnings(warnings: string[]) { const labels: Record<string, string> = { 'small-face': 'The face is small in frame.', 'tilted-face': 'The face is noticeably tilted.', 'sparse-contours': 'Some contours may be incomplete.', 'partial-anchors': 'Some anchors may be incomplete.', 'asymmetric-anchor-fit': 'Landmark fit may be less stable.' }; return warnings.map((warning) => labels[warning] ?? warning).join(' ') }
function clampScoreInput(value: string) { if (value === '') return ''; if (!/^\d{0,2}(?:\.\d*)?$/.test(value)) return ''; const score = Number(value); return Number.isFinite(score) && score > 10 ? '10' : value }
