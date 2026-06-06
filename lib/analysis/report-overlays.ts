import type { FaceLandmarksPayload, NormalizedPoint } from './landmarks'

export type ReportOverlayPoint = {
  x: number
  y: number
}

export type ReportOverlayLine = {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type ReportGuideBox = {
  x: number
  y: number
  width: number
  height: number
  dashed?: boolean
}

export type ReportOverlayLabel = {
  title: string
  value: string
  x: number
  y: number
}

export type ReportCategory = {
  id: string
  title: string
  subtitle: string
  scoreLabel: string
  features: Array<{
    label: string
    value: string
  }>
  overlayPoints: ReportOverlayPoint[]
  overlayLines: ReportOverlayLine[]
}

export type ReportOverlayGeometry = {
  boxes: ReportGuideBox[]
  lines: ReportOverlayLine[]
  points: ReportOverlayPoint[]
  label: ReportOverlayLabel
  usesLandmarks: boolean
}

export const reportCategories: ReportCategory[] = [
  {
    id: 'eyes',
    title: 'Eyes',
    subtitle: 'Periocular balance and eye-line structure',
    scoreLabel: 'Eye area',
    features: [
      { label: 'Canthal tilt', value: 'Positive' },
      { label: 'Spacing', value: 'Balanced' },
      { label: 'Upper lid', value: 'Defined' },
      { label: 'Symmetry', value: 'High' },
    ],
    overlayPoints: [{ x: 34, y: 39 }, { x: 46, y: 38 }, { x: 56, y: 38 }, { x: 68, y: 39 }],
    overlayLines: [{ x1: 30, y1: 40, x2: 72, y2: 39 }],
  },
  {
    id: 'nose',
    title: 'Nose',
    subtitle: 'Bridge alignment and central facial axis',
    scoreLabel: 'Nasal balance',
    features: [
      { label: 'Bridge', value: 'Straight' },
      { label: 'Tip position', value: 'Centered' },
      { label: 'Width', value: 'Moderate' },
      { label: 'Projection', value: 'Clean' },
    ],
    overlayPoints: [{ x: 51, y: 42 }, { x: 51, y: 52 }, { x: 51, y: 61 }],
    overlayLines: [{ x1: 51, y1: 36, x2: 51, y2: 64 }],
  },
  {
    id: 'mouth',
    title: 'Mouth',
    subtitle: 'Lip shape, width, and lower-third fit',
    scoreLabel: 'Mouth harmony',
    features: [
      { label: 'Width', value: 'Proportional' },
      { label: 'Cupid bow', value: 'Visible' },
      { label: 'Lower lip', value: 'Full' },
      { label: 'Resting line', value: 'Even' },
    ],
    overlayPoints: [{ x: 41, y: 66 }, { x: 51, y: 67 }, { x: 62, y: 66 }],
    overlayLines: [{ x1: 38, y1: 66, x2: 65, y2: 66 }],
  },
  {
    id: 'jaw',
    title: 'Jaw',
    subtitle: 'Mandible definition and chin support',
    scoreLabel: 'Jawline',
    features: [
      { label: 'Gonial angle', value: 'Defined' },
      { label: 'Chin height', value: 'Strong' },
      { label: 'Mandible', value: 'Clear' },
      { label: 'Neck transition', value: 'Clean' },
    ],
    overlayPoints: [{ x: 33, y: 72 }, { x: 50, y: 79 }, { x: 68, y: 72 }],
    overlayLines: [{ x1: 31, y1: 70, x2: 50, y2: 80 }, { x1: 50, y1: 80, x2: 70, y2: 70 }],
  },
  {
    id: 'overall',
    title: 'Overall PSL',
    subtitle: 'Final calibrated PSL assessment',
    scoreLabel: 'PSL score',
    features: [
      { label: 'Harmony', value: 'High' },
      { label: 'Structure', value: 'Strong' },
      { label: 'Balance', value: 'Consistent' },
      { label: 'Percentile', value: 'Upper range' },
    ],
    overlayPoints: [{ x: 50, y: 30 }, { x: 35, y: 43 }, { x: 65, y: 43 }, { x: 50, y: 66 }, { x: 50, y: 81 }],
    overlayLines: [{ x1: 50, y1: 30, x2: 35, y2: 43 }, { x1: 50, y1: 30, x2: 65, y2: 43 }, { x1: 50, y1: 30, x2: 50, y2: 81 }, { x1: 35, y1: 43, x2: 65, y2: 43 }, { x1: 39, y1: 66, x2: 62, y2: 66 }],
  },
]

const reportOverlayYOffset = -12
const reportOverlayCategoryYOffset: Record<string, number> = {
  eyes: -8,
  mouth: -15,
}

export function getReportOverlayGeometry(category: ReportCategory, landmarks: FaceLandmarksPayload | null): ReportOverlayGeometry {
  const landmarkGeometry = landmarks ? getLandmarkOverlayGeometry(category, landmarks) : null
  if (landmarkGeometry) return { ...landmarkGeometry, usesLandmarks: true }

  return {
    boxes: getReportGuideBoxes(category),
    lines: category.overlayLines,
    points: category.overlayPoints,
    label: getReportOverlayLabel(category),
    usesLandmarks: false,
  }
}

export function getReportOverlayYOffset(categoryId: string) {
  return reportOverlayCategoryYOffset[categoryId] ?? reportOverlayYOffset
}

export function getReportCategoryById(categoryId: string | null | undefined) {
  return reportCategories.find((category) => category.id === categoryId) ?? reportCategories.find((category) => category.id === 'overall') ?? reportCategories[0]
}

function getReportGuideBoxes(category: ReportCategory) {
  if (category.id === 'eyes') {
    return [
      { x: 29, y: 35, width: 18, height: 9 },
      { x: 55, y: 35, width: 18, height: 9 },
      { x: 45, y: 31, width: 10, height: 13, dashed: true },
    ]
  }

  if (category.id === 'mouth') return [{ x: 39, y: 61, width: 25, height: 9 }]
  if (category.id === 'nose') return [{ x: 45, y: 39, width: 12, height: 24, dashed: true }]

  return []
}

function getLandmarkOverlayGeometry(category: ReportCategory, landmarks: FaceLandmarksPayload) {
  const anchors = landmarks.anchors

  if (landmarks.confidence < 0.5) return null

  if (category.id === 'eyes') {
    const leftOuter = toPercentPoint(anchors.leftEyeOuter)
    const leftInner = toPercentPoint(anchors.leftEyeInner)
    const rightInner = toPercentPoint(anchors.rightEyeInner)
    const rightOuter = toPercentPoint(anchors.rightEyeOuter)
    const leftPupil = toPercentPoint(anchors.leftPupil)
    const rightPupil = toPercentPoint(anchors.rightPupil)
    const eyePoints = compactPoints([leftOuter, leftInner, rightInner, rightOuter, leftPupil, rightPupil])
    if (eyePoints.length < 4 || !leftOuter || !leftInner || !rightInner || !rightOuter) return null

    const leftBox = boxFromPoints([leftOuter, leftInner], 6, 5)
    const rightBox = boxFromPoints([rightInner, rightOuter], 6, 5)
    const bridgeBox = boxFromPoints([leftInner, rightInner], 3, 7)

    return {
      boxes: [leftBox, rightBox, { ...bridgeBox, dashed: true }],
      lines: [{ x1: leftOuter.x, y1: leftOuter.y, x2: rightOuter.x, y2: rightOuter.y }],
      points: eyePoints,
      label: { title: 'Eyes distance', value: '[ measured ]', x: Math.min(78, rightInner.x + 4), y: rightInner.y + 7 },
    }
  }

  if (category.id === 'nose') {
    const bridge = toPercentPoint(anchors.noseBridge)
    const tip = toPercentPoint(anchors.noseTip)
    if (!bridge || !tip) return null

    return {
      boxes: [{ ...boxFromPoints([bridge, tip], 5, 3), dashed: true }],
      lines: [{ x1: bridge.x, y1: bridge.y - 4, x2: tip.x, y2: tip.y + 3 }],
      points: [bridge, tip],
      label: { title: 'Nose axis', value: '[ centered ]', x: Math.min(78, tip.x + 6), y: tip.y },
    }
  }

  if (category.id === 'mouth') {
    const left = toPercentPoint(anchors.mouthLeft)
    const right = toPercentPoint(anchors.mouthRight)
    const center = toPercentPoint(anchors.mouthCenter)
    if (!left || !right) return null

    return {
      boxes: [boxFromPoints([left, right], 5, 5)],
      lines: [{ x1: left.x, y1: left.y, x2: right.x, y2: right.y }],
      points: compactPoints([left, center, right]),
      label: { title: 'Lips fullness', value: '[ measured ]', x: Math.min(78, right.x + 4), y: right.y - 1 },
    }
  }

  if (category.id === 'jaw') {
    const left = toPercentPoint(anchors.jawLeft)
    const chin = toPercentPoint(anchors.chin)
    const right = toPercentPoint(anchors.jawRight)
    if (!left || !chin || !right) return null

    return {
      boxes: [],
      lines: [{ x1: left.x, y1: left.y, x2: chin.x, y2: chin.y }, { x1: chin.x, y1: chin.y, x2: right.x, y2: right.y }],
      points: [left, chin, right],
      label: { title: 'Jaw angle', value: '[ measured ]', x: Math.min(78, right.x + 2), y: right.y },
    }
  }

  const forehead = toPercentPoint(anchors.forehead)
  const nose = toPercentPoint(anchors.noseTip)
  const chin = toPercentPoint(anchors.chin)
  const mouthLeft = toPercentPoint(anchors.mouthLeft)
  const mouthRight = toPercentPoint(anchors.mouthRight)
  const leftEye = toPercentPoint(anchors.leftEyeOuter)
  const rightEye = toPercentPoint(anchors.rightEyeOuter)
  if (!forehead || !nose || !chin) return null

  return {
    boxes: [],
    lines: [
      { x1: forehead.x, y1: forehead.y, x2: chin.x, y2: chin.y },
      ...(leftEye && rightEye ? [{ x1: leftEye.x, y1: leftEye.y, x2: rightEye.x, y2: rightEye.y }] : []),
      ...(mouthLeft && mouthRight ? [{ x1: mouthLeft.x, y1: mouthLeft.y, x2: mouthRight.x, y2: mouthRight.y }] : []),
    ],
    points: compactPoints([forehead, nose, chin, leftEye, rightEye]),
    label: { title: 'PSL score', value: '[ calibrated ]', x: Math.min(78, nose.x + 7), y: nose.y },
  }
}

function getReportOverlayLabel(category: ReportCategory) {
  const labels: Record<string, ReportOverlayLabel> = {
    eyes: { title: 'Eyes distance', value: '[ 3 cm ]', x: 58, y: 46 },
    nose: { title: 'Nose axis', value: '[ centered ]', x: 58, y: 52 },
    mouth: { title: 'Lips fullness', value: '[ 5 cm ]', x: 66, y: 62 },
    jaw: { title: 'Jaw angle', value: '[ defined ]', x: 60, y: 73 },
    overall: { title: 'PSL score', value: '[ calibrated ]', x: 58, y: 51 },
  }

  return labels[category.id] ?? labels.overall
}

function toPercentPoint(point?: NormalizedPoint): ReportOverlayPoint | null {
  if (!point) return null

  return {
    x: point.x * 100,
    y: point.y * 100,
  }
}

function compactPoints(points: Array<ReportOverlayPoint | null | undefined>) {
  return points.filter((point): point is ReportOverlayPoint => Boolean(point))
}

function boxFromPoints(points: ReportOverlayPoint[], paddingX: number, paddingY: number): ReportGuideBox {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: Math.max(0, minX - paddingX),
    y: Math.max(0, minY - paddingY),
    width: Math.min(100, maxX + paddingX) - Math.max(0, minX - paddingX),
    height: Math.min(100, maxY + paddingY) - Math.max(0, minY - paddingY),
  }
}
