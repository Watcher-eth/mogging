import { expect, test } from 'bun:test'
import { analyticsEventSchema } from './events'
import { analyticsEventNames, isRetiredAnalyticsSurface, sanitizeProperties } from './contract'

const event = (eventName: string, properties: Record<string,unknown>) => analyticsEventSchema.safeParse({eventId:crypto.randomUUID(),eventName,properties,platform:'ios',occurredAt:new Date().toISOString()})
test('learning events require content IDs and valid foreground durations',()=>{
  expect(event('course_lesson_viewed',{course_id:'capture',lesson_id:'lighting'}).success).toBe(true)
  expect(event('course_lesson_completed',{lesson_id:'lighting'}).success).toBe(false)
  expect(event('course_completed',{}).success).toBe(false)
  for (const duration_ms of [-1,'12000',Infinity,1800001]) expect(event('progress_exited',{duration_ms}).success).toBe(false)
  expect(event('progress_exited',{duration_ms:12000,history_state:'comparison'}).success).toBe(true)
})
test('retired events no longer belong to the catalog and retired surfaces are recognizable',()=>{
  expect(analyticsEventNames.some(name=>name.startsWith('battle_')||name.startsWith('leaderboard_'))).toBe(false)
  expect(event('battle_vote_selected',{}).success).toBe(false)
  expect(isRetiredAnalyticsSurface('/leaderboard?sort=rating')).toBe(true)
  expect(isRetiredAnalyticsSurface('Reports/progress')).toBe(false)
})
test('learning IDs survive attribution budgets without leaking quiz answers or score values',()=>{
  const properties=sanitizeProperties({source:'x'.repeat(160),utm_campaign:'x'.repeat(160),course_id:'capture',lesson_id:'lighting',duration_ms:12000,score:9,answer:'private'})
  expect(properties).toMatchObject({course_id:'capture',lesson_id:'lighting',duration_ms:12000})
  expect(properties).not.toHaveProperty('score')
  expect(properties).not.toHaveProperty('answer')
})
