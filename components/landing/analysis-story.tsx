import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { Check, ArrowUpRight } from 'lucide-react'
import { MetricTimeline, type TimelineAxis } from '@/components/analysis/v2/metric-timeline'
import NumberFlow from '@number-flow/react'
import { reportCategories } from '@/lib/creator/mock-report-data'
import { preciseFaceOverlay, drawFaceTreatment } from '@/lib/creator/face-treatment'
import { drawReportPortrait, drawReportPortraitFade } from '@/lib/creator/report-portrait'
import { nativeMetricHeight, drawNativeReportMetric } from '@/lib/creator/native-report-metric'
import { timelineStyle } from '@/lib/creator/mobile-report-geometry'
import { nativeReportEntry } from '@/lib/creator/report-tour'
import type { ReportFeature } from '@/lib/creator/mobile-overlay-engine/report-data'
import { previewLandmarks, previewPortrait } from './overlay'
import portrait from './primer-portrait.json'
import styles from './analysis-story.module.css'

function feature(category: string, id: string) {
  return reportCategories.find(item => item.id === category)!.features.find(item => item.id === id)!
}
const texture = feature('skin', 'skin.texture')
const examples = [
  { id: 'skin', title: 'Skin', feature: { ...texture, label: 'Skin texture', value: `${texture.grade!.toFixed(1)} / 10` }, narration: 'Skin texture', context: 'Texture, tone and visible detail. A clearer picture of where to focus your routine.', task: 'Build a consistent skin routine', detail: 'Gently cleanse, moisturize and use daily sun protection.' },
  { id: 'brows', title: 'Brows', feature: feature('brows', 'brows.tilt'), narration: 'Brow tilt', context: 'See how your brows sit, and how their shape frames your eyes.', task: 'Work with your natural brow shape', detail: 'Brush into place and tidy stray hairs outside the natural outline.' },
  { id: 'jaw', title: 'Jaw & chin', feature: feature('jaw', 'jaw.height'), narration: 'Jaw and chin', context: 'Understand the lower face, with structure and presentation kept in perspective.', task: 'Keep your grooming consistent', detail: 'Follow your natural cheek and jaw lines for a clean finish.' },
]
const points = portrait.anchors
const cheekWidth = points.rightCheek.x - points.leftCheek.x
export const measurementExamples = [
  { category: 'eyes', title: 'Eye spacing', narration: 'Pupil spacing', feature: { ...feature('eyes', 'eyes.spacing'), value: `${((points.rightPupil.x - points.leftPupil.x) / cheekWidth).toFixed(2)}×`, positions: [(points.rightPupil.x - points.leftPupil.x) / cheekWidth] }, description: 'The distance between your pupils, relative to the width across your cheeks.', reference: 'Pupil distance / cheek width' },
  { category: 'eyes', title: 'Eye opening', narration: 'Upper and lower eyelids', feature: feature('eyes', 'eyes.opening'), description: 'The vertical opening of each eye, shown separately for the left and right sides.', reference: 'Left and right eye opening' },
  { category: 'jaw', title: 'Jaw width', narration: 'Jaw width', feature: { ...feature('jaw', 'jaw.width'), value: `${((points.jawRight.x - points.jawLeft.x) / cheekWidth).toFixed(2)}×`, positions: [(points.jawRight.x - points.jawLeft.x) / cheekWidth] }, description: 'Jaw width compared with the cheek width above it. One proportion, with the reference points in view.', reference: 'Jaw width / cheek width' },
]

// One entry clock for the portrait overlays and native instruments. It pauses
// outside the viewport and never invents movement after a measurement settles.
function useVisibleCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, elapsed: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null), elapsed = useRef(0)
  const visible = useInView(ref, { amount: .35 }), reduced = useReducedMotion()
  useEffect(() => { elapsed.current = 0 }, [draw])
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = Math.round(width * 3); canvas.height = Math.round(height * 3)
    let frame = 0, last = performance.now()
    function paint(now: number) {
      cancelAnimationFrame(frame)
      if (visible && !document.hidden) elapsed.current += Math.min(50, now - last)
      last = now
      ctx!.setTransform(3, 0, 0, 3, 0, 0); ctx!.clearRect(0, 0, width, height)
      draw(ctx!, reduced ? 4000 : elapsed.current)
      if (visible && !document.hidden && !reduced && elapsed.current < 2400) frame = requestAnimationFrame(paint)
    }
    const resume = () => { last = performance.now(); paint(last) }
    resume(); document.addEventListener('visibilitychange', resume)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resume) }
  }, [draw, width, height, visible, reduced])
  return ref
}

export function ReportPortraitDemo({ category, narration }: { category: string; narration: string }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let disposed = false
    const photo = new window.Image(); photo.src = previewPortrait.src
    void photo.decode().then(() => { if (!disposed) setImage(photo) }).catch(() => {})
    return () => { disposed = true }
  }, [])
  const overlay = useMemo(() => preciseFaceOverlay({ size: { width: 390, height: 520 }, primitives: [], dots: [] }, { ...portrait.image, landmarks: previewLandmarks }, category, narration, category === 'skin'), [category, narration])
  const draw = useCallback((ctx: CanvasRenderingContext2D, elapsed: number) => {
    if (!image) return
    drawReportPortrait(ctx, image, 390, 520)
    drawFaceTreatment(ctx, overlay, 390, elapsed)
    drawReportPortraitFade(ctx, 390, 520)
  }, [image, overlay])
  const ref = useVisibleCanvas(390, 520, draw)
  return <div className={styles.portrait}><canvas ref={ref} role="img" aria-label={`Example portrait with ${narration.toLowerCase()} mapped using the app’s face overlays`} /><span>Eric, 27 NYC</span></div>
}

export function ReportMetricDemo({ metric, axis }: { metric: ReportFeature; axis?: TimelineAxis }) {
  const [position, setPosition] = useState(metric.positions?.[0] ?? .5)
  const reduced = useReducedMotion()
  const width = 324, height = nativeMetricHeight(metric, width)
  const draw = useCallback((ctx: CanvasRenderingContext2D, elapsed: number) => drawNativeReportMetric(ctx, metric, 0, 0, width, height, nativeReportEntry(elapsed)), [metric, height])
  const ref = useVisibleCanvas(width, height, draw)
  const dial = timelineStyle(metric.id ?? '', metric.label, metric.visual === 'Orbit') === 'dial'
  return <div className={styles.instrument} data-interactive={Boolean(axis)}>
    <span className={styles.metricLabel}>{metric.label}</span>
    <div className={styles.desktopChart}><MetricTimeline key={metric.id} kind={metric.visual ?? 'Text'} positions={axis ? [position] : metric.positions ?? []} grade={metric.grade ?? null} scale={metric.scale} label={metric.label} axis={axis} onPositionChange={axis ? setPosition : undefined} /></div>
    <div className={styles.mobileChart} data-dial={dial}><canvas ref={ref} style={{ aspectRatio: `${width}/${height}` }} aria-hidden="true" />{dial ? <strong>{metric.value}</strong> : null}</div>
    <strong className={styles.metricValue} data-mobile-dial={dial}>{axis ? <NumberFlow value={axis.minimum + position * (axis.maximum - axis.minimum)} format={{ minimumFractionDigits: axis.digits, maximumFractionDigits: axis.digits }} suffix={axis.unit} animated={!reduced} transformTiming={{ duration: 180, easing: 'ease-out' }} spinTiming={{ duration: 180, easing: 'ease-out' }} /> : metric.value}</strong>
  </div>
}

export function AnalysisStory() {
  const [selected, setSelected] = useState(0), [measurement, setMeasurement] = useState(0)
  const [completed, setCompleted] = useState<string[]>([])
  const reduced = useReducedMotion(), example = examples[selected], metric = measurementExamples[measurement]
  const checked = completed.includes(example.id)
  const entrance = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .5, ease: [.16, 1, .3, 1] as [number, number, number, number] } }
  return <>
    <m.section {...entrance} data-landing-section="how_it_works" aria-labelledby="story-title" className={styles.section}>
      <header className={styles.intro}><p className={styles.eyebrow}>HOW MOGGING WORKS</p><h2 id="story-title">Understand your features.<br />Find your next step.</h2><p>A closer look. A clear finding. Something you can act on.</p></header>
      <div className={styles.story}>
        <ReportPortraitDemo category={example.id} narration={example.narration} />
        <div className={styles.finding}>
          <div className={styles.tabs} role="tablist" aria-label="Explore a feature">{examples.map((item, index) => <button key={item.id} id={`feature-tab-${item.id}`} type="button" role="tab" aria-selected={selected === index} aria-controls="feature-story" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? examples.length - 1 : (selected + (event.key === 'ArrowRight' ? 1 : -1) + examples.length) % examples.length; setSelected(next); document.getElementById(`feature-tab-${examples[next].id}`)?.focus() } }}>{item.title}</button>)}</div>
          <div role="tabpanel" id="feature-story" aria-labelledby={`feature-tab-${example.id}`}>
            <ReportMetricDemo metric={example.feature} />
            <p className={styles.context}>{example.context}</p>
            <div className={styles.action}><p className={styles.eyebrow}>YOUR NEXT STEP <ArrowUpRight size={13} /></p><button type="button" aria-pressed={checked} onClick={() => setCompleted(current => checked ? current.filter(id => id !== example.id) : [...current, example.id])}><span className={styles.checkbox}>{checked ? <Check size={15} /> : null}</span><span><strong>{example.task}</strong><span>{example.detail}</span></span></button><small>{checked ? 'A small step, checked off.' : 'Try checking off a step in your Protocol.'}</small></div>
          </div>
        </div>
      </div>
    </m.section>
    <m.section {...entrance} data-landing-section="measurement_proof" aria-labelledby="measurement-title" className={`${styles.section} ${styles.proofSection}`}>
      <header className={styles.intro}><p className={styles.eyebrow}>LOOK CLOSER</p><h2 id="measurement-title">Every measurement.<br />A little more context.</h2><p>See the points and proportions behind your report.</p></header>
      <div className={styles.measurements} role="group" aria-label="Explore a measurement">{measurementExamples.map((item, index) => <button key={item.title} type="button" aria-pressed={measurement === index} onClick={() => setMeasurement(index)}>{item.title}</button>)}</div>
      <div className={styles.proof}>
        <div className={styles.proofFinding}><ReportMetricDemo metric={metric.feature} /><p className={styles.context}>{metric.description}</p><p className={styles.reference}>{metric.reference}</p></div>
        <ReportPortraitDemo category={metric.category} narration={metric.narration} />
      </div>
    </m.section>
  </>
}
