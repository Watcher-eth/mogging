import { expect, test } from 'bun:test'
import { packVideoProject, unpackVideoProject } from './video-project'
import { portraitEffectsSchema } from './video-portrait-effects'
import { buildZip } from './export-slides'
import { compileAnalysisVideo } from './video-composition'
import { buildAnalysisPost, type AnalysisPostInput } from './analysis-post'

test('project ZIP round-trips timeline, image bytes and source IDs without remote dependencies', async () => {
  const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Test', hook: 'Mapped', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: 'Mogging' }
  const composition = compileAnalysisVideo(buildAnalysisPost(input), input, ['face'], 'brand', [])
  composition.scenes[0].source.kind = 'portrait'
  composition.scenes[0].portraitFX = portraitEffectsSchema.parse({ overlay: { pattern: 'dashed', opacity: .4, markers: true }, lighting: { preset: 'split', color: 'split-mono', ambientEv: -2 } })
  composition.scenes[0].framing = 'captioned'
  composition.scenes[0].editorial = 'compare'
  composition.scenes[0].study = { id: 'argument', operation: 'planes', activeId: 'frame', references: [{ id: 'frame', imageId: 'face', categoryId: 'jaw', label: 'Frame' }] }
  const image = { id: 'face', name: 'sample.png', width: 1, height: 1, status: 'ready' as const, landmarks: null, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=' }
  const audio = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' })
  const packed = await packVideoProject(composition, [image], { file: audio, name: 'narration.wav' })
  const restored = await unpackVideoProject(packed)
  try {
    expect(restored.composition).toEqual(composition)
    expect(restored.images[0].id).toBe('face')
    expect(restored.images[0].name).toBe('sample.png')
    expect(restored.voiceover?.name).toBe('narration.wav')
    expect(await restored.voiceover!.file.arrayBuffer()).toEqual(await audio.arrayBuffer())
    expect(await (await fetch(restored.images[0].dataUrl)).arrayBuffer()).toEqual(await (await fetch(image.dataUrl)).arrayBuffer())
  } finally { restored.objectUrls.forEach(url => URL.revokeObjectURL(url)) }
})

test('project import rejects missing manifests and malformed or truncated ZIP entries', async () => {
  await expect(unpackVideoProject(new Blob(['not a ZIP']))).rejects.toThrow('missing')
  const archive = buildZip([{ name: 'other.json', data: new TextEncoder().encode('{}') }])
  await expect(unpackVideoProject(archive)).rejects.toThrow('missing')
  await expect(unpackVideoProject(archive.slice(0, 12))).rejects.toThrow('Incomplete')
})
