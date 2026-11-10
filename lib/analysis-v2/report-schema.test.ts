import { expect, test } from 'bun:test'
import registry from './rubric-registry.json'
import { parseWebOverview } from './report-schema'
import { protocolContextSchema } from '@/lib/analysis/schema'

const overview = () => ({
  faceDetected: true, pslScore: 5.5, overallScore: 6, harmonyScore: 6, symmetryScore: 6,
  proportionalityScore: 6, averagenessScore: 6, dimorphismScore: 6, angularityScore: 6,
  summary: 'Visible facial balance and presentation.', eyeColor: 'brown', hairColor: 'brown',
  categories: registry.categories.map(category => ({ id: category.id, score: 6, explanation: 'Visible contours and placement.', recommendation: 'Maintain a consistent grooming routine.' })),
})

test('optional color variations cannot fail a valid report or trigger a costly regeneration', () => {
  for (const [input, expected] of [['Grey', 'gray'], [' DARK-BROWN ', 'dark brown'], ['unknown', null], [undefined, null], [42, null]] as const) {
    const result = parseWebOverview({ ...overview(), eyeColor: input, hairColor: 'Blonde' })
    expect(result.eyeColor).toBe(expected)
    expect(result.hairColor).toBe('blond')
    expect(result.overallScore).toBe(6)
  }
})

test('keyed categories retain strict coverage, numeric scores, IDs and explanations', () => {
  const categories = Object.fromEntries(overview().categories.map(({ id, ...value }) => [id, value]))
  expect(parseWebOverview({ ...overview(), categories }).categories).toEqual(overview().categories)
  delete categories.eyes
  expect(() => parseWebOverview({ ...overview(), categories })).toThrow()
  expect(() => parseWebOverview({ ...overview(), categories: null })).toThrow()
})

test('unsupported optional concern labels do not discard validated scores and report categories', () => {
  const protocolContext = { faceShape: 'oval', hairTexture: 'wavy', visibleConcerns: ['unsupported-a', 'unsupported-b'] }
  expect(protocolContextSchema.safeParse(protocolContext).success).toBe(false)
  const result = parseWebOverview({ ...overview(), protocolContext })
  expect(result.protocolContext).toBeUndefined()
  expect(result.pslScore).toBe(5.5)
  expect(result.categories).toHaveLength(registry.categories.length)
  expect(result.categories.every(category => category.recommendation)).toBe(true)
})

test('valid context survives unchanged; omitted or malformed optional context stays absent', () => {
  const protocolContext: import('zod').infer<typeof protocolContextSchema> = { faceShape: 'oval', hairTexture: 'wavy', visibleConcerns: ['dryness', 'dry-lips'] }
  expect(parseWebOverview({ ...overview(), protocolContext }).protocolContext).toEqual(protocolContext)
  expect(parseWebOverview(overview()).protocolContext).toBeUndefined()
  expect(parseWebOverview({ ...overview(), protocolContext: 'invalid' }).protocolContext).toBeUndefined()
})

test('required scores, category coverage, and face-detection validation remain strict', () => {
  const context = { visibleConcerns: ['unsupported'] }
  for (const invalid of [{ pslScore: 9 }, { overallScore: 11 }, { categories: overview().categories.slice(1) }, { faceDetected: 'yes' }]) {
    expect(() => parseWebOverview({ ...overview(), protocolContext: context, ...invalid })).toThrow()
  }
})

test('invalid optional potential enrichment is omitted without relaxing the report scores', () => {
  const result = parseWebOverview({ ...overview(), potential: { score: 11, label: 'Unsupported', focusAreas: [] } })
  expect(result.potential).toBeUndefined()
  expect(result.overallScore).toBe(6)
  expect(result.categories).toHaveLength(registry.categories.length)
  expect(() => parseWebOverview({ ...overview(), overallScore: 11, potential: 'invalid' })).toThrow()
})
