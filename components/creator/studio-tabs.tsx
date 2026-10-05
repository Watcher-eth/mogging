import * as Tabs from '@radix-ui/react-tabs'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useId, type ReactNode } from 'react'
export function StudioTabs({
  value,
  onChange,
  items,
  children,
}: {
  value: string
  onChange: (value: string) => void
  items: readonly { value: string; label: string }[]
  children: ReactNode
}) {
  const id = useId()
  const reduced = useReducedMotion()
  return (
    <Tabs.Root value={value} onValueChange={onChange}>
      <LayoutGroup id={id}>
        <Tabs.List
          aria-label="View"
          className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#f5f6f7] p-1"
        >
          {items.map((item) => (
            <Tabs.Trigger
              className="relative isolate min-h-10 shrink-0 rounded-full px-4 text-sm font-medium text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF] data-[state=active]:text-zinc-900"
              key={item.value}
              value={item.value}
            >
              {value === item.value ? (
                <motion.span
                  layoutId="selection"
                  transition={{
                    duration: reduced ? 0 : 0.2,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm"
                />
              ) : null}
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </LayoutGroup>
      {children}
    </Tabs.Root>
  )
}
export { Content as StudioTabContent } from '@radix-ui/react-tabs'
