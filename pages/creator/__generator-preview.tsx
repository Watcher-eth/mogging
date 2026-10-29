import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MockReportGenerator } from '@/components/creator/mock-report-generator'
import { MockProgressGenerator } from '@/components/creator/mock-progress-generator'
import { MockProtocolGenerator } from '@/components/creator/mock-protocol-generator'
import { EvaluationPreview, ProgressPreview } from '@/components/landing/mobile-preview'
import { previewLandmarks, previewPortrait } from '@/components/landing/overlay'
import { ContentSlidePreview } from '@/components/creator/content-slide'
import { Field, fieldClass } from '@/components/creator/creator-shell'
import { generateSlides, templateOptions } from '@/lib/creator/content-generator'
import type { GeneratorImage } from '@/lib/creator/content-generator'

const images: GeneratorImage[] = [{ id: 'preview-portrait', name: 'Example portrait', dataUrl: previewPortrait.src, width: previewPortrait.width, height: previewPortrait.height, landmarks: { ...previewLandmarks, source: 'apple-vision' }, status: 'ready' }]
export default function GeneratorPreview() {
  const [view, setView] = useState('screens')
  const [chapter, setChapter] = useState(0)
  return <main className="creator-portal min-h-screen overflow-x-clip bg-white px-5 py-8 text-black sm:px-10">
    <div className="mx-auto max-w-6xl"><header className="mb-8 flex flex-wrap items-end justify-between gap-6"><div><p className="text-xs text-zinc-400">Private design preview · example data</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">The current Mogging experience.</h1></div><Link className="text-sm underline underline-offset-4" href="/?landing_preview=homepage_b">View homepage</Link></header>
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Generator previews">{[['screens', 'App screens'], ['cta', 'CTA templates'], ['reports', 'Mock reports'], ['progress', 'Mock Progress'], ['protocol', 'Mock Protocol']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={`min-h-11 rounded-full px-5 text-sm ${view === id ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-600'}`} onClick={() => setView(id)}>{label}</button>)}</div>
      {view === 'screens' ? <Field label="Evaluation tour chapter"><select className={fieldClass} value={chapter} onChange={event => setChapter(Number(event.target.value))}>{[[0, 'Full guided tour'], [5200, 'PSL scale · lift'], [11000, 'Cheekbone triangle · lift'], [17000, 'Your potential'], [22000, 'Your priorities']].map(([time, label]) => <option key={time} value={time}>{label}</option>)}</select></Field> : null}
      {view === 'screens' ? <div className="mx-auto grid max-w-3xl gap-10 sm:grid-cols-2"><section><h2 className="mb-5 text-center text-sm text-zinc-500">Evaluation</h2><EvaluationPreview startAt={chapter} /></section><section><h2 className="mb-5 text-center text-sm text-zinc-500">Progress</h2><ProgressPreview /></section></div> : view === 'cta' ? <CtaExamples /> : view === 'reports' ? <MockReportGenerator images={images} active onBack={() => setView('screens')} /> : view === 'progress' ? <MockProgressGenerator /> : <MockProtocolGenerator />}
    </div>
  </main>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} } }

function CtaExamples() {
  const slides = useMemo(() => generateSlides({ tone: 'educational', campaignGoal: 'conversion', seed: 0, selectedCategories: ['overall', 'eyes', 'symmetry'], images, offer: '', currentScore: '7.2', potentialScore: '8.5' }), [])
  const [template, setTemplate] = useState('phone-report')
  const slide = slides.find(item => item.templateId === template)!
  return <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-2"><div><h2 className="mb-4 text-xl font-semibold">CTA templates</h2><Field label="Template"><select className={fieldClass} value={template} onChange={event => setTemplate(event.target.value)}>{templateOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field><p className="mt-4 text-sm text-zinc-500">The phone and handheld templates use the same updated report as the app preview.</p></div><ContentSlidePreview slide={slide} images={images} format={{ width: 1080, height: 1620 }} /></div>
}
