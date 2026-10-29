import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/core/disclosure'
import type { DesktopReportCategory } from './analysis-report'
import styles from './analysis-report.module.css'

export function ReportCategorySelector({ categories, activeCategory, score, onSelect }: {
  categories: DesktopReportCategory[]; activeCategory: DesktopReportCategory; score: number; onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const hoverOpened = useRef(false)
  const index = categories.findIndex(category => category.id === activeCategory.id)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  const buttons = (mobile: boolean) => categories.map((category, categoryIndex) => <button key={category.id} type="button"
    aria-pressed={category.id === activeCategory.id} className={styles.categoryOption} onClick={() => {
      onSelect(category.id)
      if (mobile) { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
    }}>
    <span>[ {String(categoryIndex + 1).padStart(3, '0')} ]</span><span>{category.title}</span>
    <span className={styles.categoryScore}>{category.id === 'overall' ? score.toFixed(1) : ''}</span>
  </button>)

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
          if (event.detail > 0 && hoverOpened.current) { event.preventDefault(); hoverOpened.current = false }
        }} onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
        }}>
          <span><small>Categories / {String(index + 1).padStart(2, '0')}</small><strong>{activeCategory.title}</strong></span>
          <ChevronDown size={18} aria-hidden="true" className={open ? styles.chevronOpen : undefined} />
        </DisclosureTrigger>
        <DisclosureContent className={styles.categoryPopup}>
          <nav className={styles.categoryList} aria-label="Report categories">{buttons(true)}</nav>
        </DisclosureContent>
      </Disclosure>
    </div>
  </>
}
