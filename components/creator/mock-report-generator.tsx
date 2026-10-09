import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { DesktopMockReportData } from './desktop-mock-report'
import { Download, Film, Loader2, Monitor, Smartphone, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from './creator-shell'
import { RandomScoreControl } from './random-score-control'
import { ContentSlidePreview } from './content-slide'
import type { ReportCategory } from '@/lib/creator/mobile-overlay-engine/report-data'
import { reportCategories } from '@/lib/creator/mock-report-data'
import { randomScore, randomScorePair } from '@/lib/creator/random-scores'
import { mockReportFormat, mockReportScrollMax, mockEyePalette } from '@/lib/creator/mock-report'
import { downloadBlob, renderSlidePng, renderSlideMp4 } from '@/lib/creator/export-slides'
import type { ContentSlide, GeneratorImage } from '@/lib/creator/content-generator'

const DesktopMockReport = dynamic(() => import('./desktop-mock-report').then(module => module.DesktopMockReport), { ssr: false })

export function MockReportGenerator({ images, active, onBack }: { images: GeneratorImage[]; active: boolean; onBack: () => void }) {
  const [layout, setLayout] = useState<'iphone' | 'phone' | 'desktop'>('iphone')
  const [desktopReport, setDesktopReport] = useState<DesktopMockReportData | null>(null)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const ownsFullscreen = useRef(false)
  const [categoryId, setCategoryId] = useState('overall')
  const [drafts, setDrafts] = useState<Record<string, ReportCategory>>({})
  const [current, setCurrent] = useState('')
  const [potential, setPotential] = useState('')
  const [imageId, setImageId] = useState('')
  const [slide, setSlide] = useState<ContentSlide | null>(null)
  const [scrollMax, setScrollMax] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const category = drafts[categoryId] ?? reportCategories.find(item => item.id === categoryId)!
  const photo = images.find(item => item.id === imageId) ?? images[0]
  function openDesktop() {
    setDesktopOpen(true)
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      ownsFullscreen.current = true
      void document.documentElement.requestFullscreen().catch(() => { ownsFullscreen.current = false })
    }
  }
  function closeDesktop() {
    setDesktopOpen(false)
    if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    ownsFullscreen.current = false
  }
  useEffect(() => {
    if (!desktopOpen) return
    const onFullscreenChange = () => {
      if (ownsFullscreen.current && !document.fullscreenElement) {
        ownsFullscreen.current = false
        setDesktopOpen(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [desktopOpen])
  useEffect(() => () => {
    if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])
  function updateCategory(patch: Partial<ReportCategory>) {
    setDrafts(values => ({ ...values, [categoryId]: { ...category, ...patch } }))
  }
  function generate() {
    if (!photo) return toast.error('Add a photo with a usable face first')
    if (!current || (layout !== 'desktop' && !potential) || !category.features.every(feature => feature.value.trim())) return toast.error('Enter the scores and every feature value, or use Randomize values')
    if (layout === 'desktop') {
      const categories = reportCategories.map(base => {
        const draft = drafts[base.id] ?? base
        return { ...draft, score: base.id === 'overall' ? Number(current) : draft.score, features: draft.features.map(feature => ({ ...feature })) }
      })
      const incomplete = categories.find(item => item.features.some(feature => !feature.value.trim()))
      if (incomplete) return toast.error(`Enter every feature value for ${incomplete.title}, or use Randomize values`)
      setDesktopReport({ id: crypto.randomUUID(), image: photo, initialCategoryId: categoryId, overallScore: Number(current), categories })
      openDesktop()
      return
    }
    setScrollMax(mockReportScrollMax(category))
    setSlide({
      id: crypto.randomUUID(), templateId: layout === 'phone' ? 'phone-report' : 'mock-report', imageId: photo.id,
      categoryId, currentScore: current, potentialScore: potential,
      categoryScores: [{ categoryId, label: category.title, value: category.score.toFixed(1) }],
      overlayStyle: ['skin', 'skin-age'].includes(categoryId) ? 'face-map' : 'category',
      metricLabel: category.title, metricValue: category.score.toFixed(1),
      eyebrow: '', headline: '', supportingCopy: '', cta: '',
      mockReport: { category: { ...category, features: category.features.map(feature => ({ ...feature })) }, scroll: 0 },
    })
  }
  async function exportReport(video: boolean) {
    if (!slide) return
    setProgress(0)
    try {
      const args = { slide, images, ...mockReportFormat }
      const blob = video ? await renderSlideMp4(args, setProgress) : await renderSlidePng(args)
      downloadBlob(blob, `mogging-mock-report-${slide.categoryId}.${video ? 'mp4' : 'png'}`)
      toast.success(`${video ? 'Video' : 'Screenshot'} exported`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export report') }
    finally { setProgress(null) }
  }
  return <>
  {desktopReport ? <DesktopMockReport key={desktopReport.id} report={desktopReport} open={desktopOpen && active} onClose={closeDesktop} /> : null}
  <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="creator-surface grid gap-5 p-5 sm:p-6">
      <div><h2 className="text-lg font-semibold">Mock report details</h2><p className="mt-0.5 text-sm text-zinc-500">Choose an iPhone or desktop report and edit its values before generating.</p></div>
      <Button variant="outline" className="justify-self-start rounded-full" onClick={onBack}>Back to photos</Button>
      <fieldset><legend className="mb-2 text-sm font-medium">Report format</legend><div className="grid grid-cols-2 gap-2">
        {([{ id: 'iphone', label: 'iPhone', icon: Smartphone }, { id: 'phone', label: 'Phone CTA', icon: Smartphone }, { id: 'desktop', label: 'Desktop', icon: Monitor }] as const).map(option => <label key={option.id} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors ${layout === option.id ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2`}>
          <input type="radio" name="mock-report-format" value={option.id} checked={layout === option.id} onChange={() => setLayout(option.id)} className="sr-only" /><option.icon className="size-4" />{option.label}
        </label>)}
      </div></fieldset>
      <Field label="Report category"><select aria-label="Report category" className={fieldClass} value={categoryId} onChange={event => setCategoryId(event.target.value)}>{reportCategories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      {images.length > 1 ? <Field label="Report photo"><select aria-label="Report photo" className={fieldClass} value={photo?.id ?? ''} onChange={event => setImageId(event.target.value)}>{images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}</select></Field> : null}
      <RandomScoreControl onRandomize={range => {
        const pair = randomScorePair(range)
        setCurrent(pair.current); setPotential(pair.potential)
        const randomizeCategory = (item: ReportCategory): ReportCategory => ({
          ...item, score: item.id === 'overall' ? Number(pair.current) : Number(randomScore(range)),
          features: item.features.map(feature => ({ ...feature, value: item.id === 'overall' ? `${randomScore(range, /PSL/i.test(feature.label) ? 8 : 10)} / ${/PSL/i.test(feature.label) ? 8 : 10}` : feature.value, grade: Number(randomScore(range)), measurement: undefined })),
        })
        if (layout === 'desktop') setDrafts(values => Object.fromEntries(reportCategories.map(base => [base.id, randomizeCategory(values[base.id] ?? base)])))
        else updateCategory(randomizeCategory(category))
      }} />
      {layout === 'desktop' ? <p className="text-xs leading-5 text-zinc-500">Randomize fills scores across every desktop category. You can edit each category individually.</p> : null}
      <div className="grid grid-cols-2 gap-3"><ScoreInput label="Overall score" value={current} onChange={setCurrent} />{layout !== 'desktop' ? <ScoreInput label="Potential" value={potential} onChange={setPotential} /> : null}</div>
      {categoryId !== 'overall' ? <ScoreInput label={`${category.title} score`} value={String(category.score)} onChange={value => updateCategory({ score: Number(value) })} /> : null}
      {categoryId === 'eyes' ? <Field label="Eye color"><select aria-label="Eye color" className={fieldClass} value={category.eyeColor ?? ''} onChange={event => updateCategory({ eyeColor: event.target.value || undefined })}><option value="">Hide eye color palette</option>{mockEyePalette.map(shade => <option key={shade.name} value={shade.name}>{shade.name}</option>)}</select></Field> : null}
      <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-semibold">Feature grid</legend>{category.features.map((feature, index) => <div key={`${categoryId}-${index}`} className="grid grid-cols-2 gap-2">
        <Field label={feature.label}><input aria-label={feature.label} className={fieldClass} maxLength={70} value={feature.value} onChange={event => updateCategory({ features: category.features.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} /></Field>
        <Field label={`${feature.label} measurement`} hint="Optional"><input aria-label={`${feature.label} measurement`} className={fieldClass} maxLength={32} placeholder="e.g. +4.2°" value={feature.measurement ?? ''} onChange={event => updateCategory({ features: category.features.map((item, i) => i === index ? { ...item, measurement: event.target.value } : item) })} /></Field>
      </div>)}</fieldset>
      {layout === 'desktop'
        ? <Field label="Explanation"><textarea aria-label="Explanation" className={`${fieldClass} min-h-28 py-3`} maxLength={1200} value={category.explanation} onChange={event => updateCategory({ explanation: event.target.value })} /></Field>
        : <Field label="Growth opportunities" hint="One recommendation per line"><textarea aria-label="Growth opportunities" className={`${fieldClass} min-h-28 py-3`} maxLength={1200} value={category.recommendation} onChange={event => updateCategory({ recommendation: event.target.value })} /></Field>}
      <Button className="h-11 rounded-full" disabled={!photo || progress !== null} onClick={generate}>{layout === 'desktop' ? 'Generate fullscreen desktop report' : slide ? 'Regenerate mock report' : 'Generate mock report'}</Button>
    </section>
    {layout === 'desktop' ? <section className="creator-surface grid gap-5 p-6 lg:sticky lg:top-28">
      <Monitor className="size-8 text-zinc-400" />
      <div><h2 className="text-lg font-semibold">{desktopReport ? 'Desktop report ready' : 'Fullscreen desktop report'}</h2><p className="mt-0.5 text-sm leading-6 text-zinc-500">Generate to open the analysis page layout with your photo, scores and feature values. Browse categories from the sidebar. Share report saves a PNG.</p></div>
      {desktopReport ? <Button className="rounded-full" onClick={openDesktop}><Maximize2 className="size-4" />Open fullscreen report</Button> : null}
      <p className="text-xs text-zinc-500">Press Escape or Back to editor to return. Edit values and generate again to update the report.</p>
    </section> : <section className="grid min-w-0 gap-4 lg:sticky lg:top-28">
      <div><h2 className="text-sm font-semibold">iPhone report preview</h2><p className="mt-0.5 text-xs text-zinc-500">390 × 844 points · exported at 3× resolution</p></div>
      {slide ? <>
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[42px] border-[6px] border-zinc-900 bg-zinc-900 shadow-xl">{active ? <ContentSlidePreview slide={slide} images={images} format={mockReportFormat} /> : null}</div>
        <Field label="Report scroll position" hint="Scroll to the feature grid or Growth Opportunities before exporting"><input aria-label="Report scroll position" className="w-full accent-black" type="range" min={0} max={scrollMax} step={1} value={slide.mockReport?.scroll ?? 0} onChange={event => setSlide({ ...slide, mockReport: { ...slide.mockReport!, scroll: Number(event.target.value) } })} /></Field>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={progress !== null} onClick={() => void exportReport(false)}><Download />Screenshot (PNG)</Button><Button disabled={progress !== null} onClick={() => void exportReport(true)}>{progress !== null ? <Loader2 className="animate-spin" /> : <Film />}{progress !== null ? `Exporting ${Math.round(progress * 100)}%` : 'Video with shimmer (MP4)'}</Button></div>
        <p className="text-xs text-zinc-500">Exports capture the selected scroll position. Edit details and regenerate to apply changes.</p>
      </> : <div className="mx-auto grid aspect-[390/844] w-full max-w-[390px] place-items-center rounded-[42px] border-[6px] border-zinc-900 bg-[#f7f7f7] p-10 text-center text-sm text-zinc-500">Your generated report will appear here.</div>}
    </section>}
  </div>
  </>
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label} hint="0–10"><input aria-label={label} className={fieldClass} type="number" inputMode="decimal" min={0} max={10} step={.1} value={value} placeholder="—" onChange={event => onChange(event.target.value === '' ? '' : String(Math.min(10, Math.max(0, Number(event.target.value)))))} /></Field>
}
