import { ProtocolSchedule } from './protocol-schedule'
import { useEffect, useMemo, useState } from 'react'
import { formatProtocolDate, selectProtocolTasks, type ProtocolPerson, type ProtocolProfile } from '@/lib/creator/protocol-tasks'
import { trackWebEvent } from '@/lib/analytics/client'

export default function ProtocolPage({ userId, profile, gender, hasEvaluation, preview, desktop = true }: {
  userId: string; profile: ProtocolProfile; gender: ProtocolPerson['gender']; hasEvaluation: boolean; preview?: boolean; desktop?: boolean
}) {
  const storageKey = `mogging:web-protocol:${userId}`
  const [today, setToday] = useState('')
  const [selected, setSelected] = useState('')
  const [minutes, setMinutes] = useState<ProtocolProfile['minutes']>(profile.minutes)
  const [completed, setCompleted] = useState<string[]>([])
  useEffect(() => {
    setToday(formatProtocolDate(new Date()))
    setSelected('')
    try {
      const savedMinutes = Number(localStorage.getItem(storageKey + ':minutes'))
      if ([5, 15, 30].includes(savedMinutes)) setMinutes(savedMinutes as ProtocolProfile['minutes'])
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      setCompleted(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [])
    } catch { setCompleted([]) }
  }, [storageKey])
  useEffect(() => { if (!preview) trackWebEvent('protocol_viewed', { mode: 'self' }) }, [preview])
  const date = selected || today
  const days = useMemo(() => today ? Array.from({ length: 45 }, (_, index) => {
    const day = new Date(`${today}T12:00:00`)
    day.setDate(day.getDate() + index - 7)
    const key = formatProtocolDate(day)
    return { key, day, tasks: hasEvaluation ? selectProtocolTasks({ date: key, focusIds: profile.focusIds, profile: { ...profile, minutes }, gender }) : [] }
  }) : [], [today, profile, minutes, hasEvaluation, gender])
  function toggle(taskKey: string) {
    const id = `${date}:${taskKey}`
    const marked = completed.includes(id)
    const next = marked ? completed.filter(value => value !== id) : [...completed, id]
    setCompleted(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep the current session usable. */ }
    if (!marked && !preview) trackWebEvent('protocol_task_completed', { task_id: taskKey, mode: 'self' })
  }

  return <ProtocolSchedule desktop={desktop} days={days} date={date} today={today} completed={completed}
    onDay={setSelected} onToggle={toggle} hasEvaluation={hasEvaluation} minutes={minutes} onMinutes={value => {
      setMinutes(value)
      try { localStorage.setItem(storageKey + ':minutes', String(value)) } catch { /* Session-only setting. */ }
    }} />
}
