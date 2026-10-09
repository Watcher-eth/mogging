import { AnimatePresence, motion } from 'motion/react'
import { Share2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { ReportImagePanel } from './report-image-panel'

export type DesktopReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  score: number
  features: Array<{ label: string; value: string; measurement?: string }>
  explanation?: string
  eyeColor?: string
  hairColor?: string
  overlayPreset?: OverlayPreset | null
  faceMapPointCount?: number
}

export function AnalysisReport({ categories, initialCategoryId, imageSrc, landmarks, score, pslScore, children, renderDetails, naturalImage = false }: {
  categories: DesktopReportCategory[]
  initialCategoryId?: string
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  score: number
  pslScore?: number | null
  children: ReactNode
  naturalImage?: boolean
  renderDetails?: (category: DesktopReportCategory) => ReactNode
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId ?? categories[0]?.id)
  const activeCategory = categories.find(category => category.id === activeCategoryId) ?? categories[0]
  if (!activeCategory) return null
  const overlayValue = activeCategory.id === 'overall'
    ? pslScore == null ? undefined : `${pslScore.toFixed(1)} / 8`
    : `${activeCategory.score.toFixed(1)} / 10`

  return (
    <div className="grid min-h-[calc(100svh-5rem)] gap-8 px-5 py-6 sm:px-10 sm:py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:justify-between lg:gap-20 xl:gap-28">
      <aside className="flex flex-col justify-between bg-white p-0 text-black lg:sticky lg:top-24 lg:min-h-[calc(100svh-9rem)]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Final analysis //</p>
          <h2 className="mt-3 text-5xl font-semibold leading-none tracking-[-0.06em]">Your Report</h2>
          <div className="mt-6 grid gap-1.5">
            {categories.map((category, index) => {
              const isActive = category.id === activeCategory.id
              const categoryTitle = category.title

              return (
                <button
                  key={category.id}
                  aria-pressed={isActive}
                  className={`group grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wide transition-colors duration-300 ${
                    isActive ? 'bg-black text-white' : 'text-muted-foreground hover:bg-zinc-100 hover:text-black'
                  }`}
                  onClick={() => setActiveCategoryId(category.id)}
                  type="button"
                >
                  <span>[ {String(index + 1).padStart(3, '0')} ]</span>
                  <span>{categoryTitle}</span>
                  <span className={isActive ? 'text-white/55' : 'text-black/25'}>{category.id === 'overall' ? score.toFixed(1) : ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="hidden lg:grid">{children}</div>
      </aside>

      <section className="grid gap-4 lg:min-h-[calc(100svh-9rem)] lg:gap-6">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,0.98fr)_minmax(280px,0.72fr)] lg:items-stretch">
          <ReportImagePanel
            key={imageSrc}
            category={activeCategory}
            imageSrc={imageSrc}
            landmarks={landmarks}
            value={overlayValue}
          />
          {renderDetails ? renderDetails(activeCategory) : <ReportDetailPanel category={activeCategory} />}
        </div>
      </section>

      <div className="lg:hidden">{children}</div>
    </div>
  )
}

export function ReportActions({
  battleOptOut,
  battleOptOutSaving,
  onBattleOptOutChange,
  onOpenShare,
  onReset,
  score,
}: {
  battleOptOut: boolean
  battleOptOutSaving: boolean
  onBattleOptOutChange: (optOut: boolean) => void
  onOpenShare: () => void
  onReset: () => void
  score: number
}) {
  return (
    <div className="grid gap-3">
      <GradedScoreSlab score={score} />
      <button
        className="flex h-12 w-full items-center justify-between bg-black px-4 font-mono text-[11px] uppercase tracking-wide text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0"
        onClick={onOpenShare}
        type="button"
      >
        Share report
        <Share2 className="size-4" aria-hidden="true" />
      </button>
      <label className="flex items-start gap-3 border border-zinc-200 px-3 py-3 text-xs leading-5 text-zinc-500">
        <input
          checked={!battleOptOut}
          className="mt-0.5 size-4 shrink-0 accent-black"
          disabled={battleOptOutSaving}
          onChange={(event) => onBattleOptOutChange(!event.target.checked)}
          type="checkbox"
        />
        <span>Make my image public in the battle arena and leaderboard</span>
      </label>
      <button
        className="h-10 text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-black"
        onClick={onReset}
        type="button"
      >
        New analysis
      </button>
    </div>
  )
}

function GradedScoreSlab({ score }: { score: number }) {
  const serial = String(Math.round(score * 10_000)).padStart(6, '0')

  return (
    <div
      aria-label={`Mogging overall grade ${score.toFixed(1)} out of 10`}
      className="report-grade-slab relative isolate overflow-hidden rounded-[18px] border border-zinc-200 bg-[#f8fbf8] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.06),inset_0_0_0_1px_rgba(255,255,255,0.9)]"
    >
      <span className="report-grade-foil pointer-events-none absolute -inset-y-1 -left-1/2 z-20 w-[210%]" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-[3px] z-10 rounded-[11px] border border-white/80 shadow-[inset_0_0_18px_rgba(255,255,255,0.9)]" aria-hidden="true" />
      <div className="relative z-0 grid min-h-28 grid-cols-[minmax(0,1fr)_84px] divide-x divide-zinc-300 border border-zinc-300 bg-[#f6faf6]/95">
        <div className="grid content-between gap-3 p-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Mogging facial report</p>
            <p className="mt-1 text-sm font-bold uppercase leading-tight tracking-[-0.02em] text-black">Overall grade</p>
          </div>
          <div className="flex items-end justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
            <span>Verified analysis</span>
            <span>#{serial}</span>
          </div>
        </div>
        <div className="grid place-items-center bg-white/55 p-2 text-center">
          <div>
            <span className="block text-4xl font-semibold leading-none tracking-[-0.06em] text-black">{score.toFixed(1)}</span>
            <span className="mt-2 block font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">/ 10</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportDetailPanel({ category }: { category: DesktopReportCategory }) {
  const { features } = category
  const explanation = category.explanation
    ?? `${category.title} is scored from visible proportions, local symmetry, and how the feature fits the full facial frame.`

  return (
    <div className="grid h-full gap-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={category.id}
          className="grid h-full grid-rows-[auto_1fr_auto] gap-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
        >
      <ReportCategoryHeader category={category} />

      {category.id === 'eyes' && category.eyeColor && <ReportColorPalette color={category.eyeColor} />}

      <div className="grid grid-cols-2 gap-3">
        {features.map((feature, index) => (
          <motion.div
            key={`${category.id}-${feature.label}`}
            className="flex min-h-0 flex-col justify-between border bg-zinc-50 p-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.07, duration: 0.46, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{feature.label}</p>
            <div className="pt-10">
              {feature.measurement && <p className="font-mono text-sm tabular-nums text-muted-foreground">{feature.measurement}</p>}
              <p className="text-xl font-semibold tracking-[-0.04em]">{feature.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="border bg-white p-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38, duration: 0.52, ease: [0.23, 1, 0.32, 1] }}
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p>
        <p className="mt-10 text-sm leading-6 text-muted-foreground">
          {explanation}
        </p>
      </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const eyePalette = [
  { name: 'blue', hex: '#3974b9' },
  { name: 'gray', hex: '#8996a1' },
  { name: 'green', hex: '#5a9458' },
  { name: 'hazel', hex: '#827c4d' },
  { name: 'amber', hex: '#ae813f' },
  { name: 'brown', hex: '#745b42' },
  { name: 'dark brown', hex: '#3f322c' },
] as const

const hairPalette = [
  { name: 'black', hex: '#242020' }, { name: 'brown', hex: '#74523c' },
  { name: 'blond', hex: '#ceb37c' }, { name: 'red', hex: '#a65735' },
  { name: 'gray', hex: '#a6a5a2' }, { name: 'other', hex: '#b4a6b3' },
] as const

export function ReportColorPalette({ color, kind = 'eye', ribbon = false }: { color: string; kind?: 'eye' | 'hair'; ribbon?: boolean }) {
  const palette = kind === 'eye' ? eyePalette : hairPalette
  const selected = palette.find((shade) => shade.name === color.toLowerCase())
  if (!selected) return null
  const shades = [...palette.filter((shade) => shade !== selected).slice(0, 3), selected, ...palette.filter((shade) => shade !== selected).slice(3)]

  const ribbonStops = kind === 'eye' ? [
    { name: 'blue', hex: '#467eb5' }, { hex: '#80b4cc' }, { name: 'gray', hex: '#94a7ab' },
    { hex: '#799a86' }, { name: 'green', hex: '#64865a' }, { hex: '#8f945e' },
    { name: 'hazel', hex: '#8d8050' }, { hex: '#b19a5e' }, { name: 'amber', hex: '#b08142' },
    { hex: '#987044' }, { name: 'brown', hex: '#745b42' }, { hex: '#594132' }, { name: 'dark brown', hex: '#352820' },
  ] : [
    { name: 'black', hex: '#242020' }, { hex: '#3b2c25' }, { hex: '#5b3d2b' },
    { name: 'brown', hex: '#74523c' }, { hex: '#986849' }, { name: 'red', hex: '#ae593b' },
    { hex: '#c68a58' }, { hex: '#cba36b' }, { name: 'blond', hex: '#d4b980' },
    { hex: '#e2d0a8' }, { hex: '#d2cabe' }, { name: 'gray', hex: '#aaa9a5' }, { name: 'other', hex: '#c4b3c8' },
  ]
  const selectedPosition = ribbonStops.findIndex(shade => shade.name === selected.name) / (ribbonStops.length - 1) * 100
  const gradient = `linear-gradient(90deg,${ribbonStops.map((shade, index) => `${shade.hex} ${index / (ribbonStops.length - 1) * 100}%`).join(',')})`

  return <div className="border bg-white p-4" aria-label={`${kind === 'eye' ? 'Eye' : 'Hair'} color: ${selected.name}`}>
    <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{kind === 'eye' ? 'Eye color' : 'Hair color'}</p>
      <p className="text-sm font-semibold capitalize">{selected.name}</p>
    </div>
    {ribbon ? <div className="relative mt-6 h-[29px] rounded-sm border border-black/5" style={{ background: gradient }} aria-hidden="true">
      <span className="absolute inset-0 rounded-sm" style={{ background: 'linear-gradient(180deg,#ffffff50,transparent 65%,#ffffff20)' }} />
      <span className="absolute -top-1 -bottom-1 w-3 -translate-x-1/2 rounded-md border border-white/60 bg-white/20 shadow-[inset_0_1px_3px_#ffffff99,0_2px_6px_#00000018] backdrop-blur-md" style={{ left: `clamp(8px,${selectedPosition}%,calc(100% - 8px))` }}><span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-black/60" /></span>
    </div> : <div className="mt-4 flex h-16 items-center justify-center gap-1.5" aria-hidden="true">
      {shades.map((shade) => <span key={shade.name} className="min-w-0 flex-1 rounded-sm" style={{ height: shade === selected ? 64 : 46, backgroundColor: shade.hex }} />)}
    </div>}
  </div>
}

export function ReportCategoryHeader({ category, simplified = false }: { category: DesktopReportCategory; simplified?: boolean }) {
  const { title, subtitle, scoreLabel, score } = category
  if (simplified) return <div className="border bg-white p-5"><div className="flex items-baseline justify-between gap-4"><h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{category.id === 'overall' ? scoreLabel : title}</h3><span className="text-4xl font-semibold leading-none tabular-nums tracking-[-0.055em]">{score.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ 10</span></span></div></div>
  return (
      <div className="border bg-white p-5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{scoreLabel}</p>
        <div className="mt-14 flex items-end justify-between">
          <h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{title}</h3>
          <span className="font-mono text-xl">{score.toFixed(1)} <span className="text-[10px] uppercase text-muted-foreground">/ {10}</span></span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>
  )
}
