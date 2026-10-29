import { expect, test } from 'bun:test'
import { buildCheekContextGroups, buildLegacyRubricGroups, buildWebRubricGroups, formatRubricValue, layoutWebRubrics } from './web-report'
import { designValues } from './preview-fixtures'
import sampleEntries from './sample-entries.json'
import registry from './rubric-registry.json'
import type { RubricEstimate } from './evaluator'

const entries: RubricEstimate[] = registry.categories.flatMap(category => category.rubrics.map(rubric => ({ id: rubric.id, value: 'Observed', evidence: 'Visible in capture', source: 'llm-estimate', grade: null })))

test('Cheeks includes existing related measurements without fabricating or regrading observations', () => {
  const saved = [
    { id: 'jaw.width', value: .8, positions: [.4], grade: 6 },
    { id: 'face.frame', value: .72, positions: [.5], grade: 7 },
    { id: 'face.temple-width', value: .93, positions: [.6], grade: 7 },
    { id: 'symmetry.cheek-outline', value: 'Similar' },
    { id: 'face.forehead-width', value: null },
  ]
  const original = JSON.stringify(saved)
  const context = buildCheekContextGroups(saved)[0].rubrics
  expect(context).toHaveLength(4)
  expect(context.find(rubric => rubric.id === 'jaw.width')).toMatchObject({ value: '0.80×', positions: [.4], grade: 6 })
  expect(context.every(rubric => rubric.measurement?.startsWith('Related measurement'))).toBe(true)
  expect(buildCheekContextGroups([])).toEqual([])
  expect(JSON.stringify(saved)).toBe(original)
})

test('legacy reports preserve saved values and only calibrate explicit supported scores', () => {
  const category = { id: 'overall', title: 'Overall', features: [
    { label: 'PSL', value: '5.6 / 8' }, { label: 'Eyes', value: '8.1 / 10' },
    { label: 'Shape', value: 'Almond' }, { label: 'Angle', value: 'Obtuse', measurement: '137.2°' },
    { label: 'Missing', value: 'Unavailable' }, { label: 'Invalid', value: '12 / 10' },
  ] }
  const original = JSON.stringify(category)
  const rubrics = buildLegacyRubricGroups(category)[0].rubrics
  expect(rubrics.map(rubric => rubric.value)).toEqual(category.features.map(feature => feature.value))
  expect(rubrics[0].positions[0]).toBeCloseTo(.7)
  expect(rubrics[1].positions[0]).toBeCloseTo(.81)
  expect(rubrics[3].measurement).toBe('137.2°')
  expect(rubrics.slice(2).every(rubric => rubric.visual === 'Text' && rubric.positions.length === 0)).toBe(true)
  expect(JSON.stringify(category)).toBe(original)
})

test('separate categories present supported primary rubrics exactly once', () => {
  const rendered = registry.categories.flatMap(category => buildWebRubricGroups(category.id === 'face' ? 'face-shape' : category.id, entries).flatMap(group => group.rubrics.map(rubric => rubric.id)))
  const primary = registry.categories.flatMap(category => category.rubrics.filter(rubric => rubric.output !== 'D').map(rubric => rubric.id))
  expect(rendered.length).toBe(primary.length)
  expect(new Set(rendered)).toEqual(new Set(primary))
  expect(buildWebRubricGroups('eyes', entries).flatMap(group => group.rubrics).every(rubric => rubric.id.startsWith('eyes.'))).toBe(true)
  expect(buildWebRubricGroups('brows', entries)[0].id).toBe('brows')
})

test('unsupported values are omitted even when illustrative markers exist', () => {
  const missing = entries.map(entry => ({ ...entry, value: null }))
  expect(buildWebRubricGroups('eyes', missing, { 'eyes.spacing': { positions: [.5] } })[0].rubrics).toEqual([])
  const supported = buildWebRubricGroups('eyes', entries)[0].rubrics
  expect(supported.every(rubric => rubric.positions.length === 0 && rubric.grade === null)).toBe(true)
})

test('measurement units preserve paired angles, shares and zero values', () => {
  expect(formatRubricValue('eyes.canthal-tilt', 'A', [2, 4])).toBe('L 2.0° · R 4.0°')
  expect(formatRubricValue('proportions.upper-third', 'R', .32)).toBe('32.0%')
  expect(formatRubricValue('symmetry.eyes-height', 'B', 0)).toBe('0.0%')
})

test('complete design inventory and every partial category pack without empty halves', () => {
  const design = sampleEntries.map(entry => ({ id: entry.id, value: designValues[entry.id] ?? entry.value }))
  for (const category of registry.categories) {
    const rubrics = buildWebRubricGroups(category.id, design)[0].rubrics
    expect(rubrics.length).toBe(category.rubrics.filter(rubric => rubric.output !== 'D').length)
    for (let count = 0; count <= rubrics.length; count++) {
      const layout = layoutWebRubrics(rubrics.slice(0, count))
      expect(layout.filter(item => !item.full).length % 2).toBe(0)
      expect(new Set(layout.map(item => item.rubric.id)).size).toBe(count)
    }
  }
  expect(formatRubricValue('brows.arch', 'A', [154, 152])).toBe('L 154.0° · R 152.0°')
  expect(formatRubricValue('nose.alar-angle', 'A', [92, 94])).toBe('L 92.0° · R 94.0°')
  expect(formatRubricValue('brows.density', 'T', 'moderate')).toBe('Moderate Coverage')
})

test('ungraded results use normal cards while scored results use glass rails', () => {
  const sample = buildWebRubricGroups('proportions', [{ id: 'proportions.lower-partition', value: .45 }])[0].rubrics[0]
  expect(sample.visual).toBe('Text')
  const design = buildWebRubricGroups('proportions', [{ id: 'proportions.lower-partition', value: .45 }], { 'proportions.lower-partition': { positions: [], grade: 8.2 } })[0].rubrics[0]
  expect(design.visual).toBe('Rail')
  expect(design.grade).toBe(8.2)
  expect(design.value).toBe('45.0%')
})

test('paired angular rubrics occupy the same row', () => {
  const entries = [
    { id: 'proportions.convexity', value: 168 },
    { id: 'proportions.angle-coordination', value: 2.5 },
    { id: 'proportions.vertical-alignment', value: [.02, -.01, .01] },
  ]
  const visuals = { 'proportions.convexity': { positions: [.5] }, 'proportions.angle-coordination': { positions: [.55] } }
  const layout = layoutWebRubrics(buildWebRubricGroups('proportions', entries, visuals)[0].rubrics)
  const paired = layout.filter(item => !item.full)
  expect(paired.map(item => item.rubric.id)).toEqual(['proportions.convexity', 'proportions.angle-coordination'])
  expect(paired.every(item => item.rubric.visual === 'Orbit')).toBe(true)
})

test('graphics are distributed through observations without shuffling either content sequence', () => {
  const graphics = Array.from({ length: 3 }, (_, index) => ({ id: `chart-${index}`, label: 'Measurement', value: '0.5×', visual: 'Capsule', positions: [.5], grade: null }))
  const observations = Array.from({ length: 6 }, (_, index) => ({ id: `note-${index}`, label: 'Observation', value: 'Observed', visual: 'Text', positions: [], grade: null }))
  const layout = layoutWebRubrics([...graphics, ...observations])
  expect(layout.filter(item => item.rubric.visual !== 'Text').map(item => item.rubric.id)).toEqual(graphics.map(item => item.id))
  expect(layout.filter(item => item.rubric.visual === 'Text').map(item => item.rubric.id)).toEqual(observations.map(item => item.id))
  expect(layout.map(item => item.rubric.id)).toEqual(['note-0', 'note-1', 'chart-0', 'note-2', 'note-3', 'chart-1', 'note-4', 'note-5', 'chart-2'])
  expect(layoutWebRubrics([...graphics, ...observations])).toEqual(layout)
  const rails = graphics.slice(0, 2).map(rubric => ({ ...rubric, visual: 'Rail' }))
  const railLayout = layoutWebRubrics([...rails, ...observations])
  const railIndexes = railLayout.flatMap((item, index) => item.rubric.visual === 'Rail' ? [index] : [])
  expect(railIndexes[1] - railIndexes[0]).toBeGreaterThan(1)
})

test('directional dials use quality grades while range dials retain measured positions', () => {
  const rubrics = buildWebRubricGroups('proportions', [
    { id: 'proportions.convexity', value: 168 },
    { id: 'proportions.angle-coordination', value: 2.5 },
  ], {
    'proportions.convexity': { positions: [.51] },
    'proportions.angle-coordination': { positions: [.5], grade: 8.6 },
  })[0].rubrics
  expect(rubrics[0].scale).toBe('range')
  expect(rubrics[0].positions).toEqual([.51])
  expect(rubrics[1].scale).toBe('quality')
  expect(rubrics[1].positions).toEqual([.86])
})

test('Overall alternates instruments and score-only cards without reordering or changing scores', () => {
  const rubrics = Array.from({ length: 7 }, (_, index) => ({ id: `overall.${index}`, label: `Category ${index}`, value: `${index} / 10`, visual: 'Orbit', positions: [index / 10], grade: null, scale: 'quality' as const }))
  const layout = layoutWebRubrics(rubrics, 'summary')
  expect(layout.map(item => item.rubric.id)).toEqual(rubrics.map(rubric => rubric.id))
  expect(layout.map(item => item.rubric.visual)).toEqual(['Orbit', 'Text', 'Orbit', 'Text', 'Orbit', 'Text', 'Orbit'])
  expect(layout.map(item => item.rubric.value)).toEqual(rubrics.map(rubric => rubric.value))
  expect(layout.filter(item => !item.full)).toHaveLength(6)
  expect(rubrics.every(rubric => rubric.visual === 'Orbit')).toBe(true)
  expect(layoutWebRubrics([], 'summary')).toEqual([])
})
