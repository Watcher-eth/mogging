import Image from 'next/image'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { categoryScoreMax, type ContentSlide, type GeneratorImage, type SlideTemplateId } from '@/lib/creator/content-generator'
import { createReportOverlay, drawReportOverlay } from '@/lib/creator/report-overlay'
import { ScoreRevealPreview } from './score-reveal-preview'

type Size = { width: number; height: number }

export function ContentSlidePreview({ slide, images, format }: { slide: ContentSlide; images: GeneratorImage[]; format: Size }) {
  const image = images.find((item) => item.id === slide.imageId && item.status === 'ready')
  if (slide.templateId === 'cta') {
    return <ScoreRevealPreview slide={slide} image={image} format={format} />
  }
  return (
    <div className="cta-template-enter [container-type:inline-size] relative w-full overflow-hidden bg-[#09090b] text-white shadow-[0_24px_80px_rgba(0,0,0,0.2)]" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
      {image ? <div className="absolute inset-0"><Image alt="Creator upload" className="object-cover object-center" fill priority sizes="(min-width:1024px) 45cqw,100vw" src={image.dataUrl} unoptimized /></div> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/95" />
      {image ? <CanonicalOverlay slide={slide} image={image} annotationMode="score" /> : null}
      <TemplateContent slide={slide} />
    </div>
  )
}

function TemplateContent({ slide }: { slide: ContentSlide }) {
  const templates: Record<SlideTemplateId, ReactNode> = {
    editorial: <EditorialTemplate slide={slide} />,
    'score-potential': <ScorePotentialTemplate slide={slide} />,
    psl: <PslTemplate slide={slide} />,
    'score-rows': <ScoreRowsTemplate slide={slide} />,
    cta: null,
  }
  return templates[slide.templateId] ?? templates.editorial
}

function EditorialTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow={slide.eyebrow} template="Editorial"><div className="absolute inset-x-[7%] bottom-[6%]"><MetricRail slide={slide} /><h2 className="cta-template-item max-w-[92%] text-[clamp(24px,6.2cqw,68px)] font-semibold leading-[0.94] tracking-[-0.065em] [animation-delay:1050ms]">{slide.headline}</h2><p className="cta-template-item mt-[4%] max-w-[82%] text-[clamp(9px,2cqw,20px)] leading-[1.45] text-white/68 [animation-delay:1220ms]">{slide.supportingCopy}</p></div></TemplateFrame>
}

function ScorePotentialTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Active category" template="Current + potential"><div className="cta-template-item absolute left-[7%] top-[9%] bg-white px-[4%] py-[2.2%] font-mono text-[clamp(9px,2.1cqw,20px)] font-semibold uppercase tracking-[0.14em] text-black [animation-delay:760ms]">{slide.metricLabel}</div><div className="absolute inset-x-[5%] bottom-[5%] grid grid-cols-2 gap-[2%]"><ScoreCard label="Current" value={slide.currentScore} accent="white" delay={1050} /><ScoreCard label="Potential" value={slide.potentialScore} accent="cyan" delay={1200} /></div></TemplateFrame>
}

function PslTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Mogging face report" template="PSL"><div className="cta-template-item absolute inset-x-[7%] top-[7%] flex items-center justify-center gap-[4%] [animation-delay:720ms]"><span className="grid size-[clamp(36px,10cqw,92px)] place-items-center border-2 border-white font-mono text-[clamp(12px,3cqw,30px)] font-bold">M</span><h2 className="text-[clamp(40px,12cqw,118px)] font-black leading-none tracking-[-0.07em]">PSL</h2></div><div className="absolute inset-x-[5%] bottom-[5%] overflow-hidden rounded-[clamp(16px,4cqw,36px)] border border-white/30 bg-black/70 backdrop-blur-md"><div className="grid grid-cols-2 divide-x divide-white/20"><ScoreCard label="PSL" value={slide.currentScore} accent="lime" delay={1020} borderless /><ScoreCard label="Potential" value={slide.potentialScore} accent="cyan" delay={1180} borderless /></div></div></TemplateFrame>
}

function ScoreRowsTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Selected values" template="Scorecard"><div className="absolute inset-x-[5%] bottom-[4%] rounded-[clamp(16px,4cqw,36px)] border border-white/20 bg-black/78 p-[5%] backdrop-blur-md"><div className="cta-template-item mb-[4%] flex items-end justify-between [animation-delay:760ms]"><div><p className="font-mono text-[clamp(7px,1.6cqw,14px)] uppercase tracking-[0.14em] text-white/45">Overall</p><p className="mt-1 text-[clamp(32px,9cqw,88px)] font-semibold leading-none tracking-[-0.06em]">{displayScore(slide.currentScore)}</p></div><div className="text-right"><p className="font-mono text-[clamp(7px,1.6cqw,14px)] uppercase tracking-[0.14em] text-white/45">Potential</p><p className="mt-1 text-[clamp(32px,9cqw,88px)] font-semibold leading-none tracking-[-0.06em] text-cyan-300">{displayScore(slide.potentialScore)}</p></div></div><div className="grid gap-[clamp(8px,2cqw,18px)]" style={slide.categoryScores.length > 8 ? { gap: '1cqw' } : undefined}>{slide.categoryScores.map((score, index) => <ScoreRow key={score.categoryId} label={score.label} value={score.value} maximum={categoryScoreMax(score.categoryId)} delay={920 + index * 60} />)}</div></div></TemplateFrame>
}

function TemplateFrame({ eyebrow, template, children }: { eyebrow: string; template: string; children: ReactNode }) {
  return <div className="absolute inset-0"><div className="cta-template-item absolute inset-x-[7%] top-[4%] flex items-center justify-between font-mono text-[clamp(7px,1.5cqw,12px)] uppercase tracking-[0.16em] text-white/75 [animation-delay:580ms]"><span>{eyebrow}</span><span>[ {template} ]</span></div>{children}</div>
}

function MetricRail({ slide }: { slide: ContentSlide }) {
  return <div className="cta-template-item mb-[4%] flex items-center gap-2 font-mono text-[clamp(7px,1.45cqw,11px)] uppercase tracking-[0.13em] text-white/65 [animation-delay:900ms]"><span>{slide.metricLabel}</span><span className="h-px flex-1 bg-white/25" /><span>{slide.metricValue}</span></div>
}

function ScoreCard({ label, value, accent, delay, borderless = false }: { label: string; value: string; accent: 'white' | 'cyan' | 'lime'; delay: number; borderless?: boolean }) {
  const accentClass = accent === 'cyan' ? 'bg-cyan-300' : accent === 'lime' ? 'bg-lime-400' : 'bg-white'
  return <div className={`cta-template-item bg-black/72 p-[9%] backdrop-blur-md ${borderless ? '' : 'rounded-[clamp(14px,3cqw,30px)] border border-white/25'}`} style={{ animationDelay: `${delay}ms` }}><p className="font-mono text-[clamp(8px,1.9cqw,17px)] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p><p className="mt-[8%] text-[clamp(34px,10cqw,96px)] font-semibold leading-none tracking-[-0.07em]">{displayScore(value)}</p><ScoreBar value={value} accentClass={accentClass} /></div>
}

function ScoreRow({ label, value, delay, maximum }: { label: string; value: string; delay: number; maximum: number }) {
  return <div className="cta-template-item grid grid-cols-[minmax(68px,0.45fr)_1fr_auto] items-center gap-[3%]" style={{ animationDelay: `${delay}ms` }}><span className="truncate text-[clamp(9px,2cqw,19px)] font-medium">{label}</span><div className="h-[clamp(5px,1.3cqw,12px)] overflow-hidden rounded-full bg-white/18"><div className="cta-score-bar-fill h-full origin-left rounded-full bg-white" style={{ '--cta-score-ratio': scoreRatio(value, maximum), animationDelay: `${delay + 150}ms` } as CSSProperties} /></div><span className="whitespace-nowrap text-right font-mono text-[clamp(9px,2cqw,19px)] font-semibold">{displayScore(value)}/{maximum}</span></div>
}

function ScoreBar({ value, accentClass }: { value: string; accentClass: string }) {
  return <div className="mt-[10%] h-[clamp(5px,1.3cqw,12px)] overflow-hidden rounded-full bg-white/18"><div className={`cta-score-bar-fill h-full origin-left rounded-full ${accentClass}`} style={{ '--cta-score-ratio': scoreRatio(value), animationDelay: '1450ms' } as CSSProperties} /></div>
}

function CanonicalOverlay({ slide, image, annotationMode }: { slide: ContentSlide; image: GeneratorImage; annotationMode: 'score' | 'hidden' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const start = performance.now()
    const resize = () => {
      cancelAnimationFrame(frame)
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const overlay = createReportOverlay(slide, image, { width, height })
      const draw = () => {
        const elapsed = motion.matches ? 4000 : Math.min(4000, performance.now() - start)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        drawReportOverlay(ctx, overlay, width, elapsed, annotationMode === 'score')
        if (elapsed < 4000) frame = requestAnimationFrame(draw)
      }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    motion.addEventListener('change', resize)
    resize()
    return () => { observer.disconnect(); motion.removeEventListener('change', resize); cancelAnimationFrame(frame) }
  }, [slide, image, annotationMode])
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
}

function displayScore(value: string) { return value.trim() || '—' }
function scoreRatio(value: string, maximum = 10) { const score = Number(value); return Number.isFinite(score) ? Math.max(0, Math.min(1, score / maximum)) : 0 }
