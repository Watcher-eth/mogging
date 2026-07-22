import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { ContentSlide, GeneratorImage, SlideTemplateId } from '@/lib/creator/content-generator'
import { getOverlayPreset } from '@/lib/creator/content-generator'
import { resolveOverlayPreset, type ResolvedPrimitive } from '@/lib/creator/mobile-overlay-engine/resolve'

type Size = { width: number; height: number }

export function ContentSlidePreview({ slide, images, format }: { slide: ContentSlide; images: GeneratorImage[]; format: Size }) {
  const image = images.find((item) => item.id === slide.imageId) ?? images[0]
  return (
    <div className="cta-template-enter relative w-full overflow-hidden bg-[#09090b] text-white shadow-[0_24px_80px_rgba(0,0,0,0.2)]" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
      {image ? <div className="absolute inset-0"><Image alt="Creator upload" className="object-cover object-center" fill priority sizes="(min-width:1024px) 45vw,100vw" src={image.dataUrl} unoptimized /></div> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/95" />
      {image ? <CanonicalOverlay slide={slide} image={image} /> : null}
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
    cta: <CtaTemplate slide={slide} />,
  }
  return templates[slide.templateId] ?? templates.editorial
}

function EditorialTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow={slide.eyebrow} template="Editorial"><div className="absolute inset-x-[7%] bottom-[6%]"><MetricRail slide={slide} /><h2 className="cta-template-item max-w-[92%] text-[clamp(24px,6.2vw,68px)] font-semibold leading-[0.94] tracking-[-0.065em] [animation-delay:1050ms]">{slide.headline}</h2><p className="cta-template-item mt-[4%] max-w-[82%] text-[clamp(9px,2vw,20px)] leading-[1.45] text-white/68 [animation-delay:1220ms]">{slide.supportingCopy}</p></div></TemplateFrame>
}

function ScorePotentialTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Active category" template="Current + potential"><div className="cta-template-item absolute left-[7%] top-[9%] bg-white px-[4%] py-[2.2%] font-mono text-[clamp(9px,2.1vw,20px)] font-semibold uppercase tracking-[0.14em] text-black [animation-delay:760ms]">{slide.metricLabel}</div><div className="absolute inset-x-[5%] bottom-[5%] grid grid-cols-2 gap-[2%]"><ScoreCard label="Current" value={slide.currentScore} accent="white" delay={1050} /><ScoreCard label="Potential" value={slide.potentialScore} accent="cyan" delay={1200} /></div></TemplateFrame>
}

function PslTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Mogging face report" template="PSL"><div className="cta-template-item absolute inset-x-[7%] top-[7%] flex items-center justify-center gap-[4%] [animation-delay:720ms]"><span className="grid size-[clamp(36px,10vw,92px)] place-items-center border-2 border-white font-mono text-[clamp(12px,3vw,30px)] font-bold">M</span><h2 className="text-[clamp(40px,12vw,118px)] font-black leading-none tracking-[-0.07em]">PSL</h2></div><div className="absolute inset-x-[5%] bottom-[5%] overflow-hidden rounded-[clamp(16px,4vw,36px)] border border-white/30 bg-black/70 backdrop-blur-md"><div className="grid grid-cols-2 divide-x divide-white/20"><ScoreCard label="PSL" value={slide.currentScore} accent="lime" delay={1020} borderless /><ScoreCard label="Potential" value={slide.potentialScore} accent="cyan" delay={1180} borderless /></div></div></TemplateFrame>
}

function ScoreRowsTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow="Selected values" template="Scorecard"><div className="absolute inset-x-[5%] bottom-[4%] rounded-[clamp(16px,4vw,36px)] border border-white/20 bg-black/78 p-[5%] backdrop-blur-md"><div className="cta-template-item mb-[4%] flex items-end justify-between [animation-delay:760ms]"><div><p className="font-mono text-[clamp(7px,1.6vw,14px)] uppercase tracking-[0.14em] text-white/45">Overall</p><p className="mt-1 text-[clamp(32px,9vw,88px)] font-semibold leading-none tracking-[-0.06em]">{displayScore(slide.currentScore)}</p></div><div className="text-right"><p className="font-mono text-[clamp(7px,1.6vw,14px)] uppercase tracking-[0.14em] text-white/45">Potential</p><p className="mt-1 text-[clamp(32px,9vw,88px)] font-semibold leading-none tracking-[-0.06em] text-cyan-300">{displayScore(slide.potentialScore)}</p></div></div><div className="grid gap-[clamp(8px,2vw,18px)]">{slide.categoryScores.map((score, index) => <ScoreRow key={score.categoryId} label={score.label} value={score.value} delay={920 + index * 90} />)}</div></div></TemplateFrame>
}

function CtaTemplate({ slide }: { slide: ContentSlide }) {
  return <TemplateFrame eyebrow={slide.eyebrow} template="CTA"><div className="absolute inset-x-[7%] bottom-[7%]"><div className="cta-template-item mb-[5%] grid size-[clamp(42px,11vw,104px)] place-items-center bg-white font-mono text-[clamp(16px,4vw,38px)] font-black text-black [animation-delay:820ms]">M</div><h2 className="cta-template-item max-w-[92%] text-[clamp(28px,7vw,76px)] font-semibold leading-[0.94] tracking-[-0.065em] [animation-delay:1000ms]">{slide.headline}</h2><p className="cta-template-item mt-[4%] max-w-[78%] text-[clamp(9px,2vw,20px)] leading-[1.45] text-white/65 [animation-delay:1160ms]">{slide.supportingCopy}</p><div className="cta-template-item mt-[6%] inline-flex bg-white px-[5%] py-[3%] font-mono text-[clamp(8px,1.7vw,14px)] font-semibold uppercase tracking-[0.12em] text-black [animation-delay:1320ms]">Open Mogging →</div></div></TemplateFrame>
}

function TemplateFrame({ eyebrow, template, children }: { eyebrow: string; template: string; children: ReactNode }) {
  return <div className="absolute inset-0"><div className="cta-template-item absolute inset-x-[7%] top-[4%] flex items-center justify-between font-mono text-[clamp(7px,1.5vw,12px)] uppercase tracking-[0.16em] text-white/75 [animation-delay:580ms]"><span>{eyebrow}</span><span>[ {template} ]</span></div>{children}</div>
}

function MetricRail({ slide }: { slide: ContentSlide }) {
  return <div className="cta-template-item mb-[4%] flex items-center gap-2 font-mono text-[clamp(7px,1.45vw,11px)] uppercase tracking-[0.13em] text-white/65 [animation-delay:900ms]"><span>{slide.metricLabel}</span><span className="h-px flex-1 bg-white/25" /><span>{slide.metricValue}</span></div>
}

function ScoreCard({ label, value, accent, delay, borderless = false }: { label: string; value: string; accent: 'white' | 'cyan' | 'lime'; delay: number; borderless?: boolean }) {
  const accentClass = accent === 'cyan' ? 'bg-cyan-300' : accent === 'lime' ? 'bg-lime-400' : 'bg-white'
  return <div className={`cta-template-item bg-black/72 p-[9%] backdrop-blur-md ${borderless ? '' : 'rounded-[clamp(14px,3vw,30px)] border border-white/25'}`} style={{ animationDelay: `${delay}ms` }}><p className="font-mono text-[clamp(8px,1.9vw,17px)] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p><p className="mt-[8%] text-[clamp(34px,10vw,96px)] font-semibold leading-none tracking-[-0.07em]">{displayScore(value)}</p><ScoreBar value={value} accentClass={accentClass} /></div>
}

function ScoreRow({ label, value, delay }: { label: string; value: string; delay: number }) {
  return <div className="cta-template-item grid grid-cols-[minmax(68px,0.45fr)_1fr_auto] items-center gap-[3%]" style={{ animationDelay: `${delay}ms` }}><span className="truncate text-[clamp(9px,2vw,19px)] font-medium">{label}</span><div className="h-[clamp(5px,1.3vw,12px)] overflow-hidden rounded-full bg-white/18"><div className="h-full origin-left rounded-full bg-white" style={{ transform: `scaleX(${scoreRatio(value)})` }} /></div><span className="w-[2ch] text-right font-mono text-[clamp(9px,2vw,19px)] font-semibold">{displayScore(value)}</span></div>
}

function ScoreBar({ value, accentClass }: { value: string; accentClass: string }) {
  return <div className="mt-[10%] h-[clamp(5px,1.3vw,12px)] overflow-hidden rounded-full bg-white/18"><div className={`h-full origin-left rounded-full ${accentClass}`} style={{ transform: `scaleX(${scoreRatio(value)})` }} /></div>
}

function CanonicalOverlay({ slide, image }: { slide: ContentSlide; image: GeneratorImage }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => { const element = containerRef.current; if (!element) return; const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect() }, [])
  const overlay = useMemo(() => viewport.width && viewport.height ? resolveOverlayPreset({ preset: getOverlayPreset(slide), landmarks: image.landmarks as FaceLandmarksPayload, viewport, imageSize: { width: image.width, height: image.height }, fit: 'cover' }) : null, [image, slide, viewport])
  return <div ref={containerRef} className="pointer-events-none absolute inset-0">{overlay ? <ResolvedOverlay primitives={overlay.primitives} viewport={viewport} footer={overlay.footer} /> : null}</div>
}

function ResolvedOverlay({ primitives, viewport, footer }: { primitives: ResolvedPrimitive[]; viewport: Size; footer: string }) {
  const drawings = primitives.filter((primitive) => primitive.kind !== 'label')
  const labels = primitives.filter((primitive): primitive is Extract<ResolvedPrimitive, { kind: 'label' }> => primitive.kind === 'label')
  return <><svg className="absolute inset-0 size-full" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">{drawings.map((primitive) => <OverlayPrimitive key={primitive.id} primitive={primitive} />)}</svg>{labels.map((label) => <OverlayLabel key={label.id} label={label} viewport={viewport} />)}{footer ? <span className="cta-template-item absolute bottom-3 left-3 bg-white/85 px-2.5 py-1.5 font-mono text-[9px] font-semibold text-zinc-500 [animation-delay:1450ms]">{footer}</span> : null}</>
}

function OverlayPrimitive({ primitive }: { primitive: Exclude<ResolvedPrimitive, Extract<ResolvedPrimitive, { kind: 'label' }>> }) {
  const animationStyle = { animationDelay: `${primitive.animation?.delay ?? 0}ms`, animationDuration: `${primitive.animation?.duration ?? 760}ms` } as CSSProperties
  const common = { stroke: `rgba(255,255,255,${primitive.kind === 'point' ? 0.72 : primitive.opacity ?? 0.72})`, strokeWidth: primitive.kind === 'point' ? 1 : primitive.strokeWidth ?? 0.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none', strokeDasharray: primitive.kind !== 'point' && primitive.dashed ? '1.7 3.8' : undefined }
  if (primitive.kind === 'point') return <g className="cta-overlay-point" style={animationStyle}><circle cx={primitive.point.x} cy={primitive.point.y} r={primitive.radius ?? 10} fill="rgba(255,255,255,0.16)" /><circle cx={primitive.point.x} cy={primitive.point.y} r={primitive.radius ?? 10} {...common} strokeDasharray="2.1 3.8" /><circle cx={primitive.point.x} cy={primitive.point.y} r="2.2" fill="rgba(255,255,255,0.96)" /></g>
  if (primitive.kind === 'line') return <line className={primitive.dashed ? 'cta-overlay-fade' : 'cta-overlay-draw'} pathLength="1" x1={primitive.fromPoint.x} y1={primitive.fromPoint.y} x2={primitive.toPoint.x} y2={primitive.toPoint.y} {...common} style={animationStyle} />
  if (primitive.kind === 'box') { const { x, y, width, height } = primitive.rect; if (primitive.cornerOnly) return <path className={primitive.dashed ? 'cta-overlay-fade' : 'cta-overlay-draw'} pathLength="1" d={cornerPath(x, y, width, height, Math.max(4, Math.min(width, height) * (primitive.cornerLength ?? 0.18)))} {...common} fill={primitive.fillOpacity ? `rgba(255,255,255,${primitive.fillOpacity})` : 'none'} style={animationStyle} />; return <rect className="cta-overlay-fade" x={x} y={y} width={width} height={height} rx={primitive.radius ?? 0} {...common} fill={primitive.fillOpacity ? `rgba(255,255,255,${primitive.fillOpacity})` : 'none'} style={animationStyle} /> }
  const points = primitive.pixelPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const closed = primitive.kind === 'region' || (primitive.kind === 'polyline' && primitive.closed)
  return closed ? <polygon className="cta-overlay-fade" points={points} {...common} fill={primitive.kind === 'region' ? `rgba(255,255,255,${primitive.fillOpacity ?? 0.08})` : 'none'} style={animationStyle} /> : <polyline className={primitive.dashed ? 'cta-overlay-fade' : 'cta-overlay-draw'} pathLength="1" points={points} {...common} style={animationStyle} />
}

function OverlayLabel({ label, viewport }: { label: Extract<ResolvedPrimitive, { kind: 'label' }>; viewport: Size }) {
  const width = 118, height = 44, outsideOffset = width * 0.28, side = label.align === 'right' || (label.align !== 'left' && label.point.x >= viewport.width / 2) ? 'right' : 'left', centerDeadZone = viewport.width * 0.26, edgeLeft = side === 'right' ? viewport.width - width + outsideOffset : -outsideOffset, centerLimitLeft = side === 'right' ? viewport.width / 2 + centerDeadZone / 2 : viewport.width / 2 - centerDeadZone / 2 - width, alignedLeft = side === 'right' ? Math.max(edgeLeft, centerLimitLeft) : Math.min(edgeLeft, centerLimitLeft), left = label.align ? clamp(alignedLeft, -outsideOffset, Math.max(-outsideOffset, viewport.width - width + outsideOffset)) : clamp(label.point.x, 10, Math.max(10, viewport.width - width - 10)), top = label.align ? clamp(label.point.y - height * 0.36, 10, Math.max(10, viewport.height - height - 10)) : clamp(label.point.y, 10, Math.max(10, viewport.height - height - 10))
  return <div className="cta-template-item absolute grid gap-[3px] font-mono text-[10px] font-semibold uppercase leading-[13px]" style={{ left, top, animationDelay: `${label.animation?.delay ?? 0}ms`, animationDuration: `${label.animation?.duration ?? 720}ms` }}><span className="w-fit bg-white/80 px-2 py-1 text-zinc-500">{label.title}</span>{label.value ? <span className="w-fit bg-white/80 px-2 py-1 text-black">{label.value}</span> : null}</div>
}

function displayScore(value: string) { return value.trim() || '—' }
function scoreRatio(value: string) { const score = Number(value); return Number.isFinite(score) ? Math.max(0, Math.min(1, score / 10)) : 0 }
function cornerPath(x: number, y: number, width: number, height: number, length: number) { return `M ${x} ${y + length} L ${x} ${y} L ${x + length} ${y} M ${x + width - length} ${y} L ${x + width} ${y} L ${x + width} ${y + length} M ${x + width} ${y + height - length} L ${x + width} ${y + height} L ${x + width - length} ${y + height} M ${x + length} ${y + height} L ${x} ${y + height} L ${x} ${y + height - length}` }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
