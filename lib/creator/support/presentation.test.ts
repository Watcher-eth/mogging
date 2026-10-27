import { test, expect } from 'bun:test'
import { selectSupportArtifacts, timeChartKind } from './presentation'
import { createDemoDataSource } from './demo'
import type { SupportArtifact } from './contracts'

test('chooses summary for a single observation, bars for short discrete periods and lines for longer trends', () => {
  expect(timeChartKind(1)).toBe('summary')
  expect(timeChartKind(2)).toBe('bar')
  expect(timeChartKind(7)).toBe('bar')
  expect(timeChartKind(30)).toBe('line')
  expect(timeChartKind(3,'Show the trend over time')).toBe('line')
})
test('caps rich sections at two and prioritizes requested views over generic analytics', async () => {
  const source=createDemoDataSource()
  const report=await source.videoAnalytics({days:7})
  const posts=await source.submissions({})
  const artifacts:SupportArtifact[]=[{type:'video-analytics',report},{type:'submission-views',rows:[],scope:'Current'},{type:'submissions',...posts},{type:'campaigns',campaigns:await source.campaigns()}]
  expect(selectSupportArtifacts('How did my video do?',artifacts).map(a=>a.type)).toEqual(['video-analytics','submissions'])
  expect(selectSupportArtifacts('Show my video views',artifacts).map(a=>a.type)).toEqual(['submission-views','submissions'])
  const comparison=selectSupportArtifacts('Which videos converted best?',artifacts).find(a=>a.type==='video-analytics')!
  expect(comparison.presentation).toBe('comparison')
})
