import { describe, expect, test } from 'bun:test'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset } from '@/lib/creator/mobile-overlay-engine/resolve'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { generateSlides, type GeneratorImage } from './content-generator'

const fixture: FaceLandmarksPayload = {
  version: 1,
  source: 'mediapipe-face-landmarker',
  confidence: 0.94,
  image: { width: 1600, height: 900 },
  anchors: {
    leftEyeOuter: { x: 0.35, y: 0.38 }, leftEyeInner: { x: 0.46, y: 0.39 }, rightEyeInner: { x: 0.55, y: 0.39 }, rightEyeOuter: { x: 0.67, y: 0.38 },
    leftPupil: { x: 0.405, y: 0.39 }, rightPupil: { x: 0.61, y: 0.39 }, noseBridge: { x: 0.505, y: 0.43 }, noseTip: { x: 0.51, y: 0.53 },
    mouthLeft: { x: 0.42, y: 0.66 }, mouthRight: { x: 0.62, y: 0.66 }, mouthCenter: { x: 0.52, y: 0.665 }, upperLip: { x: 0.52, y: 0.645 }, lowerLip: { x: 0.52, y: 0.69 },
    jawLeft: { x: 0.34, y: 0.72 }, jawRight: { x: 0.68, y: 0.72 }, chin: { x: 0.51, y: 0.82 }, forehead: { x: 0.505, y: 0.24 }, leftCheek: { x: 0.36, y: 0.55 }, rightCheek: { x: 0.65, y: 0.55 },
  },
  contours: {
    leftEye: Array.from({ length: 16 }, (_, index) => ({ x: 0.35 + index * 0.007, y: 0.38 + (index % 2) * 0.01 })),
    rightEye: Array.from({ length: 16 }, (_, index) => ({ x: 0.55 + index * 0.007, y: 0.38 + (index % 2) * 0.01 })),
    mouth: Array.from({ length: 20 }, (_, index) => ({ x: 0.42 + index * 0.01, y: 0.65 + (index % 3) * 0.01 })),
    jawline: Array.from({ length: 13 }, (_, index) => ({ x: 0.34 + index * 0.028, y: 0.72 + Math.sin(index / 12 * Math.PI) * 0.1 })),
    faceOutline: Array.from({ length: 15 }, (_, index) => ({ x: 0.3 + index * 0.03, y: 0.24 + Math.sin(index / 14 * Math.PI) * 0.58 })),
    noseBridge: [{ x: 0.505, y: 0.43 }, { x: 0.508, y: 0.48 }, { x: 0.51, y: 0.53 }],
    noseBase: Array.from({ length: 7 }, (_, index) => ({ x: 0.47 + index * 0.013, y: 0.54 })),
    cheekbones: [{ x: 0.35, y: 0.55 }, { x: 0.4, y: 0.54 }, { x: 0.5, y: 0.53 }, { x: 0.6, y: 0.54 }, { x: 0.66, y: 0.55 }],
  },
}

describe('canonical creator overlay projection', () => {
  test('preserves mobile cover crop compensation for landscape source in vertical output', () => {
    const viewport = { width: 1080, height: 1920 }
    const transform = getImageTransform(fixture.image, viewport, 'cover')
    expect(transform.scale).toBeCloseTo(1920 / 900)
    expect(transform.offsetX).toBeCloseTo((1080 - 1600 * transform.scale) / 2)
    expect(projectImagePoint(fixture.anchors.noseTip!, fixture.image, transform)).toEqual({ x: expect.any(Number), y: expect.any(Number) })
    expect(projectImagePoint(fixture.anchors.noseTip!, fixture.image, transform).x).toBeCloseTo(574.133333, 4)
  })

  for (const category of ['eyes', 'nose', 'mouth', 'jaw', 'symmetry', 'face-shape', 'overall']) {
    test(`resolves ${category} from canonical anchors without slide-relative fallback`, () => {
      const resolved = resolveOverlayPreset({ preset: reportOverlayPresets[category], landmarks: fixture, viewport: { width: 1080, height: 1350 }, imageSize: fixture.image, fit: 'cover' })
      expect(resolved.primitives.length).toBe(reportOverlayPresets[category].primitives.length)
      expect(resolved.primitives.some((primitive) => primitive.kind === 'label')).toBe(true)
    })
  }

  test('matches crop behavior for square and very tall portrait outputs', () => {
    const point = fixture.anchors.leftEyeOuter!
    const square = projectImagePoint(point, fixture.image, getImageTransform(fixture.image, { width: 1080, height: 1080 }, 'cover'))
    const tall = projectImagePoint(point, fixture.image, getImageTransform(fixture.image, { width: 1080, height: 1920 }, 'cover'))
    expect(square.y).toBeCloseTo(410.4)
    expect(tall.y).toBeCloseTo(729.6)
    expect(square.x).not.toBeCloseTo(tall.x)
  })

  test('keeps low-confidence and no-face uploads out of generated content', () => {
    const unsafeImages: GeneratorImage[] = [
      { id: 'low', name: 'low.jpg', dataUrl: 'data:', width: 100, height: 100, landmarks: fixture as never, status: 'warning' },
      { id: 'none', name: 'none.jpg', dataUrl: 'data:', width: 100, height: 100, landmarks: null, status: 'no-face' },
    ]
    expect(generateSlides({ campaignGoal: 'traffic', tone: 'direct', selectedCategories: ['eyes'], images: unsafeImages, offer: 'Mogging', seed: 0 })).toEqual([])
  })

  test('rotates multiple usable uploads through selected report categories', () => {
    const usableImages: GeneratorImage[] = ['a', 'b'].map((id) => ({ id, name: `${id}.jpg`, dataUrl: 'data:', width: 1600, height: 900, landmarks: fixture as never, status: 'ready' }))
    const slides = generateSlides({ campaignGoal: 'traffic', tone: 'curious', selectedCategories: ['eyes', 'nose', 'mouth'], images: usableImages, offer: 'Mogging', seed: 1 })
    expect(slides.map((slide) => slide.templateId)).toEqual(['editorial', 'score-potential', 'psl', 'score-rows', 'cta'])
    expect(slides.map((slide) => slide.imageId)).toEqual(['a', 'b', 'a', 'b', 'b'])
    expect(slides.at(-1)?.templateId).toBe('cta')
  })

  for (const viewport of [{ width: 1080, height: 1920 }, { width: 1080, height: 1350 }, { width: 1080, height: 1080 }]) {
    test(`keeps report and category visual geometry stable at ${viewport.width}x${viewport.height}`, () => {
      const report = resolveOverlayPreset({ preset: reportOverlayPresets.overall, landmarks: fixture, viewport, imageSize: fixture.image, fit: 'cover' })
      const category = resolveOverlayPreset({ preset: reportOverlayPresets.eyes, landmarks: fixture, viewport, imageSize: fixture.image, fit: 'cover' })
      expect({ report: snapshotGeometry(report.primitives), category: snapshotGeometry(category.primitives) }).toMatchSnapshot()
    })
  }
})

function snapshotGeometry(primitives: ReturnType<typeof resolveOverlayPreset>['primitives']) {
  return primitives.map((primitive) => {
    if (primitive.kind === 'point' || primitive.kind === 'label') return { id: primitive.id, kind: primitive.kind, point: roundPoint(primitive.point) }
    if (primitive.kind === 'line') return { id: primitive.id, kind: primitive.kind, from: roundPoint(primitive.fromPoint), to: roundPoint(primitive.toPoint) }
    if (primitive.kind === 'box') return { id: primitive.id, kind: primitive.kind, rect: Object.fromEntries(Object.entries(primitive.rect).map(([key, value]) => [key, Math.round(value * 1000) / 1000])) }
    return { id: primitive.id, kind: primitive.kind, points: primitive.pixelPoints.map(roundPoint) }
  })
}

function roundPoint(point: { x: number; y: number }) {
  return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 }
}
