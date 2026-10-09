import type { DesktopReportCategory } from './analysis-report'

export const reportCategoryDefaults: Omit<DesktopReportCategory, 'score'>[] = [
  {
    id: 'eyes',
    title: 'Eyes',
    subtitle: 'Periocular balance and eye-line structure',
    scoreLabel: 'Eye area',
    features: [
      { label: 'Canthal tilt', value: 'Positive' },
      { label: 'Spacing', value: 'balanced width' },
      { label: 'Upper lid', value: 'defined support' },
      { label: 'Periocular match', value: 'strong signal' },
    ],
  },
  {
    id: 'nose',
    title: 'Nose',
    subtitle: 'Bridge alignment and central facial axis',
    scoreLabel: 'Nasal balance',
    features: [
      { label: 'Bridge', value: 'straight contour' },
      { label: 'Midline drift', value: 'minimal drift' },
      { label: 'Width', value: 'moderate width' },
      { label: 'Bridge projection', value: 'clear contour' },
    ],
  },
  {
    id: 'mouth',
    title: 'Mouth',
    subtitle: 'Lip shape, width, and lower-third fit',
    scoreLabel: 'Mouth harmony',
    features: [
      { label: 'Width', value: 'proportional width' },
      { label: 'Cupid bow', value: 'visible contour' },
      { label: 'Lower lip', value: 'balanced fullness' },
      { label: 'Mouth line tilt', value: 'near level' },
    ],
  },
  {
    id: 'jaw',
    title: 'Jaw',
    subtitle: 'Mandible definition and chin support',
    scoreLabel: 'Jawline',
    features: [
      { label: 'Gonial angle', value: 'defined angle' },
      { label: 'Chin height', value: 'strong support' },
      { label: 'Mandible', value: 'clear edge definition' },
      { label: 'Neck transition', value: 'clear contour' },
    ],
  },
  {
    id: 'dimorphism',
    title: 'Dimorphism',
    subtitle: 'Sex-typical cues weighted against harmony',
    scoreLabel: 'Dimorphism',
    features: [
      { label: 'Brow frame', value: 'moderate structure' },
      { label: 'Midface', value: 'refined proportion' },
      { label: 'Lower third', value: 'structured contour' },
      { label: 'Soft tissue', value: 'balanced fullness' },
    ],
  },
  {
    id: 'face-shape',
    title: 'Face shape',
    subtitle: 'Frame, thirds, and silhouette continuity',
    scoreLabel: 'Face shape',
    features: [
      { label: 'Outline', value: 'oval tendency' },
      { label: 'Upper third', value: 'balanced thirds' },
      { label: 'Midface', value: 'compact proportion' },
      { label: 'Lower third', value: 'defined frame' },
    ],
  },
  {
    id: 'facial-fat',
    title: 'Soft tissue',
    subtitle: 'Visible facial fullness',
    scoreLabel: 'Soft tissue',
    features: [
      { label: 'Cheeks', value: 'balanced fullness' },
      { label: 'Jaw blur', value: 'low blur' },
      { label: 'Under-chin', value: 'lean contour' },
      { label: 'Fullness cue', value: 'low visible fullness' },
    ],
  },
  {
    id: 'biological-age',
    title: 'Human age',
    subtitle: 'Visible age and texture cues',
    scoreLabel: 'Age signal',
    features: [
      { label: 'Texture age cue', value: 'low visible texture' },
      { label: 'Under-eye cue', value: 'low shadowing' },
      { label: 'Facial fullness', value: 'youthful fullness' },
      { label: 'Presentation', value: 'clear capture' },
    ],
  },
  {
    id: 'symmetry',
    title: 'Symmetry',
    subtitle: 'Left-right balance across visible landmarks',
    scoreLabel: 'Symmetry',
    features: [
      { label: 'Eye line tilt', value: 'near level' },
      { label: 'Nose midline', value: 'minimal drift' },
      { label: 'Mouth line tilt', value: 'near level' },
      { label: 'Chin axis', value: 'minor drift' },
    ],
  },
  {
    id: 'overall',
    title: 'Overall',
    subtitle: 'Final calibrated assessment',
    scoreLabel: 'Overall score',
    features: [
      { label: 'Harmony', value: 'strong signal' },
      { label: 'Structure', value: 'strong signal' },
      { label: 'Balance', value: 'consistent baseline' },
      { label: 'Percentile', value: 'upper range' },
    ],
  },
]
