'use client'

// Adapted from Motion Primitives (MIT): see accordion.LICENSE.md.
import {
  createContext,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type Key,
  type ReactNode,
} from 'react'
import {
  LazyMotion,
  domAnimation,
  MotionConfig,
  useReducedMotion,
  type Transition,
  type Variant,
} from 'motion/react'
import * as m from 'motion/react-m'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Value = Key | Key[] | null
type Variants = { expanded: Variant; collapsed: Variant }
const customVariants: Variants = {
  expanded: { opacity: 1, scale: 1, y: 0 },
  collapsed: { opacity: 0, scale: 0.98, y: -4 },
}
const AccordionContext = createContext<{
  value: Value
  toggle: (value: Key, instant: boolean) => void
  variants: Variants
  instant: boolean
} | null>(null)
const ItemContext = createContext<{ expanded: boolean; id: string; value: Key } | null>(null)
function useAccordion() {
  const context = useContext(AccordionContext)
  if (!context) throw new Error('Accordion components require an Accordion')
  return context
}
function useItem() {
  const context = useContext(ItemContext)
  if (!context) throw new Error('Accordion trigger/content require an AccordionItem')
  return context
}

export function Accordion({
  children,
  expandedValue,
  defaultExpandedValue = null,
  onValueChange,
  multiple = false,
  variants = customVariants,
  transition = { type: 'spring', stiffness: 120, damping: 20 },
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  expandedValue?: Value
  defaultExpandedValue?: Value
  onValueChange?: (value: Value) => void
  multiple?: boolean
  variants?: Variants
  transition?: Transition
}) {
  const [internal, setInternal] = useState<Value>(defaultExpandedValue)
  const [keyboard, setKeyboard] = useState(false)
  const reduced = useReducedMotion()
  const value = expandedValue === undefined ? internal : expandedValue
  function toggle(key: Key, instant: boolean) {
    setKeyboard(instant)
    const selected: Key[] = Array.isArray(value) ? value : value === null ? [] : [value]
    const next: Value = multiple
      ? selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key]
      : value === key
        ? null
        : key
    if (expandedValue === undefined) setInternal(next)
    onValueChange?.(next)
  }
  const instant = Boolean(reduced || keyboard)
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig transition={instant ? { duration: 0 } : transition}>
        <AccordionContext.Provider value={{ value, toggle, variants, instant }}>
          <div
            {...props}
            className={className}
            data-accordion-root
            onKeyDown={(event) => {
              props.onKeyDown?.(event)
              if (
                event.defaultPrevented ||
                !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
              )
                return
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[data-accordion-trigger]:not(:disabled)'
                )
              ).filter((button) => button.closest('[data-accordion-root]') === event.currentTarget)
              const index = buttons.indexOf(event.target as HTMLButtonElement)
              if (index < 0) return
              event.preventDefault()
              buttons[
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                      buttons.length
              ]?.focus()
            }}
          >
            {children}
          </div>
        </AccordionContext.Provider>
      </MotionConfig>
    </LazyMotion>
  )
}

export function AccordionItem({
  value,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: Key }) {
  const { value: selected } = useAccordion()
  const id = useId()
  const expanded = Array.isArray(selected) ? selected.includes(value) : selected === value
  return (
    <ItemContext.Provider value={{ expanded, id, value }}>
      <div
        {...props}
        data-open={expanded}
        data-state={expanded ? 'open' : 'closed'}
        {...(expanded ? { 'data-expanded': '' } : { 'data-closed': '' })}
      >
        {children}
      </div>
    </ItemContext.Provider>
  )
}

export function AccordionTrigger({
  className,
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggle } = useAccordion()
  const { expanded, id, value } = useItem()
  return (
    <button
      {...props}
      type="button"
      id={`${id}-trigger`}
      aria-expanded={expanded}
      aria-controls={`${id}-content`}
      data-accordion-trigger
      className={cn('accordion-trigger', className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) toggle(value, event.detail === 0)
      }}
    >
      {children}
    </button>
  )
}

export function AccordionChevron({ className }: { className?: string }) {
  const { expanded } = useItem()
  const { instant } = useAccordion()
  return (
    <m.span
      aria-hidden="true"
      animate={{ rotate: expanded ? 90 : 0 }}
      transition={{ duration: instant ? 0 : 0.2 }}
      className={cn('inline-flex shrink-0 text-current opacity-60', className)}
    >
      <ChevronRight size={16} />
    </m.span>
  )
}

export function AccordionContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { expanded, id } = useItem()
  const { variants, instant } = useAccordion()
  const state = expanded ? 'expanded' : 'collapsed'
  // Keep contents mounted: closing a form must not discard its inputs or remove FAQ text from SSR.
  return (
    <m.div
      id={`${id}-content`}
      role="region"
      aria-labelledby={`${id}-trigger`}
      aria-hidden={!expanded}
      inert={!expanded}
      initial={false}
      animate={expanded ? { height: 'auto' } : { height: 0 }}
      style={{ overflow: 'hidden' }}
      transition={instant ? { duration: 0 } : undefined}
    >
      <m.div
        initial={false}
        animate={state}
        variants={variants}
        className={className}
        style={{ transformOrigin: 'top left' }}
      >
        {children}
      </m.div>
    </m.div>
  )
}

export function Disclosure({
  defaultOpen = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }) {
  return (
    <Accordion defaultExpandedValue={defaultOpen ? 'disclosure' : null}>
      <AccordionItem value="disclosure" {...props}>
        {children}
      </AccordionItem>
    </Accordion>
  )
}
export function DisclosureSummary({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <AccordionTrigger
      {...props}
      className={cn('flex w-full items-center justify-between gap-3 text-left', className)}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <AccordionChevron />
    </AccordionTrigger>
  )
}
