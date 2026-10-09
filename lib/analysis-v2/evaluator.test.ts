import { expect, test } from 'bun:test'
import { evaluateV2, parseEstimates, rubricBatches, rubricVectorSizes, reconcileEstimates, geometryEntries } from './evaluator'

const capture = { front: true, side: false, hairline: true, neutralEyes: true, neutralMouth: true, bothEars: true, evenLight: true, detail: true }

function entries(batch: typeof rubricBatches[number]) {
  return batch.map(rubric => [rubric.id, ['T', 'D'].includes(rubric.output) ? 'Uncertain' : rubricVectorSizes[rubric.id] ? Array(rubricVectorSizes[rubric.id]).fill(.2) : 1, 'Visible sample evidence'])
}
test('registry batches cover all 116 rubric IDs once', () => {
  const ids = rubricBatches.flat().map(rubric => rubric.id)
  expect(ids.length).toBe(116)
  expect(new Set(ids).size).toBe(116)
})
test('keeps paired raw measurements and rejects incomplete or duplicate outputs', () => {
  const batch = rubricBatches[0]
  expect(parseEstimates(JSON.stringify({ entries: entries(batch) }), batch).length).toBe(batch.length)
  expect(() => parseEstimates(JSON.stringify({ entries: entries(batch).slice(1) }), batch)).toThrow('Incomplete')
  expect(() => parseEstimates(JSON.stringify({ entries: [...entries(batch), entries(batch)[0]] }), batch)).toThrow('duplicate')
})
test('starts all LLM batches before waiting for any, preserving complete results', async () => {
  const originalKey = process.env.MOONSHOT_API_KEY
  process.env.MOONSHOT_API_KEY = 'test-only'
  const resolvers: Array<(response: Response) => void> = []
    const estimatedBatches = rubricBatches.map(batch => batch.filter(rubric => rubric.output !== 'D'))
  const fetcher = (() => new Promise<Response>(resolve => resolvers.push(resolve)))
  try {
    const pending = evaluateV2({ imageDataUrl: 'data:image/jpeg;base64,test', geometry: null }, { fetcher })
    expect(resolvers.length).toBe(3)
    resolvers.forEach((resolve, index) => resolve(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ capture, entries: entries(estimatedBatches[index]) }) } }] })))
    const result = await pending
    expect(result.entries.length).toBe(116)
    expect(result.entries.every(entry => entry.grade === null)).toBe(true)
  } finally {
    if (originalKey === undefined) Reflect.deleteProperty(process.env, 'MOONSHOT_API_KEY')
    else process.env.MOONSHOT_API_KEY = originalKey
  }
})

test('a failed batch cancels sibling provider calls instead of leaving paid work running', async () => {
  const originalKey = process.env.MOONSHOT_API_KEY
  process.env.MOONSHOT_API_KEY = 'test-only'
  let calls = 0
  let cancelled = 0
  const fetcher = async (_url: string, options: RequestInit): Promise<Response> => {
    if (calls++ === 0) return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{broken' } }] })
    return new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => { cancelled++; reject(new Error('Cancelled')) }, { once: true }))
  }
  try {
    await expect(evaluateV2({ imageDataUrl: 'test', geometry: null }, { fetcher })).rejects.toThrow()
    expect(calls).toBe(3)
    expect(cancelled).toBe(2)
  } finally {
    if (originalKey === undefined) Reflect.deleteProperty(process.env, 'MOONSHOT_API_KEY')
    else process.env.MOONSHOT_API_KEY = originalKey
  }
})


test('withholds unsupported capture requirements consistently across categories', () => {
  const raw = rubricBatches.flatMap(batch => parseEstimates(JSON.stringify({ entries: entries(batch) }), batch))
  const result = reconcileEstimates(raw, [capture, { ...capture, hairline: false }, capture])
  const value = (id: string) => result.entries.find(entry => entry.id === id)!.value
  for (const id of ['face.forehead-height', 'proportions.upper-third', 'proportions.middle-third', 'proportions.lower-third', 'jaw.angle', 'nose.rotation', 'hair.grooming']) expect(value(id)).toBeNull()
  expect(value('eyes.inner-gap')).toBe(1)
  expect(result.entries.filter(entry => entry.source === 'derived').length).toBe(3)
  expect(result.entries.map(entry => entry.id)).toEqual(rubricBatches.flat().map(entry => entry.id).sort((a, b) => {
    // Final order follows the registry, not the concurrent batch completion order.
    const categories = ['eyes', 'brows', 'nose', 'mouth', 'jaw', 'cheeks', 'face', 'proportions', 'symmetry', 'skin', 'hair', 'ears']
    return categories.indexOf(a.split('.')[0]) - categories.indexOf(b.split('.')[0])
  }))
})

test('rejects impossible numeric types, vector lengths and signed ratios', () => {
  for (const [id, value] of [['eyes.aspect', [1, 2, 3]], ['eyes.spacing', -1], ['eyes.canthal-tilt', [181, 2]], ['symmetry.eyes-opening', [1, 2]]] as const) {
    const batch = rubricBatches.flat().filter(rubric => rubric.id === id)
    expect(() => parseEstimates(JSON.stringify({ entries: [[id, value, 'Test evidence']] }), batch)).toThrow()
  }
})

test('derived eye balance uses aspect ratios rather than raw opening heights; bad meshes have no ownership', () => {
  const geometry = { version: 2, source: 'mediapipe-2d-geometry', revision: 'test', metrics: [
    { id: 'eye-aspect-left', value: 4 }, { id: 'eye-aspect-right', value: 5 },
    { id: 'eye-opening-difference', value: 70 }, { id: 'lip-balance', value: 1.3 },
  ], quality: { faceTooSmall: false, cropped: false, noseOffsetRatio: 0, pupilSource: 'iris-centers', rollDegrees: 0, warnings: [] } } as unknown as NonNullable<Parameters<typeof geometryEntries>[0]>
  const calculated = geometryEntries(geometry)
  expect(calculated.find(entry => entry.id === 'symmetry.eyes-opening')!.value).toBeCloseTo(100 / 4.5)
  expect(calculated.some(entry => entry.id === 'mouth.lip-ratio')).toBe(false)
  expect(geometryEntries({ ...geometry, quality: { ...geometry.quality, cropped: true } })).toEqual([])
})


test('reconciles eye balance from the accepted paired measurement and rejects freckle grading', () => {
  const raw = rubricBatches.flatMap(batch => parseEstimates(JSON.stringify({ entries: entries(batch) }), batch))
  const aspect = raw.find(entry => entry.id === 'eyes.aspect')!
  aspect.value = [4, 5]
  const blemishes = raw.find(entry => entry.id === 'skin.blemishes')!
  blemishes.evidence = 'Natural freckles visible'
  const result = reconcileEstimates(raw, [capture])
  expect(result.entries.find(entry => entry.id === 'symmetry.eyes-opening')!.value).toBeCloseTo(100 / 4.5)
  expect(result.entries.find(entry => entry.id === 'skin.blemishes')!.value).toBeNull()
})

test('a partially unavailable pair stays unavailable instead of inventing its missing member', () => {
  const batch = rubricBatches.flat().filter(rubric => rubric.id === 'eyes.aspect')
  expect(parseEstimates(JSON.stringify({ entries: [['eyes.aspect', [4, null], 'One eye obscured']] }), batch)[0].value).toBeNull()
})

test('visible contour estimates do not require upstream segmentation masks', () => {
  const raw = rubricBatches.flatMap(batch => parseEstimates(JSON.stringify({ entries: entries(batch) }), batch))
  const result = reconcileEstimates(raw, [capture])
  for (const id of ['brows.thickness', 'nose.nostril-visibility', 'nose.alar-angle', 'proportions.angle-coordination']) {
    expect(result.entries.find(entry => entry.id === id)!.value).not.toBeNull()
  }
  expect(rubricVectorSizes['brows.arch']).toBe(2)
})
