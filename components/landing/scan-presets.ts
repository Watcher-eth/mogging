// Ported from the mobile GeneratingScreen; keep geometry and choreography in sync.
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
const processingEyeContourPoints = [
  ...Array.from({ length: 16 }, (_value, index) => ({
    contour: 'leftEye' as const,
    index,
    fallback: { x: 0.35 + index * 0.006, y: index < 8 ? 0.397 : 0.423 },
  })),
  ...Array.from({ length: 16 }, (_value, index) => ({
    contour: 'rightEye' as const,
    index,
    fallback: { x: 0.55 + index * 0.006, y: index < 8 ? 0.397 : 0.423 },
  })),
]

export const processingOverlayPresets = (
  [
    {
      id: 'processing-eyes',
      footer: '',
      primitives: [
        {
          id: 'eye-region-frame',
          kind: 'box',
          from: { anchor: 'leftEyeOuter', fallback: { x: 0.35, y: 0.405 } },
          to: { anchor: 'rightEyeOuter', fallback: { x: 0.66, y: 0.405 } },
          points: processingEyeContourPoints,
          padding: { x: 0.022, y: 0.01 },
          cornerOnly: true,
          cornerLength: 0.19,
          fillOpacity: 0.026,
          radius: 10,
          strokeWidth: 0.64,
          opacity: 0.78,
          animation: { delay: 120, duration: 1020, entrance: 'draw' },
        },
        {
          id: 'eye-line',
          kind: 'line',
          from: {
            anchor: 'leftPupil',
            fallback: { x: 0.39, y: 0.415 },
            offset: { x: -0.028, y: 0 },
          },
          to: {
            anchor: 'rightPupil',
            fallback: { x: 0.61, y: 0.415 },
            offset: { x: 0.028, y: 0 },
          },
          strokeWidth: 0.84,
          opacity: 0.78,
          animation: { delay: 540, duration: 1180, entrance: 'draw' },
        },
        {
          id: 'eye-label',
          kind: 'label',
          title: 'Eye line',
          value: '[ balanced ]',
          variant: 'tag',
          align: 'left',
          at: {
            anchor: 'leftPupil',
            fallback: { x: 0.39, y: 0.415 },
            offset: { x: -0.145, y: 0.035 },
          },
          animation: { delay: 1500, duration: 720, entrance: 'slide' },
        },
      ],
    },
    {
      id: 'processing-nose',
      footer: '',
      primitives: [
        {
          id: 'nose-dot',
          kind: 'point',
          at: { anchor: 'noseTip', fallback: { x: 0.51, y: 0.52 } },
          radius: 5,
          tone: 'halo',
          animation: {
            delay: 120,
            duration: 420,
            pulse: true,
            entrance: 'scale',
          },
        },
        {
          id: 'nose-axis',
          kind: 'line',
          from: { anchor: 'noseBridge', fallback: { x: 0.51, y: 0.44 } },
          to: {
            anchor: 'noseTip',
            fallback: { x: 0.51, y: 0.52 },
            offset: { x: 0, y: 0.13 },
          },
          strokeWidth: 1,
          opacity: 0.82,
          animation: { delay: 460, duration: 1160, entrance: 'draw' },
        },
        {
          id: 'nose-label',
          kind: 'label',
          title: 'Nose axis',
          value: '[ centered ]',
          variant: 'tag',
          align: 'right',
          at: {
            anchor: 'noseTip',
            fallback: { x: 0.51, y: 0.52 },
            offset: { x: 0.18, y: 0.08 },
          },
          animation: { delay: 1420, duration: 720, entrance: 'slide' },
        },
      ],
    },
    {
      id: 'processing-chin',
      footer: '',
      primitives: [
        {
          id: 'chin-dot',
          kind: 'point',
          at: { anchor: 'chin', fallback: { x: 0.51, y: 0.78 } },
          radius: 5,
          tone: 'halo',
          animation: {
            delay: 120,
            duration: 420,
            pulse: true,
            entrance: 'scale',
          },
        },
        {
          id: 'chin-height',
          kind: 'line',
          from: { anchor: 'lowerLip', fallback: { x: 0.51, y: 0.61 } },
          to: { anchor: 'chin', fallback: { x: 0.51, y: 0.78 } },
          strokeWidth: 1,
          opacity: 0.82,
          animation: { delay: 460, duration: 1160, entrance: 'draw' },
        },
        {
          id: 'chin-label',
          kind: 'label',
          title: 'Chin height',
          value: '[ measured ]',
          variant: 'tag',
          align: 'right',
          at: {
            anchor: 'chin',
            fallback: { x: 0.51, y: 0.78 },
            offset: { x: 0.18, y: -0.02 },
          },
          animation: { delay: 1420, duration: 720, entrance: 'slide' },
        },
      ],
    },
    {
      id: 'processing-skin-protocol',
      footer: '',
      primitives: [
        {
          id: 'skin-forehead',
          kind: 'point',
          at: {
            anchor: 'forehead',
            fallback: { x: 0.51, y: 0.24 },
            offset: { x: 0.035, y: 0.08 },
          },
          radius: 8,
          tone: 'halo',
          animation: {
            delay: 120,
            duration: 420,
            pulse: true,
            entrance: 'scale',
          },
        },
        {
          id: 'skin-left-cheek',
          kind: 'point',
          at: { anchor: 'leftCheek', fallback: { x: 0.35, y: 0.52 } },
          radius: 7,
          tone: 'halo',
          animation: {
            delay: 260,
            duration: 420,
            pulse: true,
            entrance: 'scale',
          },
        },
        {
          id: 'skin-right-cheek',
          kind: 'point',
          at: { anchor: 'rightCheek', fallback: { x: 0.66, y: 0.52 } },
          radius: 7,
          tone: 'halo',
          animation: {
            delay: 400,
            duration: 420,
            pulse: true,
            entrance: 'scale',
          },
        },
        {
          id: 'skin-priority-line',
          kind: 'line',
          from: { anchor: 'rightCheek', fallback: { x: 0.66, y: 0.52 } },
          to: {
            anchor: 'rightCheek',
            fallback: { x: 0.66, y: 0.52 },
            offset: { x: 0.12, y: 0.12 },
          },
          strokeWidth: 0.86,
          opacity: 0.72,
          animation: { delay: 680, duration: 820, entrance: 'draw' },
        },
        {
          id: 'skin-protocol-label',
          kind: 'label',
          title: 'Protocol',
          value: '[ skin first ]',
          variant: 'tag',
          align: 'right',
          at: {
            anchor: 'rightCheek',
            fallback: { x: 0.66, y: 0.52 },
            offset: { x: 0.12, y: 0.12 },
          },
          animation: { delay: 1260, duration: 720, entrance: 'slide' },
        },
      ],
    },
    reportOverlayPresets.jaw,
    reportOverlayPresets.symmetry,
    reportOverlayPresets.mouth,
    reportOverlayPresets.nose,
  ] satisfies OverlayPreset[]
).map(withScanOverlayLabels)

function withScanOverlayLabels(preset: OverlayPreset): OverlayPreset {
  const labels: Record<string, [string, string]> = {
    'eye-label': ['Eye alignment', 'Spacing & tilt'],
    'nose-label': ['Nose proportions', 'Bridge & width'],
    'chin-label': ['Chin profile', 'Length & projection'],
    'skin-protocol-label': ['Skin analysis', 'Tone & texture'],
    'symmetry-label': ['Facial symmetry', 'Left / right balance'],
    'jaw-label': ['Jawline definition', 'Angle & chin support'],
    'mouth-label': ['Lip proportions', 'Width & fullness'],
  }
  return {
    ...preset,
    primitives: preset.primitives.map((primitive) => {
      const copy = labels[primitive.id]
      return primitive.kind === 'label' && copy
        ? { ...primitive, title: copy[0], value: copy[1] }
        : primitive
    }),
  }
}
