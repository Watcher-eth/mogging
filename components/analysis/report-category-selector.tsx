import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { useEffect, useRef, useState } from 'react'
import { Activity, ChartNoAxesColumnIncreasing, ChevronDown, Circle, Eye, Focus, ScanFace, Smile, Sparkles, Waves } from 'lucide-react'
import { TextMorph } from 'torph/react'
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/core/disclosure'
import type { DesktopReportCategory } from './analysis-report'
import styles from './analysis-report.module.css'

const categoryIcons = {
  overall: ChartNoAxesColumnIncreasing, eyes: Eye, brows: Eye, eyebrows: Eye,
  nose: Focus, mouth: Smile, lips: Smile, jaw: ScanFace, 'face-shape': ScanFace,
  symmetry: ScanFace, skin: Sparkles, 'skin-age': Sparkles, 'biological-age': Sparkles,
  cheekbones: Waves, cheeks: Waves, 'facial-fat': Activity, dimorphism: Activity,
} as const

function categoryIcon(id: string) {
  return categoryIcons[id as keyof typeof categoryIcons] ?? Circle
}

export function ReportCategorySelector({ categories, activeCategory, score, onSelect }: {
  categories: DesktopReportCategory[]; activeCategory: DesktopReportCategory; score: number | null; onSelect: (id: string) => void
}) {
  const feedback = useScanFeedback()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const hoverOpened = useRef(false)
  const ActiveIcon = categoryIcon(activeCategory.id)
  const index = categories.findIndex(category => category.id === activeCategory.id)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  const buttons = (mobile: boolean) => categories.map((category, categoryIndex) => {
    const Icon = categoryIcon(category.id)
    return <button key={category.id} type="button"
    aria-pressed={category.id === activeCategory.id} className={styles.categoryOption} onClick={event => {
      if (category.id !== activeCategory.id && event.currentTarget.closest('[data-mobile-scan]')) feedback('selection')
      onSelect(category.id)
      if (mobile) { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
    }}>
    <span className={styles.categoryNumber}>[ {String(categoryIndex + 1).padStart(3, '0')} ]</span>
    {mobile && <Icon className={styles.categoryIcon} size={17} aria-hidden="true" />}
    <span>{category.title}</span>
    <span className={styles.categoryScore}>{category.id === 'overall' ? score?.toFixed(1) ?? '—' : ''}</span>
  </button>
  })

  return <>
    <nav className={`${styles.categories} ${styles.desktopCategories}`} aria-label="Report categories">{buttons(false)}</nav>
    <div ref={root} className={styles.mobileCategories}>
      <Disclosure open={open} onOpenChange={setOpen} onPointerEnter={event => {
        if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover)').matches) { hoverOpened.current = !open; setOpen(true) }
      }} onPointerLeave={event => {
        const closeHover = hoverOpened.current
        hoverOpened.current = false
        if (event.pointerType === 'mouse' && closeHover && (!root.current?.contains(document.activeElement) || document.activeElement === trigger.current)) setOpen(false)
      }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus({ preventScroll: true }) }
        }}>
        <DisclosureTrigger ref={trigger} className={styles.categoryTrigger} onClick={event => {
          if (event.detail > 0 && hoverOpened.current) { event.preventDefault(); hoverOpened.current = false; return }
          if (event.currentTarget.closest('[data-mobile-scan]')) feedback()
        }} onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
        }}>
          <ActiveIcon className={styles.categoryIcon} size={17} aria-hidden="true" />
          <span><small>Categories / {String(index + 1).padStart(2, '0')}</small><strong><TextMorph>{activeCategory.title}</TextMorph></strong></span>
          <ChevronDown size={18} aria-hidden="true" className={open ? styles.chevronOpen : undefined} />
        </DisclosureTrigger>
        <DisclosureContent className={styles.categoryPopup}>
          <nav className={styles.categoryList} aria-label="Report categories">{buttons(true)}</nav>
        </DisclosureContent>
      </Disclosure>
    </div>
  </>
}
