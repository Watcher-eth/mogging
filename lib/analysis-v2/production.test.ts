import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import registry from './rubric-registry.json'
import { designValues } from './preview-fixtures'
import { parseGradedEstimates, rubricBatches } from './evaluator'
import { createCompatibleReport, webPhotoHash, webAnalyzeSchema } from './production'
import { webReportSchema } from './report-schema'
import { analysisProviderResultSchema, analysisReportSchema } from '@/lib/analysis/schema'
import { buildWebRubricGroups } from './web-report'

const definitions = registry.categories.flatMap(category => category.rubrics)
const entries = definitions.map(rubric => ({ id: rubric.id, value: designValues[rubric.id] ?? null, evidence: 'Visible feature', source: 'llm-estimate' as const, grade: 7.1, positions: [.6] }))
const web = webReportSchema.parse({ version: 2, summary: 'Visible facial balance and presentation.', overallScore: 7.1, categories: registry.categories.map(category => ({ id: category.id, score: 7.1, explanation: 'Clear visible contours with balanced placement.' })), entries, eyeColor: 'blue', hairColor: 'brown', contours: { hair: [], ears: [] }, timingMs: 20000 })

test('new web reports preserve the original exact mobile report schema', () => {
  const result = analysisProviderResultSchema.parse({ faceDetected: true, pslScore: 5.5, harmonyScore: 7.1, dimorphismScore: 7.1, angularityScore: 7.1 })
  const compatible = analysisReportSchema.parse(createCompatibleReport(result, web))
  expect(compatible.categories).toHaveLength(11)
  expect(compatible.categories.find(category => category.id === 'overall')?.features).toHaveLength(6)
  expect(compatible.categories.some(category => String(category.id) === 'hair')).toBe(false)
  expect(web.categories).toHaveLength(12)
})
test('web scans cannot overwrite legacy images or another scan or owner', () => {
  const hash = 'a'.repeat(64)
  expect(webPhotoHash(hash, 'owner-a', 'scan-1')).not.toBe(hash)
  expect(webPhotoHash(hash, 'owner-a', 'scan-1')).not.toBe(webPhotoHash(hash, 'owner-b', 'scan-1'))
  expect(webPhotoHash(hash, 'owner-a', 'scan-1')).not.toBe(webPhotoHash(hash, 'owner-a', 'scan-2'))
  expect(webPhotoHash(hash, 'owner-a', 'scan-1')).toBe(webPhotoHash(hash, 'owner-a', 'scan-1'))
})
test('legacy route and provider do not import the new pipeline', () => {
  expect(readFileSync('pages/api/analyze.ts', 'utf8')).not.toContain('analysis-v2')
  expect(readFileSync('lib/analysis/provider.ts', 'utf8')).not.toContain('analysis-v2')
  expect(readFileSync('pages/api/web/analyze.ts', 'utf8')).toContain("'web-v2:'")
  expect(webAnalyzeSchema.safeParse({ imageData: 'sample', mesh: { points: [] } }).success).toBe(false)
})
test('real report grades and positions select visuals without design fixtures', () => {
  const group = buildWebRubricGroups('skin', [{ id: 'skin.texture', value: 2, grade: 6.3, positions: [.63] }])[0]
  expect(group.rubrics[0].visual).toBe('Rail')
  expect(group.rubrics[0].grade).toBe(6.3)
  const hidden = buildWebRubricGroups('skin', [{ id: 'skin.texture', value: null, grade: null, positions: [] }])[0]
  expect(hidden.rubrics).toHaveLength(0)
})
test('malformed optional graphics degrade to normal cards without inventing scores', () => {
  const rubric = rubricBatches.flat().find(rubric => rubric.id === 'eyes.spacing')!
  expect(parseGradedEstimates(JSON.stringify({ entries: [[rubric.id, .45, 'Visible spacing', 7.1, [.55]]] }), [rubric])[0].grade).toBe(7.1)
  const invalid = parseGradedEstimates(JSON.stringify({ entries: [[rubric.id, .45, 'Visible spacing', 11, [-1, [.4]]]] }), [rubric])[0]
  expect(invalid.value).toBe(.45)
  expect(invalid.grade).toBeNull()
  expect(invalid.positions).toEqual([])
  expect(buildWebRubricGroups('eyes', [invalid])[0].rubrics[0].visual).toBe('Text')
  expect(parseGradedEstimates(JSON.stringify({ entries: [[rubric.id, null, 'Obscured', null, []]] }), [rubric])[0].positions).toEqual([])
})

test('invalid individual observations do not discard valid neighboring measurements', () => {
  const rubrics = rubricBatches.flat().filter(rubric => ['brows.thickness', 'eyes.spacing'].includes(rubric.id))
  const parsed = parseGradedEstimates(JSON.stringify({ entries: [
    ['brows.thickness', [.2,.3], 'Ambiguous pair for a scalar', null, []],
    ['eyes.spacing', .45, 'Visible spacing', 7.1, [.55]],
  ] }), rubrics)
  expect(parsed[0].value).toBeNull()
  expect(parsed[1].value).toBe(.45)
  expect(() => parseGradedEstimates(JSON.stringify({ entries: [['unknown', .45, 'Unsupported', null, []]] }), rubrics)).toThrow()
})
