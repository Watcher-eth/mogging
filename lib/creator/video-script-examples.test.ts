import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { videoScriptExamples } from './video-script-examples'
import { compileAnalysisVideo } from './video-composition'
import { narrationText } from './video-voiceover'
import { scriptToPlan } from './script-edit'
import { reportCategories } from './mock-report-data'
import type { AnalysisPostInput } from './analysis-post'
import { hasCaption } from './video-layout'

const input: AnalysisPostInput = { formatId: 'feature-audit', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' }

test('Marlon uses the replacement portraits at their native dimensions with fresh asset identities', () => {
  const images = videoScriptExamples(input).find(example => example.title.startsWith('Marlon'))!.images!
  expect(images.map(image => image.id)).toEqual(['marlon-front', 'marlon-angle', 'marlon-context'])
  for (const image of [images[0], images[2]]) {
    const bytes = readFileSync(`public${image.dataUrl.split('?')[0]}`)
    expect([image.width, image.height]).toEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)])
    expect(image.dataUrl).toContain('?v=20261027')
    expect(image.landmarks).toBeNull()
  }
  expect(images[1].dataUrl).toBe('/creator/examples/user-studies/marlon-angle.png')
})

test('all five ready-to-run formats produce 40–70 second videos without changing narration', () => {
  const examples = videoScriptExamples(input)
  expect(new Set(examples.map(example => example.recipe)).size).toBe(5)
  for (const example of examples) {
    const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images?.map(image => image.id) ?? ['face'], 'brand', reportCategories, { recipe: example.recipe, variation: 0, directions: example.directions })
    expect(composition.durationMs).toBeGreaterThanOrEqual(40000)
    expect(composition.durationMs).toBeLessThanOrEqual(70000)
    expect(Math.round(composition.durationMs / 1000)).toBe(example.durationSeconds)
    expect(narrationText(composition).replace(/\s+/g, ' ')).toBe(example.script.replace(/\s+/g, ' '))
    if (example.recipe === 'report-led') expect(composition.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
    if (example.recipe === 'report-led') {
      expect(hasCaption(composition.scenes[0])).toBe(false)
      expect(composition.scenes.every(scene => scene.source.kind === 'report' && scene.framing === 'full')).toBe(true)
      expect(new Set(composition.scenes.map(scene => scene.source.categoryId)).size).toBeGreaterThan(3)
    }
    if (example.recipe === 'portrait-audit') expect(composition.scenes.filter(scene => scene.source.kind === 'portrait').length).toBeGreaterThan(composition.scenes.filter(scene => scene.source.kind === 'report').length)
    expect(composition.scenes.some(scene => ['report', 'screen'].includes(scene.source.kind) && Math.min(10000, scene.startMs + scene.durationMs) - scene.startMs - 600 >= 2000)).toBe(true)
    if (example.recipe === 'minimal-explainer') expect(composition.scenes.filter(scene => scene.source.kind !== 'report').every(scene => scene.source.kind === 'explainer')).toBe(true)
    if (example.recipe === 'hybrid-story') expect(composition.scenes.some(scene => scene.source.kind === 'explainer')).toBe(true)
    if (example.title.startsWith('Marlon') || example.title.startsWith('Dwayne')) {
      expect(composition.scenes.filter(scene => scene.source.kind === 'explainer' && scene.graphic?.tone === 'light').length).toBeGreaterThanOrEqual(2)
      expect(new Set(composition.scenes.filter(scene => scene.source.kind === 'portrait').map(scene => scene.editorial))).toEqual(new Set(['context', 'compare', 'detail']))
      expect(composition.scenes.flatMap(scene => scene.tracks).some(track => track.primitive === 'landmark-halo' || track.primitive === 'measurement-sweep')).toBe(false)
    }
  }
})

test('example narration takes scores and features from current inputs', () => {
  const examples = videoScriptExamples({ ...input, overallScore: '6.4', strongestFeature: 'Eye region', strongestScore: '7.8', opportunityFeature: 'Jawline', opportunityScore: '5.9' })
  for (const example of examples.filter(example => !example.images)) {
    expect(example.script).toContain('6.4')
    expect(example.script).toContain('Eye region')
    expect(example.script).toContain('7.8')
    expect(example.script).toContain('Jawline')
    expect(example.script).toContain('5.9')
    expect(example.script).not.toContain('7.1')
  }
})

test('celebrity examples use their own photos, safe narration and distinct authored formats', () => {
  const examples = videoScriptExamples(input).filter(example => example.credit)
  expect(examples).toHaveLength(2)
  for (const example of examples) {
    expect(example.images![0].landmarks).toBeNull()
    expect(example.credit?.source).toStartWith('https://commons.wikimedia.org/wiki/File:')
    expect(example.script).not.toMatch(/\b\d\.\d\b|out of ten|rated|scores/i)
    const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: example.recipe, directions: example.directions })
    expect(composition.scenes.filter(scene => scene.source.kind === 'portrait').every(scene => scene.source.imageId === example.images![0].id && (scene.source.overlay === 'face-map' || Boolean(scene.photoStudy || scene.portraitFX?.lighting)))).toBe(true)
    const reports = composition.scenes.filter(scene => scene.source.kind === 'report' && scene.label !== 'Report · Early app proof')
    expect(composition.scenes.some(scene => scene.source.kind === 'component')).toBe(false)
    expect(reports.every(scene => scene.source.imageId === example.images![0].id)).toBe(true)
    expect(composition.scenes.filter(scene => scene.source.kind === 'explainer').every(scene => scene.graphic?.layout !== 'statement')).toBe(true)
    if (example.title.startsWith('Taylor')) {
      expect(reports).toHaveLength(2)
      expect(new Set(composition.scenes.map(scene => scene.source.categoryId)).size).toBeGreaterThan(4)
    }
    if (example.title.startsWith('Tom')) {
      expect(reports).toHaveLength(2)
      expect(new Set(composition.scenes.flatMap(scene => scene.graphic ? [scene.graphic.layout] : []))).toEqual(new Set(['pillars', 'story', 'sequence', 'calendar']))
      expect(new Set(composition.scenes.flatMap(scene => scene.graphic?.anatomy ? [scene.graphic.anatomy.action] : []))).toEqual(new Set(['reveal', 'focus', 'isolate', 'cutaway']))
      expect(reports[0].tracks.some(track => track.primitive === 'section-lift' && track.section === 'feature:0')).toBe(true)
      expect(reports[1].tracks.some(track => track.primitive === 'section-expand' && track.section === 'feature:1')).toBe(true)
      expect(reports.every(scene => scene.tracks.some(track => track.primitive === 'border-beam'))).toBe(true)
      expect(reports.every(scene => scene.text === scene.narration)).toBe(true)
      expect(reports[0].source.report?.features.find(feature => feature.label === 'Eye area')?.value).toBe('8.1 / 10')
    }
  }
})

test('each recipe identifies the audited reference grammar instead of presenting interchangeable scripts', () => {
  const examples = videoScriptExamples(input)
  expect(examples.every(example => Boolean(example.reference))).toBe(true)
  expect(new Set(examples.filter(example => !example.images).map(example => example.reference)).size).toBe(5)
  expect(examples.every(example => !/no diagonal shortcut|watch the anchors stay|without drawing a box|keep the landmarks anchored/i.test(example.script))).toBe(true)
})

test('undirected face studies keep a stable photograph while authored edits may interrupt graphic styles', () => {
  for (const example of videoScriptExamples(input)) {
    const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, ['front', 'alternate'], 'brand', reportCategories, { recipe: example.recipe })
    if (example.recipe === 'portrait-audit') expect(new Set(composition.scenes.filter(scene => scene.source.kind === 'portrait').map(scene => scene.source.imageId))).toEqual(new Set(['front']))
    if (example.recipe === 'hybrid-story') expect(composition.scenes.some(scene => scene.source.kind === 'portrait' && scene.source.overlay === 'face-map')).toBe(true)
    if (example.recipe === 'minimal-explainer') expect(composition.scenes.filter(scene => scene.source.kind !== 'report').every(scene => scene.source.imageId === null || Boolean(scene.photoStudy || scene.portraitFX?.lighting))).toBe(true)
  }
})
