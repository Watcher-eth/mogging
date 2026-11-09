import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Droplet, Dumbbell, Eye, Hand, ScanFace, Settings, Sun, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TextMorph } from 'torph/react'
import { Drawer } from 'vaul'
import { scheduleProtocolTasks, type ProtocolProfile, type ProtocolTask } from '@/lib/creator/protocol-tasks'
import styles from './protocol-schedule.module.css'

type Day = { key: string; day: Date; tasks: ProtocolTask[] }
const hours = Array.from({ length: 14 }, (_, i) => i + 6)
const hourHeight = 54
const ease = [.22, 1, .36, 1] as const
const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const taskIcons = { skin: Droplet, eyes: Eye, jaw: ScanFace }
const tone = (task: ProtocolTask) => ({ '--task': task.color } as CSSProperties)
const buzz = (time = 7) => navigator.vibrate?.(time)

function TaskIcon({ task, size = 22 }: { task: ProtocolTask; size?: number }) {
  const name = task.icon.ios
  const Icon = name.includes('sun') ? Sun : name.includes('hand') ? Hand : name.includes('dumbbell') ? Dumbbell
    : taskIcons[task.focusIds[0] as keyof typeof taskIcons] ?? ScanFace
  return <Icon size={size} strokeWidth={1.65} aria-hidden="true" />
}

export function ProtocolSchedule({ desktop, days, date, today, completed, onDay, onToggle, hasEvaluation, minutes, onMinutes }: {
  desktop: boolean; days: Day[]; date: string; today: string; completed: string[]; onDay: (date: string) => void
  onToggle: (key: string) => void; hasEvaluation: boolean; minutes: ProtocolProfile['minutes']; onMinutes: (value: ProtocolProfile['minutes']) => void
}) {
  const reduced = useReducedMotion()
  const [task, setTask] = useState<ProtocolTask | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [direction, setDirection] = useState(1)
  const [celebration, setCelebration] = useState(0)
  const [now, setNow] = useState<Date>()
  const strip = useRef<HTMLDivElement>(null)
  const selected = days.findIndex(day => day.key === date)
  const tasks = days[selected]?.tasks ?? []
  const done = new Set(completed)
  const scheduled = scheduleProtocolTasks(tasks, 6)
  const color = done.size > 100 ? '#ffb340' : done.size > 50 ? '#a78bfa' : done.size > 25 ? '#38c8ef' : done.size > 10 ? '#34d399' : '#58bdff'
  const time = now ? (now.getHours() + now.getMinutes() / 60 - 6) * hourHeight : -1
  const isDone = (item: ProtocolTask) => done.has(`${date}:${item.key}`)

  useEffect(() => {
    const refresh = () => setNow(new Date())
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const element = strip.current
    if (!element || selected < 0) return
    const active = element.children[selected] as HTMLElement
    if (active.offsetLeft < element.scrollLeft || active.offsetLeft + active.offsetWidth > element.scrollLeft + element.clientWidth) {
      element.scrollTo({ left: active.offsetLeft - 20, behavior: reduced || date === today ? 'instant' : 'smooth' })
    }
  }, [selected, date, today, reduced])

  function select(index: number) {
    if (!days[index] || index === selected) return
    buzz()
    setDirection(index > selected ? 1 : -1)
    onDay(days[index].key)
  }

  function toggle(item: ProtocolTask) {
    const finish = !isDone(item) && tasks.every(other => other.key === item.key || isDone(other))
    buzz(finish ? 22 : 8)
    onToggle(item.key)
    if (finish && !reduced) setCelebration(value => value + 1)
  }

  return <section className={styles.page} data-wide={desktop || undefined}>
    <header className={styles.header}>
      <h1>Protocol</h1>
      <div>
        <motion.span className={styles.badge} style={{ background: color }} aria-label={`${done.size} tasks completed`}>
          <BadgeCheck size={17} aria-hidden="true" />
          {reduced ? done.size : <TextMorph duration={240}>{String(done.size)}</TextMorph>}
          {!reduced && done.size > 0 && <motion.i key={done.size} initial={{ x: '-160%' }} animate={{ x: '400%' }} transition={{ duration: .52, ease }} />}
        </motion.span>
        <button type="button" aria-label="Protocol options" onClick={() => { setTask(null); setSheetOpen(true) }}><Settings size={18} /></button>
      </div>
    </header>
    {hasEvaluation ? <>
      <div className={styles.calendar}>
      <LayoutGroup>
        <motion.div ref={strip} layoutScroll className={styles.days} role="group" aria-label="Protocol day">
          {days.map(({ key, day, tasks: dayTasks }, index) => {
            const finished = dayTasks.length > 0 && dayTasks.every(item => done.has(`${key}:${item.key}`))
            return <button type="button" key={key} aria-current={key === today ? 'date' : undefined} aria-pressed={key === date}
              aria-label={`${dayLabel.format(day)}${key === today ? ', today' : ''}${finished ? ', complete' : ''}`}
              onClick={() => select(index)} onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                const next = index + (event.key === 'ArrowRight' ? 1 : -1)
                if (!days[next]) return
                event.preventDefault()
                select(next)
                ;(strip.current?.children[next] as HTMLElement | undefined)?.focus()
              }}>
              <span>{key === today ? 'Today' : dayLabel.formatToParts(day).find(part => part.type === 'weekday')?.value.slice(0, 3)}</span>
              <span className={styles.dayDate}>
                {key === date && <motion.i layoutId={reduced ? undefined : 'protocol-active-day'} transition={{ duration: .27, ease }} />}
                {finished ? <Check size={15} /> : day.getDate()}
              </span>
              <i className={styles.dayDot} data-empty={!dayTasks.length || undefined} data-done={finished || undefined} />
            </button>
          })}
        </motion.div>
      </LayoutGroup>
      {desktop && <div className={styles.dayControls}>
        <button type="button" onClick={() => select(selected - 1)} disabled={selected <= 0} aria-label="Previous day"><ChevronLeft size={17} /></button>
        <button type="button" onClick={() => select(days.findIndex(day => day.key === today))} disabled={date === today}>Today</button>
        <button type="button" onClick={() => select(selected + 1)} disabled={selected >= days.length - 1} aria-label="Next day"><ChevronRight size={17} /></button>
      </div>}
      </div>
      <motion.div className={styles.schedule} onPanEnd={(_, { offset, velocity }) => {
        if (Math.abs(offset.x) < Math.abs(offset.y) * 1.35 || (Math.abs(offset.x) < 52 && (Math.abs(offset.x) < 25 || Math.abs(velocity.x) < 480))) return
        select(selected + (offset.x < 0 ? 1 : -1))
      }}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          {date && <motion.div key={date} className={styles.timeline} role="region" aria-label={`Schedule for ${dayLabel.format(days[selected]?.day ?? new Date(date + 'T12:00:00'))}`}
            custom={direction} variants={{
              enter: (dir: number) => ({ opacity: 0, x: reduced ? 0 : dir * 42 }),
              visible: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: reduced ? 0 : -dir * 30 }),
            }} initial="enter" animate="visible" exit="exit" transition={{ duration: reduced ? 0 : .3, ease }}>
            {hours.map(hour => <div key={hour} className={styles.hour}><time>{String(hour).padStart(2, '0')}:00</time></div>)}
            {!scheduled.length && <p className={styles.noTasks}>No tasks scheduled.</p>}
            {scheduled.map(({ item, hour, durationHours }, index) => {
              const checked = isDone(item)
              return <motion.div key={item.key} className={styles.task} data-done={checked || undefined}
                style={{ ...tone(item), top: (hour - 6) * hourHeight + 8, height: Math.max(56, durationHours * hourHeight - 14) }}
                initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : .4, delay: reduced ? 0 : index * .08, ease }}>
                <button type="button" className={styles.taskBody} onClick={() => { buzz(); setTask(item); setSheetOpen(true) }}>
                  <span className={styles.taskIcon}><TaskIcon task={item} /></span>
                  <span className={styles.taskTitle}><span>{item.title}<i /></span></span>
                  <span className={styles.taskDetail}>{item.detail}</span>
                </button>
                <button type="button" role="checkbox" aria-checked={checked} aria-label={`${checked ? 'Undo completion for' : 'Complete'} ${item.title}`} className={styles.checkbox} onClick={() => toggle(item)}>
                  <span><AnimatePresence initial={false}>{checked && <motion.i initial={reduced ? false : { scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}><X size={14} /></motion.i>}</AnimatePresence></span>
                </button>
              </motion.div>
            })}
            {date === today && time >= 0 && time <= hourHeight * hours.length && <div className={styles.now} style={{ top: time }} aria-hidden="true" />}
          </motion.div>}
        </AnimatePresence>
      </motion.div>
    </> : <div className={styles.empty}>
      <p>Complete your first evaluation to get a personalized routine.</p>
      <Link href="/analysis?start=1&from=app">Start an evaluation <ChevronRight size={16} /></Link>
    </div>}
    {celebration > 0 && <div key={celebration} className={styles.confetti} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => {
        const angle = i * 2.4
        return <motion.i key={i} style={{ background: ['#74d7ff', '#b5ecff', '#48b9ff', '#9ee7d2'][i % 4] }}
          initial={{ x: 0, y: 0, opacity: 1, scale: .6 }}
          animate={{ x: Math.cos(angle) * (45 + i * 4), y: Math.sin(angle) * (40 + i * 3) + 75, rotate: i * 57, opacity: 0, scale: 1 }}
          transition={{ duration: .82 + i * .016, ease }} />
      })}
    </div>}
    <Drawer.Root open={sheetOpen} onOpenChange={setSheetOpen} handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content className={styles.sheet} data-wide={desktop || undefined} aria-describedby={undefined} style={task ? tone(task) : undefined}>
          <Drawer.Handle className={styles.handle} />
          {!task ? <>
            <div className={styles.sheetHeader}><Drawer.Title>Protocol options</Drawer.Title><Drawer.Close aria-label="Close options"><X size={17} /></Drawer.Close></div>
            <p>Daily time</p>
            <div className={styles.options}>{([5, 15, 30] as const).map(value => <button type="button" key={value} aria-pressed={value === minutes} onClick={() => { buzz(); onMinutes(value) }}>{value} min</button>)}</div>
          </> : <>
            <div className={styles.sheetHeader}><TaskIcon task={task} size={24} /><Drawer.Title>{task.title}</Drawer.Title><Drawer.Close aria-label="Close task"><X size={17} /></Drawer.Close></div>
            <div className={styles.sheetBody} data-vaul-no-drag>
            <p>{task.detail}</p>
            {task.reason && <div className={styles.reason}>{task.reason}<small>{task.minutes ?? 2} min{task.evidence ? ` · ${task.evidence}` : ''}</small></div>}
            {task.tips.length > 0 && <div><h3>Tips</h3><ol>{task.tips.map((tip, index) => <li key={tip}><b>{index + 1}</b>{tip}</li>)}</ol></div>}
            </div>
            <button className={styles.complete} type="button" onClick={() => { toggle(task); setSheetOpen(false) }}>
              {isDone(task) ? <X size={18} /> : <Check size={18} />}
              {isDone(task) ? 'Mark incomplete' : 'Mark complete'}
            </button>
          </>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  </section>
}
