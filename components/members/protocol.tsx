import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/core/disclosure'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react'
import { TextMorph } from 'torph/react'
import { formatProtocolDate, scheduleProtocolTasks, selectProtocolTasks, type ProtocolPerson, type ProtocolProfile } from '@/lib/creator/protocol-tasks'
import { trackWebEvent } from '@/lib/analytics/client'

const protocolEase = [.22, 1, .36, 1] as const
const scheduleDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

export default function ProtocolPage({ userId, profile, gender, hasEvaluation, preview, mobile = false }: {
  userId: string; profile: ProtocolProfile; gender: ProtocolPerson['gender']; hasEvaluation: boolean; preview?: boolean; mobile?: boolean
}) {
  const storageKey = `mogging:web-protocol:${userId}`
  const [today, setToday] = useState('')
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState('')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [completed, setCompleted] = useState<string[]>([])
  useEffect(() => {
    setToday(formatProtocolDate(new Date()))
    setSelected('')
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      setCompleted(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [])
    } catch { setCompleted([]) }
  }, [storageKey])
  useEffect(() => { if (!preview) trackWebEvent('protocol_viewed', { mode: 'self' }) }, [preview])
  const date = selected || today
  const days = today ? Array.from({ length: 14 }, (_, index) => {
    const day = new Date(`${today}T12:00:00`)
    day.setDate(day.getDate() + index - 2)
    const key = formatProtocolDate(day)
    return { key, day, tasks: hasEvaluation ? selectProtocolTasks({ date: key, focusIds: profile.focusIds, profile, gender }) : [] }
  }) : []
  const tasks = days.find(day => day.key === date)?.tasks ?? []
  const schedule = scheduleProtocolTasks(tasks, 6)
  const done = tasks.filter(task => completed.includes(`${date}:${task.key}`)).length
  const completion = `${done}/${tasks.length}`
  const dateTitle = date === today ? 'Today’s schedule' : date ? scheduleDate.format(new Date(`${date}T12:00:00`)) : ''
  const animateSchedule = !reduced

  function toggle(taskKey: string) {
    const id = `${date}:${taskKey}`
    const marked = completed.includes(id)
    const next = marked ? completed.filter(value => value !== id) : [...completed, id]
    setCompleted(next)
    try { if (!preview) localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep the current session usable. */ }
    if (!marked && !preview) trackWebEvent('protocol_task_completed', { task_id: taskKey, mode: 'self' })
  }

  return <section className={mobile ? "scan-protocol" : "w-full py-2 sm:py-5"}>
    <header className="flex items-center justify-between gap-4">
      <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Protocol</h1>
      <div className="flex items-center gap-2">
        {tasks.length ? <span role="status" aria-label={`${done} of ${tasks.length} tasks complete`} className="scan-protocol-count inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-3 text-sm font-semibold tabular-nums">
          <Check size={15} aria-hidden="true" />{reduced ? completion : <TextMorph duration={220}>{completion}</TextMorph>}
        </span> : null}
        {!preview && !mobile && <Link href="/progress" aria-label="View progress" title="View progress" className="grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-black"><ArrowUpRight size={20} /></Link>}
      </div>
    </header>
    {hasEvaluation ? <div className="mt-5">
      <LayoutGroup>
      <motion.div layoutScroll role="group" aria-label="Protocol day" className="scan-protocol-calendar grid w-full grid-flow-col auto-cols-[minmax(3rem,1fr)] gap-1 overflow-x-auto px-1 pb-5 pt-1 sm:gap-2">
        {days.map(({ key, day, tasks: dayTasks }) => {
          const isToday = key === today
          const isSelected = key === date
          const dayComplete = dayTasks.length > 0 && dayTasks.every(task => completed.includes(`${key}:${task.key}`))
          return <button type="button" key={key} aria-pressed={isSelected} aria-current={isToday ? 'date' : undefined} aria-label={`${scheduleDate.format(day)}${dayComplete ? ', complete' : ''}`} onClick={() => { setSelected(key); setExpandedTask(null) }} className="flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
            <span className={isToday ? 'text-sky-700' : isSelected ? 'text-zinc-950' : 'text-zinc-500'}>{isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span className={`relative isolate grid size-9 place-items-center rounded-xl border text-sm font-semibold tabular-nums ${mobile ? 'scan-protocol-day-number' : isSelected ? 'border-zinc-950 bg-zinc-950 text-white' : isToday ? 'border-sky-200 bg-sky-100 text-sky-800' : 'border-zinc-200 text-zinc-800 hover:bg-zinc-100'}`}>
              {mobile && isSelected && <motion.span aria-hidden="true" className="scan-protocol-day-selected" layoutId={animateSchedule ? 'protocol-day-selected' : undefined} transition={{ duration: .25, ease: protocolEase }} />}
              {dayComplete ? <Check size={15} aria-hidden="true" /> : day.getDate()}
            </span>
            <span aria-hidden="true" className={`size-1 rounded-full ${isToday ? 'bg-sky-400' : isSelected ? 'bg-zinc-950' : 'bg-zinc-300'} ${dayTasks.length ? '' : 'invisible'}`} />
          </button>
        })}
      </motion.div>
      </LayoutGroup>
      {mobile && date && <div className="scan-protocol-agenda">
        <h2>{reduced ? dateTitle : <TextMorph duration={240}>{dateTitle}</TextMorph>}</h2>
        {tasks.length > 0 && <div className="scan-protocol-meter" role="progressbar" aria-label="Daily tasks complete" aria-valuenow={done} aria-valuemax={tasks.length}>
          <motion.span initial={false} animate={{ scaleX: done / tasks.length }} transition={{ duration: reduced ? 0 : .26, ease: protocolEase }} />
        </div>}
      </div>}
      {date && schedule.length ? <ol aria-label="Daily schedule" className={mobile ? "scan-protocol-schedule" : undefined}>
        {Array.from({ length: 14 }, (_, index) => {
          const hour = index + 6
          const slot = schedule.find(entry => entry.hour === hour)
          return <li key={hour} data-task={Boolean(slot) || undefined} className="grid min-h-8 grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 border-t border-zinc-100 py-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-4">
            <time className="pt-0.5 text-xs font-medium tabular-nums text-zinc-500" dateTime={`${String(hour).padStart(2, '0')}:00`}>{String(hour).padStart(2, '0')}:00</time>
            {slot ? (() => {
              const task = slot.item
              const taskId = `${date}:${task.key}`
              const marked = completed.includes(taskId)
              return <motion.div key={taskId} className="scan-protocol-task flex items-start gap-1 rounded-2xl border-l-[3px] px-2 sm:gap-3 sm:px-3"
                data-complete={marked || undefined} style={{ backgroundColor: `${task.color}14`, borderColor: task.color }}
                initial={animateSchedule ? { opacity: 0, y: 5 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24, ease: protocolEase }}>
                <Disclosure key={taskId} open={expandedTask === taskId} onOpenChange={open => setExpandedTask(open ? taskId : null)} className="min-w-0 flex-1">
                  <DisclosureTrigger className="group flex min-h-12 w-full cursor-pointer items-center gap-2 py-2 text-left text-sm font-semibold">
                    <span className={marked ? 'text-zinc-500 line-through' : 'text-zinc-950'}>{task.title}</span>
                    <ChevronDown size={14} className="shrink-0 text-zinc-500 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </DisclosureTrigger>
                  <DisclosureContent>
                    <div className="pb-3 text-sm leading-6 text-zinc-700">
                      <p>{task.detail}</p>
                      {task.tips.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{task.tips.map(tip => <li key={tip}>{tip}</li>)}</ul> : null}
                    </div>
                  </DisclosureContent>
                </Disclosure>
                <button type="button" aria-pressed={marked} aria-label={`${marked ? 'Undo completion for' : 'Complete'} ${task.title}`} onClick={() => toggle(task.key)} className="group grid size-11 shrink-0 place-items-center self-start">
                  <span className="scan-protocol-check grid size-6 place-items-center rounded-[8px] border-2 border-white bg-transparent text-zinc-900 shadow-[0_0_0_1px_#18181b24] transition-shadow group-hover:shadow-[0_0_0_1px_#18181b55]">
                    <AnimatePresence initial={false}>{marked && <motion.span key="check" initial={animateSchedule ? { opacity: 0, scale: .7 } : false} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16, ease: protocolEase }}><Check size={14} aria-hidden="true" /></motion.span>}</AnimatePresence>
                  </span>
                </button>
              </motion.div>
            })() : null}
          </li>
        })}
      </ol> : date ? <p className="border-t border-zinc-100 py-5 text-sm text-zinc-500">No tasks scheduled for this day.</p> : null}
      <p className="mt-4 text-xs text-zinc-500">Checkoffs are saved in this browser.</p>
    </div> : <div className="rounded-[1.75rem] bg-zinc-100 p-7"><p className="text-zinc-600">Complete your first evaluation to get a personalized routine.</p><Link href="/analysis?start=1" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white">Start an evaluation</Link></div>}
  </section>
}
