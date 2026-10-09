import { useEffect, useState, useMemo } from 'react'
import { ContentSlidePreview } from '@/components/creator/content-slide'
import { generateSlides, type GeneratorImage, type ContentSlide } from '@/lib/creator/content-generator'
import { reportCategories } from '@/lib/creator/mock-report-data'
import { previewLandmarks } from '@/components/landing/overlay'
import { renderSlidePng } from '@/lib/creator/export-slides'

export default function CreatorTemplatePreview() {
  const [images, setImages] = useState<GeneratorImage[]>([])
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const [category, setCategory] = useState('eyes')
  useEffect(() => { void fetch('/model2.png').then(response => response.blob()).then(blob => {
    const reader = new FileReader(); reader.onload = () => setImages([{ id: 'demo', name: 'Bundled example', dataUrl: String(reader.result), width: 1024, height: 1536, landmarks: previewLandmarks as GeneratorImage['landmarks'], status: 'ready' }]); reader.readAsDataURL(blob)
  }) }, [])
  const format = { width: 1080, height: 1620 }
  const slides = useMemo(() => generateSlides({ campaignGoal: 'traffic', tone: 'direct', selectedCategories: ['jaw', 'eyes', 'psl', 'overall'], primaryCategory: 'jaw', images, offer: '', seed: 0, currentScore: '7.4', potentialScore: '8.2', scoreValues: { jaw: '8.1', eyes: '7.6', psl: '5.9', overall: '7.4' } }), [images])
  async function exportPng(slide: ContentSlide) {
    setExporting(true); setExported(null); setExportError(null)
    try {
      const blob = await renderSlidePng({ slide, images, ...format })
      const reader = new FileReader()
      reader.onload = () => { setExported(String(reader.result)); setExporting(false) }
      reader.onerror = () => { setExportError('Could not read the rendered PNG'); setExporting(false) }
      reader.readAsDataURL(blob)
    } catch (error) { setExportError(String(error)); setExporting(false) }
  }
  const selected = reportCategories.find(item => item.id === category)!
  const mock: ContentSlide = { ...slides[0], id: 'mock', templateId: 'mock-report', categoryId: category, imageId: 'demo', metricLabel: selected.title, metricValue: '7.4', currentScore: '7.4', potentialScore: '8.2', categoryScores: [{ categoryId: category, label: selected.title, value: '7.4' }], mockReport: { category: selected, scroll } }
  return <div className="space-y-8"><h1 className="text-3xl font-semibold">Creator template preview</h1><p className="text-sm text-zinc-500">Bundled sample and editable mock fixtures. No saved report.</p><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">{slides.map(slide => <div key={slide.id}><h2 className="mb-3 font-medium">{slide.templateId}</h2><ContentSlidePreview slide={slide} images={images} format={format} /><button className="mt-2 text-sm disabled:opacity-40" disabled={exporting} onClick={() => void exportPng(slide)}>Export PNG</button></div>)}</div>{exportError ? <p role="alert">{exportError}</p> : null}{exported ? <a href={exported} download="creator-template.png" className="block text-sm">PNG rendered · Download export<img src={exported} alt="Rendered PNG export" className="mt-2 max-h-64" /></a> : null}<select aria-label="Mock report category" value={category} onChange={event => { setCategory(event.target.value); setScroll(0) }}>{reportCategories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input aria-label="Mock report scroll" type="range" min="0" max="1800" value={scroll} onChange={event => setScroll(Number(event.target.value))} />{slides.length > 0 && <div className="max-w-sm"><ContentSlidePreview slide={mock} images={images} format={{width:390,height:844}} /></div>}</div>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true } }
