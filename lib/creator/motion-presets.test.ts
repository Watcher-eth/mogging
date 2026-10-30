import { expect, test } from 'bun:test'
import { appearancePresets, appearanceVariants, sampleAppearance, type AppearancePreset } from './motion-presets'
import { sampleMotionPrimitive } from './motion-primitives'

test('Motion Primitives appearance presets share exact hidden and resting states across DOM and canvas', () => {
  for (const preset of Object.keys(appearancePresets) as AppearancePreset[]) {
    expect(sampleAppearance(preset, 0)).toEqual(appearancePresets[preset])
    expect(sampleAppearance(preset, -100)).toEqual(sampleAppearance(preset, 0))
    expect(sampleAppearance(preset, 1)).toEqual({ opacity: 1, y: 0, scale: 1, blur: 0 })
    expect(sampleAppearance(preset, 100)).toEqual(sampleAppearance(preset, 1))
    expect(appearanceVariants(preset).hidden.filter).toBe(`blur(${appearancePresets[preset].blur}px)`)
    expect(appearanceVariants(preset).visible.scale).toBe(sampleAppearance(preset, 1).scale)
    for (const time of [0, .1, .5, .9, 1]) expect(sampleAppearance(preset, time, true)).toEqual(sampleAppearance(preset, 1))
  }
})

test('appearance sampling is bounded, monotonic and independent of playback or seek order', () => {
  for (const preset of Object.keys(appearancePresets) as AppearancePreset[]) {
    const samples = Array.from({ length: 31 }, (_, index) => sampleAppearance(preset, index / 30))
    expect(samples.every(sample => Object.values(sample).every(Number.isFinite))).toBe(true)
    expect(samples.every((sample, index) => index === 0 || sample.opacity >= samples[index - 1].opacity && sample.scale >= samples[index - 1].scale && sample.blur <= samples[index - 1].blur)).toBe(true)
    for (const index of [30, 10, 20, 0, 15, 10]) expect(sampleAppearance(preset, index / 30)).toEqual(samples[index])
  }
  for (const preset of ['in-view', 'group-reveal', 'text-scale'] as const) expect(sampleMotionPrimitive(preset, .5)).toMatchObject(sampleAppearance(preset, .5))
})
