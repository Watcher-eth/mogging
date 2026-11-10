import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Check, ChevronRight, Clock3, Copy, FileText, Film, Mic2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from './creator-shell'
import {
  analysisHookOptions,
  analysisPostBrief,
  analysisPostFormats,
  analysisPostScript,
  buildAnalysisPost,
  moggingFeatureOptions,
  time,
  type AnalysisPostInput,
  type AnalysisPostPlan,
} from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { cn } from '@/lib/utils'

const initialInput: AnalysisPostInput = {
  formatId: 'score-reveal',
  subject: 'this face',
  hook: analysisHookOptions[0],
  overallScore: '7.1',
  potentialScore: '8.2',
  strongestFeature: 'Eye area',
  strongestScore: '8.1',
  opportunityFeature: 'Jaw definition',
  opportunityScore: '6.2',
  recommendation: 'Focus on posture, grooming and a consistent protocol, then compare progress photos under the same lighting.',
  productFeatures: ['46-point face scan', 'Category scores', 'Strengths and weaknesses', 'Personalized protocol'],
  cta: 'Get your Mogging score—link in bio.',
}

const VideoStudio = dynamic(() => import('./video-studio'), { ssr: false, loading: () => <p role="status" className="p-6 text-sm text-zinc-500">Opening video studio…</p> })

export function AnalysisPostGenerator({ images, onOpenAssets, onOpenMockReport }: { images: GeneratorImage[]; onOpenAssets: () => void; onOpenMockReport: () => void }) {
  const [input, setInput] = useState<AnalysisPostInput>(initialInput)
  const [plan, setPlan] = useState<AnalysisPostPlan>(() => buildAnalysisPost(initialInput))
  const [view, setView] = useState<'storyboard' | 'script'>('storyboard')
  const [videoOpen, setVideoOpen] = useState(false)
  const photo = images[0]

  function patch(value: Partial<AnalysisPostInput>) {
    setInput(current => ({ ...current, ...value }))
  }

  function generate() {
    setPlan(buildAnalysisPost(input))
    toast.success(`${analysisPostFormats.find(item => item.id === input.formatId)?.label} plan generated`)
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`)
    }
  }

  if (videoOpen) return <VideoStudio input={input} plan={buildAnalysisPost(input)} images={images} />

  return <div className="grid gap-5">
    <div className="creator-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"><div><h2 className="text-sm font-semibold">Create a video</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Choose a person, compare five visual styles, and preview a vertical video in the phone simulator.</p></div><Button className="h-11 rounded-full" onClick={() => setVideoOpen(true)}><Film className="size-4" />Open video studio</Button></div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
    <section className="creator-surface grid gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00A8EF]">Analysis post builder</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Turn a report into a complete video</h2><p className="mt-1 text-sm leading-6 text-zinc-500">Draft the hook, score reveal, feature audit, recommendation and Mogging CTA in one timeline.</p></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold text-zinc-500"><Mic2 className="size-3" />Voice later</span>
      </div>

      <fieldset><legend className="mb-2 text-sm font-semibold">Post format</legend><div className="grid gap-2 sm:grid-cols-3">{analysisPostFormats.map(option => {
        const active = input.formatId === option.id
        return <button key={option.id} type="button" aria-pressed={active} onClick={() => patch({ formatId: option.id })} className={cn('min-h-28 rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', active ? 'creator-choice-selected' : 'border-black/[0.08] bg-white hover:bg-zinc-50')}>
          <span className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{option.label}</span><span className="font-mono text-[10px] text-zinc-400">{option.duration}s</span></span>
          <span className="mt-2 block text-[11px] leading-4 text-zinc-500">{option.description}</span>
        </button>
      })}</div></fieldset>

      <Field label="Hook"><select className={fieldClass} value={input.hook} onChange={event => patch({ hook: event.target.value })}>{analysisHookOptions.map(option => <option key={option}>{option}</option>)}</select></Field>
      <Field label="Subject label" hint="Name, handle, or ‘this face’"><input className={fieldClass} maxLength={50} value={input.subject} onChange={event => patch({ subject: event.target.value })} /></Field>

      <div className="grid grid-cols-2 gap-3"><ScoreField label="Overall score" value={input.overallScore} onChange={value => patch({ overallScore: value })} /><ScoreField label="Potential" value={input.potentialScore} onChange={value => patch({ potentialScore: value })} /></div>
      <div className="grid gap-3 rounded-2xl bg-[#f7f8f9] p-4 sm:grid-cols-[1fr_110px]">
        <Field label="Strongest feature"><input className={fieldClass} maxLength={40} value={input.strongestFeature} onChange={event => patch({ strongestFeature: event.target.value })} /></Field>
        <ScoreField label="Score" value={input.strongestScore} onChange={value => patch({ strongestScore: value })} />
        <Field label="Main opportunity"><input className={fieldClass} maxLength={40} value={input.opportunityFeature} onChange={event => patch({ opportunityFeature: event.target.value })} /></Field>
        <ScoreField label="Score" value={input.opportunityScore} onChange={value => patch({ opportunityScore: value })} />
      </div>
      <Field label="Actionable recommendation" hint="Constructive, specific, no guaranteed outcome"><textarea className={`${fieldClass} min-h-24 py-3`} maxLength={360} value={input.recommendation} onChange={event => patch({ recommendation: event.target.value })} /></Field>

      <fieldset><legend className="mb-2 text-sm font-semibold">Mogging features to advertise</legend><div className="grid grid-cols-2 gap-2">{moggingFeatureOptions.map(option => {
        const active = input.productFeatures.includes(option)
        return <button key={option} type="button" aria-pressed={active} onClick={() => patch({ productFeatures: active ? input.productFeatures.filter(item => item !== option) : [...input.productFeatures, option] })} className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-xs font-medium transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]', active ? 'creator-choice-selected' : 'border-zinc-200 bg-white text-zinc-600')}><span className={cn('grid size-4 shrink-0 place-items-center rounded-full border', active ? 'border-transparent bg-[#00A8EF] text-white' : 'border-zinc-300')}>{active ? <Check className="size-2.5" /> : null}</span>{option}</button>
      })}</div></fieldset>
      <Field label="Final CTA"><input className={fieldClass} maxLength={90} value={input.cta} onChange={event => patch({ cta: event.target.value })} /></Field>
      <Button className="h-12 rounded-full" onClick={generate}><RefreshCw className="size-4" />Generate post plan</Button>
      <p className="text-[11px] leading-5 text-zinc-400">This creates editorial content, not a clinical assessment. Verify scores and claims against the final Mogging report before publishing.</p>
    </section>

    <section className="grid min-w-0 gap-4 xl:sticky xl:top-24">
      <div className="overflow-hidden rounded-[28px] bg-[#0d0e10] text-white shadow-[0_24px_80px_rgba(0,0,0,0.14)]">
        <div className="relative aspect-[16/8] overflow-hidden border-b border-white/10">
          {photo ? <Image src={photo.dataUrl} alt="Selected face for the analysis post" fill unoptimized sizes="(max-width: 1280px) 100vw, 50vw" className="object-cover opacity-55 grayscale" /> : null}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300"><Sparkles className="size-3" />{plan.formatLabel} · {plan.duration}s</div><h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">{plan.title}</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/60">{plan.strategy}</p></div>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="flex rounded-xl bg-white/[0.06] p-1" role="tablist" aria-label="Post plan view">{(['storyboard', 'script'] as const).map(option => <button key={option} type="button" role="tab" aria-selected={view === option} onClick={() => setView(option)} className={cn('min-h-9 rounded-lg px-3 text-xs font-semibold capitalize', view === option ? 'bg-white text-black' : 'text-white/55')}>{option}</button>)}</div>
          <span className="flex items-center gap-1.5 text-[11px] text-white/45"><Clock3 className="size-3.5" />{plan.scenes.length} beats</span>
        </div>

        {view === 'storyboard' ? <ol className="max-h-[620px] overflow-y-auto p-3 sm:p-4">{plan.scenes.map((item, index) => <li key={item.id} className="grid grid-cols-[58px_1fr] gap-3 border-b border-white/[0.07] px-2 py-4 last:border-0">
          <div><span className="font-mono text-[10px] text-cyan-300">{time(item.start)}</span><span className="mt-1 block text-[9px] text-white/30">to {time(item.end)}</span></div>
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-white/65">{index + 1}</span><h3 className="text-sm font-semibold">{item.label}</h3><span className={cn('ml-auto rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide', item.pace === 'hold' ? 'bg-amber-300/10 text-amber-200' : 'bg-cyan-300/10 text-cyan-200')}>{item.pace}</span></div>
            <p className="mt-2 text-xs leading-5 text-white/55">{item.visual}</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">On screen</span><p className="mt-1 text-sm font-semibold text-white/90">{item.onScreen}</p></div>
          </div>
        </li>)}</ol> : <div className="max-h-[620px] overflow-y-auto p-5 sm:p-6"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-white/75">{analysisPostScript(plan)}</p></div><div className="mt-4 rounded-2xl bg-white/[0.06] p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-300">Caption</p><p className="mt-2 text-xs leading-5 text-white/65">{plan.caption}</p></div></div>}
      </div>

      <div className="creator-surface grid gap-3 p-4 sm:grid-cols-2">
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => void copy(analysisPostScript(plan), 'Script')}><Copy className="size-4" />Copy script</Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => void copy(analysisPostBrief(plan), 'Production brief')}><FileText className="size-4" />Copy full brief</Button>
        <button type="button" onClick={onOpenMockReport} className="flex min-h-12 items-center justify-between rounded-xl bg-zinc-100 px-4 text-left text-xs font-semibold text-zinc-700 transition-transform duration-150 active:scale-[0.98]">Build report screens<ChevronRight className="size-4" /></button>
        <button type="button" onClick={onOpenAssets} className="flex min-h-12 items-center justify-between rounded-xl bg-black px-4 text-left text-xs font-semibold text-white transition-transform duration-150 active:scale-[0.98]">Create CTA assets<ChevronRight className="size-4" /></button>
      </div>
    </section>
  </div></div>
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label} hint="0–10"><input aria-label={label} className={fieldClass} type="number" inputMode="decimal" min={0} max={10} step={0.1} value={value} onChange={event => onChange(event.target.value === '' ? '' : String(Math.min(10, Math.max(0, Number(event.target.value)))))} /></Field>
}
