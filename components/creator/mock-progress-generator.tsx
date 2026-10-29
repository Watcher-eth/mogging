import { useState } from 'react'
import { Download, Film, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from './creator-shell'
import { ProgressPreview } from './progress-preview'
import { drawMockProgress, sampleProgress, mockProgressScrollMax } from '@/lib/creator/mock-progress'

export function MockProgressGenerator() {
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries([
    ['overall', String(sampleProgress.score)], ...sampleProgress.metrics.map(metric => [metric.id, String(metric.score)]),
  ]))
  const [date, setDate] = useState(sampleProgress.date)
  const [scroll, setScroll] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const score = (id: string) => Math.max(0, Math.min(10, Number(scores[id]) || 0))
  const data = { ...sampleProgress, date, scroll, score: score('overall'), metrics: sampleProgress.metrics.map(metric => ({ ...metric, score: score(metric.id) })) }
  const valid = Object.values(scores).every(value => value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10)
  const updateScroll = (value: number) => setScroll(Math.max(0, Math.min(mockProgressScrollMax, value)))

  async function exportProgress(video: boolean) {
    if (progress !== null || !valid) return
    setProgress(0)
    try {
      const { downloadBlob, encodeCanvasMp4 } = await import('@/lib/creator/export-slides')
      await document.fonts.ready
      const canvas = document.createElement('canvas')
      canvas.width = 1170
      canvas.height = 2532
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the export.')
      const draw = (time: number) => drawMockProgress(context, data, canvas.width, canvas.height, time)
      draw(1200)
      const blob = video
        ? await encodeCanvasMp4(canvas, draw, 4000, setProgress)
        : await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png'))
      downloadBlob(blob, `mogging-progress.${video ? 'mp4' : 'png'}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the progress screen.')
    } finally { setProgress(null) }
  }

  function scoreInput(id: string, label: string) {
    return <Field key={id} label={label}>
      <input type="number" inputMode="decimal" min={0} max={10} step={0.1} className={fieldClass} value={scores[id]}
        onChange={event => setScores(current => ({ ...current, [id]: event.target.value }))} />
    </Field>
  }

  return <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,390px)]">
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Mock Progress</h2>
        <p className="mt-2 text-sm text-zinc-500">The current app dashboard, with editable example scores. Export a screenshot or animated video.</p>
      </div>
      {scoreInput('overall', 'Overall score')}
      <Field label="Last evaluation"><input className={fieldClass} maxLength={30} value={date} onChange={event => setDate(event.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">{sampleProgress.metrics.map(metric => scoreInput(metric.id, `${metric.title} score`))}</div>
      <Field label="Scroll position"><input aria-label="Scroll progress screen" type="range" className="w-full accent-black" min={0} max={mockProgressScrollMax} value={scroll} onChange={event => updateScroll(Number(event.target.value))} /></Field>
      <p className="text-xs text-zinc-400">Example data only. No saved reports or customer analytics are changed.</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!valid || progress !== null} onClick={() => void exportProgress(false)}><Download size={16} />PNG</Button>
        <Button variant="outline" disabled={!valid || progress !== null} onClick={() => void exportProgress(true)}>
          {progress !== null ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
          MP4{progress !== null ? ` · ${Math.round(progress * 100)}%` : ''}
        </Button>
      </div>
    </div>
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[36px] border border-white/10 bg-[#050607] shadow-xl">
      <ProgressPreview data={data} onScroll={updateScroll} />
    </div>
  </section>
}
