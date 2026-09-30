import { selectProtocolTasks, protocolDefaultProducts, type ProtocolProductId, type ProtocolTask } from './protocol-tasks'
// Mobile task catalog and focus scheduling are synced from protocol-tasks.ts.
import { reportCategories } from './mobile-overlay-engine/report-data'

export const protocolFocusAreas = reportCategories.map(category => ({ id: category.id, label: category.id === 'jaw' ? 'Jawline' : category.title }))
export const protocolSize = { width: 390, height: 844 }
export type MockProtocolDay = { date: string; label: string; dayNumber: number; items: RoutineItem[] }

export type RoutineItem = ProtocolTask & { id: string; cadence: string; dayOffset: number }

export { scheduleProtocolTasks as getScheduledRoutineItems } from './protocol-tasks'

export function buildMockProtocol(focusId: string, startDate: string, skinProducts: readonly ProtocolProductId[] = protocolDefaultProducts): MockProtocolDay[] {
  if (!protocolFocusAreas.some(area => area.id === focusId)) throw new Error('Choose a protocol focus area')
  const start = new Date(`${startDate}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || localDate(start) !== startDate) throw new Error('Choose a valid start date')
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    const count = [2, 3, 2, 3, 2, 4, 3][offset]
    const items = selectProtocolTasks({ focusIds: [focusId], date: localDate(date), count, skinProducts }).map(task => ({
      ...task, id: `looks-${task.key}-p${offset}`, dayOffset: offset, cadence: 'Personalized protocol',
    }))
    return { date: localDate(date), label: offset === 0 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()], dayNumber: date.getDate(), items }
  })
}

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
