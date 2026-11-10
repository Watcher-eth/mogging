import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChevronLeft, ChevronRight, ScanFace, Share, Share2 } from '@/components/ui/mogging-glyphs'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { TextMorph } from 'torph/react'
import { SkeletonBox } from 'skullet/react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { ReportImagePanel } from './report-image-panel'
import { RubricVisual } from './v2/rubric-visual'
import { ReportCategorySelector } from './report-category-selector'
import { ScoreDistribution } from './score-distribution'
import styles from './analysis-report.module.css'

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

export type ReportPortrait = { src: string; landmarks: FaceLandmarksPayload | null; label: string; side?: boolean }

const reportDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const portraitEase = [.22, 1, .36, 1] as const

export function AnalysisReport({ categories, initialCategoryId, imageSrc, landmarks, score, pslScore, potentialScore, mobileScan = false, lockedPreview = false, children, renderDetails, naturalImage = false, embedded = false, portraits = [], portraitLayoutId, heading }:  {
  categories: DesktopReportCategory[]
  initialCategoryId?: string
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  score: number | null
  pslScore?: number | null
  potentialScore?: number | null
  mobileScan?: boolean
  lockedPreview?: boolean
  children: ReactNode
  naturalImage?: boolean
  embedded?: boolean
  portraits?: ReportPortrait[]
  portraitLayoutId?: string
  heading?: { createdAt?: string; number?: number | null }
  renderDetails?: (category: DesktopReportCategory) => ReactNode
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId ?? categories[0]?.id)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [portraitRatio, setPortraitRatio] = useState<{ src: string; ratio: number }>()
  const reducedMotion = useReducedMotion()
  const detailsRef = useRef<HTMLDivElement>(null)
  const continuousDetails = Boolean(heading)
  useEffect(() => {
    if (continuousDetails && detailsRef.current) detailsRef.current.scrollTop = 0
  }, [activeCategoryId, continuousDetails])
  const photos = [{ src: imageSrc, landmarks, label: 'Front', side: false }, ...portraits]
  const photo = photos[photoIndex] ?? photos[0]
  const hasProfileSelector = !mobileScan && photos.length === 2 && photos[1].side
  const activeCategory = categories.find(category => category.id === activeCategoryId) ?? categories[0]
  if (!activeCategory) return null
  const reportNumber = heading?.number
  const title = reportNumber === 1 ? 'Baseline' : reportNumber ? `Baseline #${reportNumber}` : heading ? 'Evaluation' : 'Your Report'
  const desktop = Boolean(heading && !embedded && !mobileScan)
  const primaryRatio = portraitRatio?.src === imageSrc ? portraitRatio.ratio : landmarks?.image ? landmarks.image.width / landmarks.image.height : 9 / 16
  const onPrimaryRatio = desktop ? (ratio: number) => setPortraitRatio(previous => previous?.src === imageSrc && previous.ratio === ratio
    ? previous : { src: imageSrc, ratio }) : undefined
  const overlayValue = score === null ? undefined : activeCategory.id === 'overall'
    ? pslScore == null ? undefined : `${pslScore.toFixed(1)} / 8`
    : `${activeCategory.score.toFixed(1)} / 10`

  return (
    <MotionConfig reducedMotion="user"><div className={embedded ? `${styles.layout} ${styles.embedded}` : styles.layout} data-locked-report-preview={lockedPreview || undefined}
      data-completed-desktop-report={desktop || undefined} style={desktop ? { '--report-portrait-ratio': Math.min(.9, primaryRatio) } as CSSProperties : undefined}>
      {!embedded && <aside className={styles.sidebar}>
        <div>
          {heading?.createdAt ? (
            <time className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground" dateTime={heading.createdAt}>{reportDateFormat.format(new Date(heading.createdAt))}</time>
          ) : !heading && <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{score === null ? 'Report preview //' : 'Final analysis //'}</p>}
          <h2 className={styles.title}>{title}</h2>
          <ReportCategorySelector categories={categories} activeCategory={activeCategory} score={score} onSelect={setActiveCategoryId} />
        </div>

        <div className={styles.sidebarActions}>{children}</div>
      </aside>}

      <section className={styles.stage}>
        <div className={styles.content}>
          <motion.div layoutId={mobileScan ? undefined : portraitLayoutId} className={styles.portraitStage} data-profile-selector={hasProfileSelector || undefined}>
            {hasProfileSelector ? photos.map((portrait) => {
              const active = portrait === photo
              return <div key={`${portrait.label}:${portrait.src}`} className={`${styles.portraitFrame} ${styles.portraitLayer}`}
                data-side={portrait.side || undefined} aria-hidden={!active} inert={!active}>
                <ReportImagePanel category={activeCategory} imageSrc={portrait.src} landmarks={portrait.landmarks}
                  value={portrait.side ? undefined : overlayValue} side={portrait.side} active={active} naturalImage={naturalImage} clearPortrait={embedded}
                  onAspectRatio={portrait === photos[0] ? onPrimaryRatio : undefined} />
              </div>
            }) : <AnimatePresence initial={false} mode="popLayout">
              <motion.div key={photo.src} className={styles.portraitFrame}
                initial={reducedMotion || mobileScan ? false : { opacity: 0, filter: 'blur(5px)', x: 8 }}
                animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(5px)', x: -8 }}
                transition={{ duration: reducedMotion ? 0 : .24, ease: portraitEase }}>
                <ReportImagePanel category={activeCategory} imageSrc={photo.src} landmarks={photo.landmarks}
                  value={photo.side ? undefined : overlayValue} side={photo.side} mobileScan={mobileScan} naturalImage={naturalImage} clearPortrait={embedded} immediateOverlay={lockedPreview && mobileScan}
                  onAspectRatio={photo === photos[0] ? onPrimaryRatio : undefined} />
              </motion.div>
            </AnimatePresence>}
            {hasProfileSelector ? <div className={styles.portraitSegments} data-side={photo.side || undefined} role="group" aria-label="Portrait angle">
              <button type="button" aria-pressed={!photo.side} onClick={() => setPhotoIndex(0)}>
                <ScanFace size={15} strokeWidth={1.7} aria-hidden="true" /> Front
              </button>
              <button type="button" aria-pressed={Boolean(photo.side)} onClick={() => setPhotoIndex(1)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 21v-4c-2.2-1.5-3.5-4-3.5-7A7.5 7.5 0 0 1 12 2.5c3.8 0 6.5 2.7 6.5 6.5l2 3-2.5 1-.4 3a2 2 0 0 1-2 1.7H13V21" />
                  <path d="M14.5 9h.7" />
                </svg> Side
              </button>
            </div> : photos.length > 1 && <div className={styles.portraitSelector} role="group" aria-label="Report photos">
              <button type="button" aria-label="Previous photo" onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)}><ChevronLeft size={16} /></button>
              <span aria-live="polite">{photo.label}</span>
              <button type="button" aria-label="Next photo" onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}><ChevronRight size={16} /></button>
            </div>}
          </motion.div>
          {mobileScan && <motion.div className={styles.scanScores} layout="position"
            initial={lockedPreview || reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .32, delay: .14 }}>
            <div><small>Mogging Score</small><strong data-locked={score === null || undefined}>{score === null ? <LockedScore /> : score.toFixed(1)}</strong><span>/ 10</span></div>
            {(potentialScore != null || score === null) && <div><small>Potential</small><strong data-locked={score === null || undefined}>{potentialScore?.toFixed(1) ?? <LockedScore />}</strong><span>/ 10</span></div>}
          </motion.div>}
          <AnimatePresence initial={false} mode={mobileScan && !lockedPreview ? 'wait' : 'sync'}>
            <motion.div ref={detailsRef} key={continuousDetails ? 'report-details' : activeCategory.id} className={styles.details} role="region" aria-label={`${activeCategory.title} report details`} tabIndex={0}
              initial={mobileScan && !lockedPreview && !reducedMotion ? { opacity: 0, y: 10, filter: 'blur(4px)' } : false}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={mobileScan && !reducedMotion && !lockedPreview ? { opacity: 0, y: -5 } : undefined}
              transition={{ duration: reducedMotion ? 0 : .2, ease: [.23, 1, .32, 1] }}>
              {renderDetails ? renderDetails(activeCategory) : <ReportDetailPanel category={activeCategory} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <div className={styles.footerActions}>{children}</div>
    </div></MotionConfig>
  )
}

function LockedScore() {
  return <><span className="sr-only">Locked score</span><SkeletonBox width="1.6em" height=".67em" radius=".14em" /></>
}

export function ReportActions({
  onOpenShare,
  onReset,
  score,
  potential,
  country,
}: {
  onOpenShare: () => void
  onReset?: () => void
  score: number
  potential?: number | null
  country?: string | null
}) {
  const desktopReport = country !== undefined
  return (
    <div className="grid gap-3">
      <GradedScoreSlab score={score} potential={potential} country={country} />
      <button
        className={`flex h-12 w-full items-center bg-black px-5 text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black ${desktopReport ? 'justify-center gap-2 rounded-xl text-sm font-medium' : 'justify-between rounded-full font-mono text-[11px] uppercase tracking-wide'}`}
        onClick={onOpenShare}
        type="button"
      >
        {desktopReport && <Share className="size-4" aria-hidden="true" />}
        Share report
        {!desktopReport && <Share2 className="size-4" aria-hidden="true" />}
      </button>
      {onReset && <button
        className="flex h-11 w-full items-center justify-between rounded-full border border-zinc-200 bg-white px-5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:bg-zinc-50 hover:text-black active:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
        onClick={onReset}
        type="button"
      >
        New analysis
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>}
    </div>
  )
}

function GradedScoreSlab({ score, potential, country }: { score: number; potential?: number | null; country?: string | null }) {
  const desktopReport = country !== undefined
  const scoreText = score.toFixed(1)
  const label = desktopReport ? 'Score' : 'Overall score'
  return <div aria-label={`${label} ${scoreText} out of 10`} className={desktopReport ? styles.scoreCard : 'rounded-[24px] bg-zinc-50/60 px-5 py-4'}>
    <div className="flex items-baseline justify-between gap-2">
      <p className={desktopReport ? 'text-base font-medium tracking-tight' : 'font-mono text-[10px] uppercase tracking-wide text-zinc-500'}>{label}</p>
      <p className="whitespace-nowrap text-3xl font-normal tabular-nums tracking-tight">{scoreText} <span className="text-xs text-zinc-500">/ 10</span></p>
    </div>
    {desktopReport ? <ScoreDistribution score={score} potential={potential} showSurvey={country === 'US'} />
      : <RubricVisual kind="Orbit" positions={[score / 10]} grade={null} scale="quality" label="Overall" value={`${scoreText} / 10`} />}
    {desktopReport && potential != null && <div className="mt-2 flex items-baseline justify-between gap-2">
      <p className="text-base font-medium tracking-tight">Potential</p>
      <p className="whitespace-nowrap text-xl font-normal tabular-nums tracking-tight">{potential.toFixed(1)}</p>
    </div>}
  </div>
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
            className="flex min-h-0 flex-col justify-between rounded-[24px] bg-zinc-50/60 p-5"
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

export function ReportColorPalette({ color, kind = 'eye', ribbon = false, locked = false }: { color?: string; kind?: 'eye' | 'hair'; ribbon?: boolean; locked?: boolean }) {
  const palette = kind === 'eye' ? eyePalette : hairPalette
  const selected = locked ? undefined : palette.find(shade => shade.name === color?.toLowerCase())
  if (!selected && !locked) return null
  const unselected = palette.filter(shade => shade !== selected)
  const shades = selected ? [...unselected.slice(0, 3), selected, ...unselected.slice(3)] : palette

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
  const selectedPosition = ribbonStops.findIndex(shade => shade.name === selected?.name) / (ribbonStops.length - 1) * 100
  const gradient = `linear-gradient(90deg,${ribbonStops.map((shade, index) => `${shade.hex} ${index / (ribbonStops.length - 1) * 100}%`).join(',')})`
  const label = kind === 'eye' ? 'Eye color' : 'Hair color'

  return <div className="rounded-[24px] bg-zinc-50/60 p-5" aria-label={`${label}: ${locked ? 'locked' : selected?.name}`}>
    <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold capitalize">{locked ? <span className={styles.lockedScore}><SkeletonBox width={48} height={10} /></span> : selected?.name}</p>
    </div>
    {ribbon ? <div className="relative mt-6 h-[29px] overflow-hidden rounded-lg border border-black/5" style={{ background: gradient }} aria-hidden="true">
      <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#ffffff50,transparent 65%,#ffffff20)' }} />
      {!locked && <span className="absolute inset-y-[3px] w-[5px] -translate-x-1/2 rounded-full bg-white/90 shadow-[0_0_0_1px_#ffffff30,0_1px_3px_#00000024]" style={{ left: `clamp(6px,${selectedPosition}%,calc(100% - 6px))` }} />}
    </div> : <div className="mt-4 flex h-16 items-center justify-center gap-1.5" aria-hidden="true">
      {shades.map(shade => <span key={shade.name} className="min-w-0 flex-1 rounded-sm" style={{ height: shade === selected ? 64 : 46, backgroundColor: shade.hex }} />)}
    </div>}
  </div>
}

export function ReportCategoryHeader({ category, simplified = false, hideScore = false, lockScore = false, morph = false }: { category: DesktopReportCategory; simplified?: boolean; hideScore?: boolean; lockScore?: boolean; morph?: boolean }) {
  const { title, subtitle, scoreLabel, score } = category
  if (simplified) {
    const label = !hideScore && category.id === 'overall' ? scoreLabel : title
    const value = score.toFixed(1)
    return <div className="rounded-[24px] bg-zinc-50/60 p-5"><div className="flex items-baseline justify-between gap-4"><h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{morph ? <TextMorph>{label}</TextMorph> : label}</h3>{!hideScore && <span className="whitespace-nowrap text-4xl font-semibold leading-none tabular-nums tracking-[-0.055em]">{lockScore ? <span className={styles.lockedScore}><LockedScore /></span> : morph ? <TextMorph>{value}</TextMorph> : value} <span className="text-sm font-normal text-muted-foreground">/ 10</span></span>}</div></div>
  }
  return (
      <div className="rounded-[24px] bg-zinc-50/60 p-5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{scoreLabel}</p>
        <div className="mt-14 flex items-end justify-between">
          <h3 className="text-4xl font-semibold leading-none tracking-[-0.055em]">{title}</h3>
          <span className="font-mono text-xl">{score.toFixed(1)} <span className="text-[10px] uppercase text-muted-foreground">/ {10}</span></span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>
  )
}
