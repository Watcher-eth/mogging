import type { OverlayPreset, OverlayPrimitive } from '@/lib/creator/mobile-overlay-engine/schema'

// Traced only for the bundled model.png design fixture. Never reuse these on user photos.
const trace = (id: string, coordinates: number[][], delay = 0): OverlayPrimitive => ({
  id, kind: 'polyline',
  points: coordinates.map(([x, y]) => ({ point: { x: x / 100, y: y / 100 } })),
  strokeWidth: .32, opacity: .8,
  animation: { delay, duration: 1200, entrance: 'draw' },
})

export const previewHairOverlay: OverlayPreset = {
  id: 'preview-model-hair', footer: '[ HAIR ]',
  primitives: [
    trace('outer-silhouette', [[4,77],[7,70],[6,63],[8,54],[8,45],[10,36],[13,27],[17,19],[22,13],[29,7],[38,3],[48,1],[57,1],[66,3],[75,7],[82,13],[87,21],[90,30],[94,39],[96,47],[95,56],[93,64],[93,70],[96,78]]),
    trace('hairline-and-framing', [[21,74],[24,67],[22,57],[23,46],[27,37],[30,29],[31,22],[32,18],[36,15],[42,14],[49,14],[55,13],[60,14],[65,16],[70,20],[75,25],[78,31],[79,36]], 180),
    trace('right-framing', [[83,43],[81,48],[82,55],[85,62],[88,68],[88,73],[94,78]], 320),
  ],
}

export const previewEarOverlay: OverlayPreset = {
  id: 'preview-model-ears', footer: '[ EARS ]',
  primitives: [
    // Only the ear visible in this photograph is traced; the other is behind hair.
    trace('visible-ear-outline', [[79.3,36.7],[81.1,36.8],[82.1,38.4],[82.4,40.3],[81.8,42.2],[80.5,44.1],[79,45],[77.2,45],[76.1,44.4]], 0),
    trace('visible-ear-inner-fold', [[80.8,38.2],[80.9,39.5],[79.7,40.1],[79,41.2],[79.3,42.3],[78.2,43.4]], 220),
  ],
}
