import { useRef, useState } from 'react'
import type { measureLandmarks } from '@/lib/analysis-v2/measurements'

type Result = ReturnType<typeof measureLandmarks>
type Detection = Awaited<ReturnType<typeof import('@/lib/analysis-v2/detector').detectV2Landmarks>>

export default function AnalysisV2Lab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [sample, setSample] = useState(false)
  const [benchmark, setBenchmark] = useState<Awaited<ReturnType<typeof import('@/lib/analysis-v2/evaluator').evaluateV2>> | null>(null)
  const [benchmarkBusy, setBenchmarkBusy] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [detection, setDetection] = useState<Detection | null>(null)

  async function analyze(src: string) {
    setBusy(true)
    setSample(src === '/model.png')
    setBenchmark(null)
    setError('')
    setResult(null)
    setDetection(null)
    try {
      const image = new Image()
      image.src = src
      await image.decode()
      const { detectV2Landmarks } = await import('@/lib/analysis-v2/detector')
      const detected = await detectV2Landmarks(image)
      const response = await fetch('/api/experimental/analysis-v2/landmarks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: image.naturalWidth, height: image.naturalHeight, points: detected.points }),
      })
      if (!response.ok) throw new Error('The isolated measurement endpoint could not process this mesh.')
      const measured: Result = await response.json()
      const element = canvas.current
      const context = element?.getContext('2d')
      if (element && context) {
        element.width = image.naturalWidth
        element.height = image.naturalHeight
        context.drawImage(image, 0, 0)
        context.fillStyle = '#00A8EF'
        for (const point of detected.points) {
          context.beginPath()
          context.arc(point.x * element.width, point.y * element.height, Math.max(1, element.width / 420), 0, Math.PI * 2)
          context.fill()
        }
      }
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      setDetection(detected)
      setResult(measured)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Detection failed.')
    } finally {
      setBusy(false)
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }

  async function benchmarkSample() {
    if (!sample || !detection) return
    setBenchmarkBusy(true)
    setError('')
    try {
      const response = await fetch('/api/experimental/analysis-v2/sample-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dimensions, points: detection.points }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Benchmark failed')
      setBenchmark(body)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Benchmark failed') }
    finally { setBenchmarkBusy(false) }
  }

  return <main className="mx-auto max-w-6xl px-5 py-10 text-zinc-900">
    <p className="text-xs font-semibold uppercase tracking-widest text-sky-500">Development only · analysis v2</p>
    <h1 className="mt-3 text-4xl font-semibold tracking-tight">Landmark lab</h1>
    <p className="mt-3 max-w-2xl text-zinc-500">Inspect the dense mesh before we build the next report. Landmark detection keeps photos in your browser; only coordinates go to the local measurement endpoint. No reports are saved or customer credits used. The optional sample LLM benchmark is separate.</p>
    <div className="my-6 flex flex-wrap items-center gap-3">
      <button disabled={busy || benchmarkBusy} onClick={() => void analyze('/model.png')} className="rounded-full bg-sky-500 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Detecting…' : 'Analyze example'}</button>
      <label className="rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || benchmarkBusy} className="sr-only" onChange={event => {
        const file = event.currentTarget.files?.[0]
        if (file) void analyze(URL.createObjectURL(file))
        event.currentTarget.value = ''
      }} /></label>
      <span className="text-xs text-zinc-400">One face · front-on · neutral expression</span>
    </div>
    {sample && result && <div className="mb-6 rounded-xl border border-zinc-200 p-4">
      <button disabled={busy || benchmarkBusy} onClick={() => void benchmarkSample()} className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">{benchmarkBusy ? 'Evaluating three parallel batches…' : 'Benchmark sample with Moonshot'}</button>
      <p className="mt-2 text-xs text-zinc-500">Sends only the bundled example photo and its measurements to our existing Moonshot provider. Normal API charges apply. Experimental raw rubrics; no saved report or user credits.</p>
      {benchmark && <details className="mt-4 text-sm"><summary>{benchmark.entries.length} rubrics · {(benchmark.timing.totalMs / 1000).toFixed(1)}s provider processing · {benchmark.timing.totalMs <= 30000 ? 'under' : 'over'} 30s target</summary><p className="my-2 text-xs text-zinc-500">Timing excludes upload, saved-report persistence and mobile navigation. Grades remain unset. LLM estimates still need accuracy and consistency review.</p><div className="max-h-80 space-y-2 overflow-auto">{benchmark.entries.map(entry => <p key={entry.id}><strong>{entry.id}</strong> · {entry.value === null ? 'Unavailable' : Array.isArray(entry.value) ? entry.value.map(value => value.toFixed(2)).join(' / ') : typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value} <span className="text-zinc-400">{entry.source} · {entry.evidence}</span></p>)}</div></details>}
    </div>}
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>}
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200">
        <canvas ref={canvas} aria-label="Photo with detected landmark overlay" className={`h-auto w-full ${result ? '' : 'hidden'}`} />
        {!result && <div className="flex min-h-64 items-center justify-center bg-zinc-50 text-sm text-zinc-400">{busy ? 'Loading detector and measuring…' : 'Your landmark mesh appears here'}</div>}
        {result && <div className="space-y-2 p-5 text-xs text-zinc-500">
          <p>{detection?.points.length} landmarks · {result.quality.pupilSource} · roll {result.quality.rollDegrees.toFixed(1)}°</p>
          {result.quality.warnings.map(warning => <p key={warning}>{warning}</p>)}
        </div>}
      </section>
      <section>
        <h2 className="text-xl font-semibold">Approximate geometry</h2>
        <p className="mt-2 text-sm text-zinc-500">Ratios use pixel-correct distances. Angles compensate for image roll. These are measurements, not aesthetic grades.</p>
        {result ? <div className="mt-4 divide-y divide-zinc-100">{result.metrics.map(metric => <div key={metric.id} className="py-3">
          <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium">{metric.label}</span><span className="text-lg tabular-nums">{metric.value === null ? 'Unavailable' : `${metric.value.toFixed(2)}${metric.unit === 'degrees' ? '°' : metric.unit === '%' ? '%' : '×'}`}</span></div>
          <p className="mt-1 text-xs text-zinc-400">{metric.method}</p>
        </div>)}</div> : <p className="mt-6 text-sm text-zinc-400">Analyze a photo to inspect 18 candidate measurements.</p>}
        {detection && <details className="mt-6 rounded-xl border border-zinc-200 p-4 text-sm"><summary className="cursor-pointer font-medium">Detector evidence</summary>
          <p className="mt-3 text-xs text-zinc-500">Expression signals help identify blinking, smiling, or an open mouth before trusting affected measurements. They are detector outputs, not validated quality thresholds.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">{detection.blendshapes.filter(shape => shape.score > 0.1).sort((a, b) => b.score - a.score).map(shape => <p key={shape.categoryName}>{shape.categoryName} <span className="text-zinc-400">{shape.score.toFixed(2)}</span></p>)}</div>
          <p className="mt-3 text-xs text-zinc-500">Pose matrix: {detection.transformation ? `${detection.transformation.rows} × ${detection.transformation.columns} available for the next pose gate` : 'unavailable'}</p>
        </details>}
      </section>
    </div>
  </main>
}

export function getServerSideProps() {
  return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
}
