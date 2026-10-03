import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Download, Film, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from './creator-shell'
import { buildMockProtocol, getScheduledRoutineItems, localDate, protocolFocusAreas, protocolSize, type MockProtocolDay, type RoutineItem } from '@/lib/creator/mock-protocol'
import { protocolProductOptions, protocolActiveProducts, type ProtocolPerson, normalizeProtocolProfile, protocolConcernOptions, protocolEquipmentOptions, protocolFaceShapes, protocolHairTextures, protocolFeedbackOptions, protocolWeek, type ProtocolProfile, type ProtocolFeedback, type ProtocolCheckIn } from '@/lib/creator/protocol-tasks'
import { downloadBlob, encodeCanvasMp4 } from '@/lib/creator/export-slides'

export function MockProtocolGenerator() {
  const [focusId, setFocusId] = useState('eyes')
  const [profile, setProfile] = useState(() => normalizeProtocolProfile({ startedOn: localDate(new Date()) }))
  const [feedback, setFeedback] = useState<ProtocolFeedback[]>([])
  const [checkIns, setCheckIns] = useState<ProtocolCheckIn[]>([])
  const [effort, setEffort] = useState<ProtocolCheckIn['effort']>('manageable')
  const [change, setChange] = useState<ProtocolCheckIn['change']>('same')
  const [skinComfort, setSkinComfort] = useState<ProtocolCheckIn['skinComfort']>('comfortable')
  const [person, setPerson] = useState<ProtocolPerson>({ gender: 'other', hasBeard: false })
  const [startDate, setStartDate] = useState(() => localDate(new Date()))
  const [days, setDays] = useState<MockProtocolDay[]>([])
  const [selectedDay, setSelectedDay] = useState(0)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const [scroll, setScroll] = useState(0)
  const [openedTask, setOpenedTask] = useState<RoutineItem | null>(null)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const captureRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / protocolSize.width))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  function updateProfile(patch: Partial<ProtocolProfile>) {
    setProfile(current => normalizeProtocolProfile({ ...current, ...patch })); setDays([]); setOpenedTask(null)
  }
  function generate() {
    try {
      setDays(buildMockProtocol(focusId, startDate, profile.products, person, { profile: { ...profile, focusIds: [focusId], confirmed: true }, feedback, checkIns }))
      setCompleted(new Set()); setSelectedDay(0); setScroll(0); setOpenedTask(null)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not generate protocol') }
  }
  function recordFeedback(task: RoutineItem, outcome: ProtocolFeedback['outcome']) {
    const date = days[task.dayOffset].date
    setFeedback(current => [...current.filter(event => event.taskKey !== task.key || event.date !== date), { date, taskKey: task.key, outcome }])
    setOpenedTask(null)
    toast.success('Feedback saved. Regenerate to update upcoming days.')
  }
  function toggle(task: RoutineItem) {
    const date = days[task.dayOffset].date
    setFeedback(current => completed.has(task.id) ? current.filter(event => event.taskKey !== task.key || event.date !== date) : [...current.filter(event => event.taskKey !== task.key || event.date !== date), { date, taskKey: task.key, outcome: 'done' }])
    setCompleted(current => {
      const next = new Set(current)
      if (next.has(task.id)) next.delete(task.id); else next.add(task.id)
      return next
    })
  }
  function editTask(index: number, patch: Partial<RoutineItem>) {
    setDays(current => current.map((day, offset) => offset === selectedDay ? { ...day, items: day.items.map((task, i) => i === index ? { ...task, ...patch } : task) } : day))
  }
  async function exportProtocol(video: boolean) {
    if (!captureRef.current || exporting) return
    setExporting(true); setProgress(0)
    const restoreDay = selectedDay
    const restoreTask = openedTask
    try {
      const { toBlob, toCanvas } = await import('html-to-image')
      await document.fonts.ready
      const options = { width: 390, height: 844, pixelRatio: 3, skipFonts: true, backgroundColor: '#ffffff', style: { transform: 'none' } }
      let blob: Blob | null
      if (video) {
        setOpenedTask(null)
        const frames: HTMLCanvasElement[] = []
        for (let day = 0; day < days.length; day++) {
          setSelectedDay(day)
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
          frames.push(await toCanvas(captureRef.current, options))
          setProgress((day + 1) / days.length * .2)
        }
        const canvas = document.createElement('canvas')
        canvas.width = 1170; canvas.height = 2532
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Video export is unavailable')
        blob = await encodeCanvasMp4(canvas, time => ctx.drawImage(frames[Math.min(frames.length - 1, Math.floor(time / 2000))], 0, 0), frames.length * 2000, value => setProgress(.2 + value * .8))
      } else blob = await toBlob(captureRef.current, options)
      if (!blob) throw new Error('Could not export protocol')
      downloadBlob(blob, `mogging-mock-protocol-${focusId}-${video ? 'week' : days[selectedDay].date}.${video ? 'mp4' : 'png'}`)
      toast.success(`${video ? 'Weekly video' : 'Screenshot'} exported`)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not export protocol') }
    finally { setSelectedDay(restoreDay); setOpenedTask(restoreTask); setExporting(false) }
  }
  const day = days[selectedDay]
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="creator-surface grid gap-5 p-5 sm:p-6">
      <div><h2 className="text-lg font-semibold">Mock Protocol</h2><p className="mt-0.5 text-sm text-zinc-500">Choose a focus area to create a week of daily tasks in the mobile Protocol layout.</p></div>
      <fieldset disabled={exporting} className="grid gap-4">
        <Field label="Focus area"><select aria-label="Protocol focus area" className={fieldClass} value={focusId} onChange={event => { setFocusId(event.target.value); setDays([]); setOpenedTask(null) }}>{protocolFocusAreas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}</select></Field>
        <Field label="Person"><select aria-label="Protocol person gender" className={fieldClass} value={person.gender ?? 'other'} onChange={event => { const gender = event.target.value as ProtocolPerson['gender']; setPerson(current => ({ gender, hasBeard: current.hasBeard })); setDays([]); setOpenedTask(null) }}><option value="other">Not specified / other</option><option value="female">Female</option><option value="male">Male</option></select></Field>
        {<label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={person.hasBeard === true} onChange={event => { setPerson(current => ({ ...current, hasBeard: event.target.checked })); setDays([]); setOpenedTask(null) }} />This person currently has a beard or moustache</label>}
        <Field label="Week starts"><input aria-label="Protocol week starts" className={fieldClass} type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setDays([]); setOpenedTask(null) }} /></Field>
        <details className="grid gap-4 rounded-2xl border border-zinc-200 p-4" open><summary className="cursor-pointer text-sm font-semibold">Personalization</summary><div className="mt-4 grid gap-4">
          <fieldset><legend className="mb-2 text-sm font-medium">Confirmed concerns</legend><div className="grid gap-2 sm:grid-cols-2">{protocolConcernOptions.map(option => <label key={option.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={profile.concerns.includes(option.id)} onChange={() => updateProfile({ concerns: profile.concerns.includes(option.id) ? profile.concerns.filter(id => id !== option.id) : [...profile.concerns, option.id] })} />{option.label}</label>)}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Daily time"><select aria-label="Daily protocol time" className={fieldClass} value={profile.minutes} onChange={event => updateProfile({ minutes: Number(event.target.value) as ProtocolProfile['minutes'] })}>{[5, 15, 30].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></Field>
            <Field label="Training experience"><select aria-label="Training experience" className={fieldClass} value={profile.experience} onChange={event => updateProfile({ experience: event.target.value as ProtocolProfile['experience'] })}><option value="beginner">Starting out</option><option value="regular">Train regularly</option></select></Field>
            <Field label="Face shape"><select aria-label="Face shape" className={fieldClass} value={profile.faceShape} onChange={event => updateProfile({ faceShape: event.target.value as ProtocolProfile['faceShape'] })}>{protocolFaceShapes.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Hair texture"><select aria-label="Hair texture" className={fieldClass} value={profile.hairTexture} onChange={event => updateProfile({ hairTexture: event.target.value as ProtocolProfile['hairTexture'] })}>{protocolHairTextures.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Age"><select aria-label="Protocol age" className={fieldClass} value={profile.ageGroup} onChange={event => updateProfile({ ageGroup: event.target.value as ProtocolProfile['ageGroup'] })}><option value="unknown">Not specified</option><option value="under-18">Under 18</option><option value="adult">18 or older</option></select></Field>
            <Field label="Spending preference"><select aria-label="Spending preference" className={fieldClass} value={profile.budget} onChange={event => updateProfile({ budget: event.target.value as ProtocolProfile['budget'] })}><option value="existing">Use existing tools</option><option value="flexible">Open to new tools</option></select></Field>
            <Field label="Complexion (optional)"><select aria-label="Complexion" className={fieldClass} value={profile.complexion} onChange={event => updateProfile({ complexion: event.target.value as ProtocolProfile['complexion'] })}>{['unspecified', 'very-light', 'light', 'medium', 'deep'].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Sunless colour"><select aria-label="Sunless colour" className={fieldClass} value={profile.tanning} onChange={event => updateProfile({ tanning: event.target.value as ProtocolProfile['tanning'] })}><option value="none">None</option><option value="lotion">Lotion / mousse</option><option value="spray">Professional spray tan</option></select></Field>
            <Field label="Existing dental plan"><select aria-label="Existing dental plan" className={fieldClass} value={profile.dentalPlan} onChange={event => updateProfile({ dentalPlan: event.target.value as ProtocolProfile['dentalPlan'] })}>{['none', 'whitening', 'retainer', 'aligners'].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Routine started"><input aria-label="Routine started" className={fieldClass} type="date" value={profile.startedOn ?? ''} onChange={event => updateProfile({ startedOn: event.target.value || null })} /></Field>
          </div>
          <fieldset><legend className="mb-2 text-sm font-medium">Tools available</legend><div className="grid gap-2 sm:grid-cols-2">{protocolEquipmentOptions.map(option => <label key={option.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={profile.equipment.includes(option.id)} onChange={() => updateProfile({ equipment: profile.equipment.includes(option.id) ? profile.equipment.filter(id => id !== option.id) : [...profile.equipment, option.id] })} />{option.label}</label>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-sm font-medium">Products owned and tolerated (one skincare active)</legend><div className="grid gap-2 sm:grid-cols-2">{protocolProductOptions.map(option => <label key={option.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={profile.products.includes(option.id)} onChange={() => updateProfile({ products: profile.products.includes(option.id) ? profile.products.filter(id => id !== option.id) : [...profile.products.filter(id => !protocolActiveProducts.includes(option.id) || !protocolActiveProducts.includes(id)), option.id] })} />{option.label}</label>)}</div></fieldset>
          {(['sensitiveSkin', 'retinoidsSuitable', 'makeup', 'collagen'] as const).map((key, index) => <label key={key} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={profile[key]} onChange={() => updateProfile({ [key]: !profile[key] })} />{['Sensitive skin', 'Retinoids are suitable for this adult', 'Wants light makeup / contour', 'Already chose an optional oral collagen supplement'][index]}</label>)}
          <p className="text-xs leading-5 text-zinc-500">Confirm suitability and follow product or professional instructions. Avoid retinoids during pregnancy or while trying to conceive; ask about breastfeeding. Mewing cannot reliably extend the mandible. Collagen benefits are uncertain. Sunless colour requires appropriate exposure protection and does not replace SPF.</p>
        </div></details>
        <Button className="h-11 rounded-full" onClick={generate}>{days.length ? 'Regenerate mock protocol' : 'Generate mock protocol'}</Button>
      </fieldset>
      {day ? <div className="grid gap-3 rounded-2xl border border-zinc-200 p-4"><p className="text-sm font-semibold">Week {protocolWeek(profile, day.date)} · Simulate a check-in</p><div className="grid gap-3"><Field label="Workload"><select aria-label="Check-in workload" className={fieldClass} value={effort} onChange={event => setEffort(event.target.value as typeof effort)}><option value="manageable">Manageable</option><option value="too-much">Too much</option></select></Field><Field label="Concern"><select aria-label="Check-in progress" className={fieldClass} value={change} onChange={event => setChange(event.target.value as typeof change)}><option value="same">About the same</option><option value="improving">Improving</option><option value="worse">Worse</option></select></Field><Field label="Skin"><select aria-label="Check-in skin comfort" className={fieldClass} value={skinComfort} onChange={event => setSkinComfort(event.target.value as typeof skinComfort)}><option value="comfortable">Comfortable</option><option value="irritated">Irritated</option></select></Field></div><Button variant="outline" disabled={exporting} onClick={() => { setCheckIns(current => [...current.filter(item => item.date !== day.date), { date: day.date, effort, change, skinComfort }]); toast.success('Check-in saved. Regenerate to update upcoming days.') }}>Save check-in</Button><Button variant="ghost" disabled={exporting} onClick={() => { setFeedback([]); setCheckIns([]); toast.success('Adaptation feedback reset') }}>Reset adaptation feedback</Button></div> : null}
      {day ? <fieldset disabled={exporting} className="grid gap-4"><legend className="mb-3 text-sm font-semibold">Edit {day.label} · {day.date}</legend>
        {day.items.map((task, index) => <div key={task.id} className="grid gap-3 rounded-2xl border border-zinc-200 p-4">
          <Field label={`Task ${index + 1} title`}><input aria-label={`Task ${index + 1} title`} className={fieldClass} maxLength={80} value={task.title} onChange={event => editTask(index, { title: event.target.value })} /></Field>
          <Field label={`Task ${index + 1} details`}><textarea aria-label={`Task ${index + 1} details`} className={`${fieldClass} min-h-20 py-3`} maxLength={400} value={task.detail} onChange={event => editTask(index, { detail: event.target.value })} /></Field>
        </div>)}
        <Field label="Calendar scroll position"><input aria-label="Calendar scroll position" className="w-full accent-black" type="range" min={0} max={175} value={scroll} onChange={event => setScroll(Number(event.target.value))} /></Field>
      </fieldset> : null}
    </section>
    <section className="grid min-w-0 gap-4 lg:sticky lg:top-28">
      <div><h2 className="text-sm font-semibold">iPhone protocol preview</h2><p className="mt-0.5 text-xs text-zinc-500">390 × 844 points · exported at 3× resolution</p></div>
      <div className="mx-auto w-full max-w-[402px] overflow-hidden rounded-[42px] border-[6px] border-zinc-900 bg-white shadow-xl">
        <div ref={frameRef} className="relative w-full" style={{ aspectRatio: '390/844' }}>
          <div ref={captureRef} data-protocol-screen style={{ position: 'absolute', width: 390, height: 844, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', color: '#070709', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif', overflow: 'clip', textAlign: 'left' }}>
            {day ? <ProtocolScreen days={days} selectedDay={selectedDay} completed={completed} scroll={scroll} openedTask={openedTask} disabled={exporting} onDay={value => { setSelectedDay(value); setOpenedTask(null) }} onToggle={toggle} onOpen={setOpenedTask} onScroll={setScroll} onFeedback={recordFeedback} /> : <div className="grid h-full place-items-center p-10 text-center text-sm text-zinc-500">Choose a focus area and generate your weekly protocol.</div>}
          </div>
        </div>
      </div>
      {day ? <><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={exporting} onClick={() => void exportProtocol(false)}><Download />Screenshot (PNG)</Button><Button disabled={exporting} onClick={() => void exportProtocol(true)}>{exporting ? <Loader2 className="animate-spin" /> : <Film />}{exporting ? `Exporting ${Math.round(progress * 100)}%` : 'Weekly video (MP4)'}</Button></div><p className="text-xs leading-5 text-zinc-500">Select days, check off tasks, or open a task for its tips. PNG captures the current view; the video shows all seven days.</p></> : null}
    </section>
  </div>
}

function Symbol({ name, size }: { name: string; size: number }) {
  return <Image unoptimized src={`/creator-icons/protocol/${name}.png`} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

function ProtocolScreen({ days, selectedDay, completed, scroll, openedTask, disabled, onDay, onToggle, onOpen, onScroll, onFeedback }: {
  days: MockProtocolDay[]; selectedDay: number; completed: Set<string>; scroll: number; openedTask: RoutineItem | null; disabled: boolean
  onDay: (day: number) => void; onToggle: (task: RoutineItem) => void; onOpen: (task: RoutineItem | null) => void; onScroll: (value: number) => void; onFeedback: (task: RoutineItem, outcome: ProtocolFeedback['outcome']) => void
}) {
  const day = days[selectedDay]
  const badgeColor = completed.size > 10 ? '#34d399' : '#58bdff'
  return <>
    <div style={{ height: 47 }} aria-hidden="true" />
    <header style={{ margin: '10px 20px 0', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h3 style={{ fontSize: 30, lineHeight: '32px', fontWeight: 600, letterSpacing: -1.2 }}>Protocol</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span aria-label={`${completed.size} tasks completed`} style={{ height: 34, minWidth: 60, borderRadius: 17, padding: '0 10px 0 9px', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'space-between', background: badgeColor, border: '1px solid rgba(190,235,255,.86)', boxShadow: `0 7px 14px ${badgeColor}29` }}><Symbol name="checkmark.seal.fill" size={17} /><span style={{ color: 'white', fontSize: 13, lineHeight: '15px', fontWeight: 800 }}>{completed.size}</span></span><span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center' }}><Symbol name="gearshape" size={18} /></span></div>
    </header>

    <div role="tablist" aria-label="Protocol week" style={{ height: 78, display: 'flex', gap: 9, padding: '8px 20px 10px', marginTop: 8 }}>
      {days.map((item, index) => {
        const active = selectedDay === index, today = index === 0, done = item.items.every(task => completed.has(task.id))
        const color = today ? '#1576a8' : active ? '#fff' : '#111113'
        return <button key={item.date} disabled={disabled} role="tab" aria-selected={active} aria-label={`${item.label} ${item.date}`} onClick={() => onDay(index)} style={{ width: 45, minWidth: 45, height: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, lineHeight: '13px', fontWeight: 700, color: today ? '#1576a8' : active ? '#111113' : '#8a8a93' }}>{item.label}</span>
          <span style={{ width: 33, height: 32, borderRadius: 12, border: `1px solid ${today ? '#9bdcff' : active ? 'rgba(255,255,255,.18)' : 'rgba(210,210,216,.72)'}`, background: today ? '#dff4ff' : active ? 'rgba(17,17,19,.92)' : 'rgba(255,255,255,.62)', display: 'grid', placeItems: 'center', color, fontSize: 14, lineHeight: '16px', fontWeight: 700 }}>{done ? '✓' : item.dayNumber}</span>
          <span style={{ width: 4, height: 4, borderRadius: 2, opacity: done ? .36 : 1, background: today ? '#49bfff' : active ? '#111113' : '#c8c8ce' }} />
        </button>
      })}
    </div>
    <div style={{ position: 'relative', height: 541, overflow: 'clip' }} onWheel={event => { if (!disabled) onScroll(Math.max(0, Math.min(175, scroll + event.deltaY))) }}>
      <div style={{ position: 'relative', height: 780, transform: `translateY(-${scroll}px)` }}>
        {Array.from({ length: 14 }, (_, index) => <div key={index} style={{ height: 54, borderTop: '1px solid #ececef', padding: '8px 0 0 18px', color: '#8d8d95', fontSize: 12, lineHeight: '16px', fontWeight: 700 }}>{String(index + 6).padStart(2, '0')}:00</div>)}
        {getScheduledRoutineItems(day.items, 6).map(({ item, hour, durationHours }) => {
          const done = completed.has(item.id)
          return <div key={item.id} style={{ position: 'absolute', left: 78, right: 20, top: (hour - 6) * 54 + 8, minHeight: Math.max(44, durationHours * 54 - 14), borderRadius: 18, background: `${item.color}${done ? '40' : '66'}`, border: '1px solid rgba(255,255,255,.72)', padding: '10px 13px', boxShadow: `0 8px 14px ${item.color}${done ? '06' : '17'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 34, height: 34, minWidth: 34, borderRadius: 13, background: 'rgba(255,255,255,.62)', border: '1px solid rgba(255,255,255,.78)', display: 'grid', placeItems: 'center' }}><Symbol name={item.icon.ios} size={22} /></span>
              <button disabled={disabled} onClick={() => onOpen(item)} style={{ flex: 1, minWidth: 0, fontSize: 16, lineHeight: '19px', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: done ? '#77777f' : '#111113', textDecoration: done ? 'line-through' : undefined }}>{item.title}</button>
              <button disabled={disabled} role="checkbox" aria-checked={done} aria-label={`Complete ${item.title}`} onClick={() => onToggle(item)} style={{ width: 30, height: 30, minWidth: 30, borderRadius: 10, border: `1.5px solid ${done ? item.color : 'rgba(17,17,19,.24)'}`, background: done ? item.color : '#fff', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20 }}>{done ? '×' : null}</button>
            </div>
            <button disabled={disabled} onClick={() => onOpen(item)} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 7, color: '#77777f', fontSize: 12, lineHeight: '16px', textAlign: 'left' }}>{item.detail}</button>
          </div>
        })}
      </div>
    </div>
    <nav aria-label="Mobile app navigation" style={{ position: 'absolute', left: 8, right: 8, bottom: 20, height: 66, borderRadius: 34, background: 'rgba(247,247,249,.96)', border: '1px solid rgba(210,210,216,.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
      {[['bolt', 'Battle'], ['trophy', 'Leaderboard'], ['circle.grid.2x2.topleft.checkmark.filled', 'Protocol'], ['doc.text', 'Evaluation']].map(([icon, label]) => <span key={label} style={{ width: 78, height: 54, borderRadius: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: label === 'Protocol' ? '#e6e6e9' : undefined }}><Symbol name={icon} size={23} /><span style={{ fontSize: 10, lineHeight: '12px', fontWeight: 600, color: label === 'Protocol' ? '#111111' : '#8a8a93' }}>{label}</span></span>)}
    </nav>
    <span style={{ position: 'absolute', bottom: 8, left: 128, width: 134, height: 5, borderRadius: 3, background: '#070709' }} />
    {openedTask ? <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.2)', display: 'flex', alignItems: 'flex-end', padding: '0 12px 32px' }}><section aria-label="Protocol task details" style={{ width: '100%', background: '#fff', borderRadius: 32, padding: 20, display: 'grid', gap: 16, maxHeight: 720, overflowY: 'auto' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Symbol name={openedTask.icon.ios} size={24} /><h4 style={{ fontSize: 25, lineHeight: '28px', letterSpacing: -.8, fontWeight: 700, flex: 1 }}>{openedTask.title}</h4><button disabled={disabled} aria-label="Close task details" onClick={() => onOpen(null)} style={{ width: 34, height: 34, fontSize: 24 }}>×</button></div><p style={{ fontSize: 15, lineHeight: '21px', color: 'rgba(7,7,9,.68)' }}>{openedTask.detail}</p>{openedTask.reason ? <p style={{ padding: 12, borderRadius: 16, background: '#eef8ff', color: '#1576a8', fontSize: 13, lineHeight: '18px' }}>{openedTask.reason}<br />{openedTask.minutes ?? 2} min{openedTask.evidence ? ` · ${openedTask.evidence}` : ''}</p> : null}<span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(7,7,9,.52)', fontWeight: 700 }}>TIPS</span>{openedTask.tips?.map((tip, index) => <p key={tip} style={{ border: '1px dashed #d8d8de', borderRadius: 16, padding: '9px 12px', fontSize: 13, lineHeight: '18px', color: 'rgba(7,7,9,.72)' }}><strong style={{ marginRight: 9 }}>{index + 1}</strong>{tip}</p>)}<button disabled={disabled} onClick={() => { onToggle(openedTask); onOpen(null) }} style={{ background: '#111113', color: '#fff', borderRadius: 22, padding: 14, fontSize: 15, fontWeight: 600 }}>{completed.has(openedTask.id) ? 'Mark incomplete' : 'Complete task'}</button><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{protocolFeedbackOptions.filter(option => option.id !== 'done').map(option => <button key={option.id} disabled={disabled} onClick={() => onFeedback(openedTask, option.id)} style={{ minHeight: 44, padding: 10, borderRadius: 12, background: '#f3f3f7', fontSize: 12 }}>{option.label}</button>)}</div></section></div> : null}
  </>
}
