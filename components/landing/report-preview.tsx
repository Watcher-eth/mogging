import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { Pause, Play, ChevronDown, X, Check, ChartNoAxesColumn, ScanFace, Eye, Waves, Triangle, Ruler, Sparkles, Ear, AlignCenter, Spline, Smile } from 'lucide-react'
import { reportGlassInk } from '@/lib/creator/report-glass'
import styles from './report-preview.module.css'
import { reportCategories, buildMockOverallCategory } from '@/lib/creator/mock-report-data'
import { drawMockReport, drawReportComponent, mockReportRegions, mockReportScrollMax, mockReportSize, mockReportFormat } from '@/lib/creator/mock-report'
import { createCanvasPainter } from '@/lib/creator/canvas-layout'
import { prepareCanvas } from '@/lib/creator/export-slides'
import { nativeReportEntry, sampleReportTour, reportInstrumentIsVisible } from '@/lib/creator/report-tour'
import type { ContentSlide, GeneratorImage } from '@/lib/creator/content-generator'
import { previewLandmarks, previewPortrait } from './overlay'

const images: GeneratorImage[] = [{ id: 'example-portrait', name: 'Example portrait', dataUrl: previewPortrait.src, width: previewPortrait.width, height: previewPortrait.height,
  landmarks: { ...previewLandmarks, source: 'apple-vision' }, status: 'ready' }]
const categories = [...reportCategories].sort((a, b) => a.id === 'overall' ? -1 : b.id === 'overall' ? 1 : 0)
const categoryIcons: Record<string, typeof ScanFace> = { overall: ChartNoAxesColumn, eyes: Eye, brows: Waves, nose: Triangle, mouth: Smile, jaw: Spline, proportions: Ruler, symmetry: AlignCenter, skin: Sparkles, hair: Waves, ears: Ear }
function CategoryIcon({ id }: { id: string }) { const Icon = categoryIcons[id] ?? ScanFace; return <Icon size={16} /> }
type Prepared = Awaited<ReturnType<typeof prepareCanvas>>

export function ReportPreview({ active, startAt = 0 }: { active: boolean; startAt?: number }) {
  const [categoryId, setCategoryId] = useState('overall')
  const [playing, setPlaying] = useState(true)
  const [scroll, setScroll] = useState(0)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null), popout = useRef<HTMLCanvasElement>(null), scroller = useRef<HTMLDivElement>(null)
  const clock = useRef(startAt), autoplay = useRef(true)
  const entries = useRef(new Map<string, number>())
  const animationTime = useRef(0)
  const ownership = useRef<{ id: string; lift: number; returnFrom?: number; returnElapsed?: number } | null>(null)
  const menu = useRef<HTMLDetailsElement>(null), close = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()
  const category = useMemo(() => categoryId === 'overall' ? buildMockOverallCategory('7.2', {}) : reportCategories.find(item => item.id === categoryId)!, [categoryId])
  const slide = useMemo<ContentSlide>(() => ({ id: 'homepage-report', templateId: 'mock-report', imageId: images[0].id, categoryId,
    currentScore: '7.2', potentialScore: '8.5', categoryScores: [], mockReport: { category, scroll: 0 }, eyebrow: '', headline: '', supportingCopy: '', metricLabel: category.title, metricValue: String(category.score), cta: '' }), [category, categoryId])
  const maximum = useMemo(() => mockReportScrollMax(category), [category])

  useEffect(() => { autoplay.current = true; setPlaying(true); setCategoryId('overall'); setScroll(0) }, [startAt])
  useEffect(() => {
    setPortal(scroller.current?.closest('[data-preview-device]')?.querySelector<HTMLElement>('[data-preview-popout]') ?? null)
  }, [])
  useEffect(() => {
    let disposed = false
    setError(null); clock.current = startAt; entries.current.clear(); ownership.current = null
    void prepareCanvas({ slide, images, ...mockReportFormat }).then(value => { if (!disposed) setPrepared(value) })
      .catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load the report.') })
    return () => { disposed = true }
  }, [slide, startAt])

  useEffect(() => {
    const context = canvas.current?.getContext('2d'), floating = popout.current?.getContext('2d')
    if (!context || !prepared) return
    const regions = mockReportRegions(context, category)
    let lastContrast = -Infinity
    let frame = 0, previous = performance.now(), cycle = Math.floor(clock.current / sampleReportTour(clock.current, regions, maximum).duration)
    const draw = (now: number) => {
      cancelAnimationFrame(frame)
      const delta = Math.min(50, now - previous)
      if (active && !document.hidden && !reduced) animationTime.current += delta
      if (playing && active && !document.hidden && !reduced) clock.current += delta
      previous = now
      const tour = sampleReportTour(clock.current, regions, maximum)
      if (tour.cycle !== cycle) { entries.current.clear(); cycle = tour.cycle }
      const position = reduced || !playing ? scroll : tour.scroll
      if (canvas.current) { canvas.current.dataset.reportSection = playing && !reduced ? tour.region.id : 'manual'; canvas.current.dataset.reportScroll = String(Math.round(position)); canvas.current.dataset.running = String(Boolean(playing && active && !reduced)) }
      if (playing && !reduced && scroller.current) scroller.current.scrollTop = position
      const bounds = scroller.current?.getBoundingClientRect()
      const deviceScale = (bounds?.width ?? 390) / 390
      const viewportTop = Math.max(104, -(bounds?.top ?? 0) / deviceScale)
      const viewportBottom = Math.min(734, (window.innerHeight - (bounds?.top ?? 0)) / deviceScale)
      let entering = false
      const progress = (id: string, top: number) => {
        if (reduced) return 1
        const region = regions.find(item => item.id === id)
        const height = region ? Math.max(40, region.height - 100) : 120
        const chartTop = top + (id.startsWith('feature:') ? 50 : 0)
        if (active && !entries.current.has(id) && reportInstrumentIsVisible(chartTop, height, position, viewportTop, viewportBottom)) entries.current.set(id, animationTime.current)
        const started = entries.current.get(id)
        if (started === undefined) return 0
        const elapsed = animationTime.current - started
        if (elapsed < 1200) entering = true
        return nativeReportEntry(elapsed)
      }
      const actionState = (_text: string, index: number) => ({ reveal: reduced || !playing ? 1 : nativeReportEntry(tour.elapsed - 1500 - index * 150), checked: tour.region.id === 'action-plan' && index === 0 && playing ? nativeReportEntry(tour.elapsed - 2900) : 0 })
      const current = { ...slide, mockReport: { category, scroll: position } }
      if (playing && !reduced) ownership.current = tour.region.id === 'hero' ? null : { id: tour.region.id, lift: tour.lift }
      else if (ownership.current) {
        ownership.current.returnFrom ??= ownership.current.lift
        ownership.current.returnElapsed = (ownership.current.returnElapsed ?? 0) + delta
        ownership.current.lift = ownership.current.returnFrom * (1 - nativeReportEntry(ownership.current.returnElapsed))
        if (ownership.current.returnElapsed >= 1200) ownership.current = null
      }
      const owner = ownership.current, region = owner ? regions.find(item => item.id === owner.id) : undefined
      const lift = owner?.lift ?? 0
      // The focused node has exactly one renderer for the entire lift and return.
      const paint = createCanvasPainter(node => region && floating && node.id === region.id ? { opacity: 0 } : {})
      drawMockReport(context, current, prepared.image, prepared.overlay, mockReportFormat.width, mockReportFormat.height, reduced ? 4000 : clock.current, {
        paint, cull: true, regions, interactiveChrome: true, metricProgress: reduced ? 1 : nativeReportEntry(animationTime.current),
        growthProgress: progress('potential', regions.find(region => region.id === 'potential')!.y),
        featureProgress: progress, actionState: tour.region.id === 'action-plan' ? actionState : undefined,
      })
      if (canvas.current && (now - lastContrast > 120)) {
        const summary = menu.current?.querySelector('summary')
        if (summary) (summary as HTMLElement).dataset.ink = reportGlassInk(canvas.current, { x: 18, y: 61, width: (summary as HTMLElement).offsetWidth, height: 38 })
        if (close.current) close.current.dataset.ink = reportGlassInk(canvas.current, { x: 344, y: 61, width: 38, height: 38 })
        lastContrast = now
      }
      if (floating) {
        floating.clearRect(0, 0, 2600, mockReportFormat.height)
        if (region) {
          const available = (window.innerWidth - 32) / deviceScale
          const targetWidth = Math.min(region.width < 200 ? 330 : 440, available, 480 / region.height * region.width)
          const scale = targetWidth / region.width
          const origin = { ...region, x: region.x + 130, y: region.y - position }
          const target = { x: 130 + (390 - targetWidth) / 2, y: 420 - region.height * scale / 2, width: targetWidth, height: region.height * scale }
          const mix = (from: number, to: number) => from + (to - from) * lift
          const destination = { x: mix(origin.x, target.x), y: mix(origin.y, target.y), width: mix(origin.width, target.width), height: mix(origin.height, target.height) }
          floating.save(); floating.scale(4, 4)
          floating.beginPath(); floating.rect(mix(130, 0), mix(104, 0), mix(390, 650), mix(656, 844)); floating.clip()
          const spotlight = createCanvasPainter(node => node.id === region.id ? { ...(region.id === 'action-plan' ? {} : { beam: { amount: lift, phase: clock.current / 3200 } }) } : node.id === `${region.id}/surface` ? { shadow: { color: '#18202b24', blur: 22 * lift, y: 14 * lift } } : {})
          drawReportComponent(floating, current, region, destination, progress(region.id, region.y), spotlight, region.id === 'action-plan' ? actionState : undefined)
          floating.restore()
        }
      }
      if ((playing || entering || ownership.current) && active && !document.hidden && !reduced) frame = requestAnimationFrame(draw)
    }
    const visibility = () => { previous = performance.now(); draw(previous) }
    draw(previous); document.addEventListener('visibilitychange', visibility); window.addEventListener('scroll', visibility, { passive: true }); window.addEventListener('resize', visibility)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('scroll', visibility); window.removeEventListener('resize', visibility); floating?.clearRect(0, 0, 2600, mockReportFormat.height) }
  }, [prepared, slide, category, maximum, playing, scroll, active, reduced, portal])

  function pause() { autoplay.current = false; setScroll(scroller.current?.scrollTop ?? 0); setPlaying(false) }
  function selectCategory(value: string) { pause(); setCategoryId(value); setScroll(0); if (scroller.current) scroller.current.scrollTop = 0 }
  function toggleTour() { if (playing) pause(); else { clock.current = 0; autoplay.current = true; setPlaying(true) } }

  return <>
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none]" onWheel={pause} onTouchStart={pause}
      onScroll={event => { if (!autoplay.current) setScroll(event.currentTarget.scrollTop) }}>
      <div style={{ height: mockReportSize.height + maximum }}><div className="sticky top-0 h-[844px]">
        <canvas ref={canvas} width={mockReportFormat.width} height={mockReportFormat.height} role="img" aria-label={`Interactive ${category.title} evaluation. Current score 7.2, potential 8.5.`} className="block h-[844px] w-[390px]" />
        <details ref={menu} className={styles.menu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }} onToggle={event => { if (event.currentTarget.open) pause() }} onKeyDown={event => { if (event.key === 'Escape' && menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus() } }}>
          <summary aria-label={`Preview report category: ${category.title}`} className={styles.glass}>
            <CategoryIcon id={categoryId} /><span>{category.title}</span><ChevronDown size={13} />
          </summary>
          <div className={`${styles.glass} ${styles.options}`} role="group" aria-label="Report categories">
            {categories.map(item => <button key={item.id} type="button" onClick={() => { selectCategory(item.id); if (menu.current) menu.current.open = false }} aria-pressed={categoryId === item.id}>
              <CategoryIcon id={item.id} /><span>{item.title}</span>{categoryId === item.id ? <Check size={14} /> : null}
            </button>)}
          </div>
        </details>
        <button ref={close} type="button" aria-label="Close report preview" className={`${styles.glass} ${styles.close}`} onClick={() => { pause(); scroller.current?.closest('[data-preview-device]')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' }) }}><X size={17} /></button>
        {!reduced ? <button type="button" aria-label={playing ? 'Pause report tour' : 'Play report tour'} onClick={toggleTour} className="absolute bottom-[96px] right-[18px] flex h-9 items-center gap-1.5 rounded-full border border-black/5 bg-white/90 px-3 text-xs text-zinc-600 shadow-sm backdrop-blur-sm active:scale-95">
          {playing ? <Pause size={12} /> : <Play size={12} />}{playing ? 'Pause tour' : 'Play tour'}
        </button> : null}
        {error ? <p role="alert" className="absolute inset-x-6 top-32 text-sm">{error}</p> : null}
      </div></div>
    </div>
    {portal ? createPortal(<canvas ref={popout} width={2600} height={mockReportFormat.height} aria-hidden="true" className="pointer-events-none absolute left-[-130px] top-0 h-[844px] w-[650px]" />, portal) : null}
  </>
}
