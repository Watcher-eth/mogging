import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'

const wasmBaseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

const faceOutlineIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10]
const leftEyeIndices = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33]
const rightEyeIndices = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362]
const leftBrowIndices = [70, 63, 105, 66, 107]
const rightBrowIndices = [336, 296, 334, 293, 300]
const noseBridgeIndices = [168, 6, 197, 195, 5, 4, 1]
const noseBaseIndices = [64, 98, 97, 2, 326, 327, 294]
const mouthIndices = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]
const jawlineIndices = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397]
const cheekboneIndices = [234, 116, 117, 118, 119, 100, 47, 126, 209, 49, 129, 203, 205, 50, 101, 36, 206, 207, 187, 147, 213, 192, 214, 210, 211, 32, 208, 199, 428, 262, 431, 430, 434, 416, 433, 376, 411, 427, 426, 266, 330, 280, 425, 423, 358, 279, 429, 355, 277, 329, 348, 347, 346, 454]

type FaceLandmarkerInstance = {
  detect: (image: HTMLImageElement) => {
    faceLandmarks?: Array<Array<{ x: number; y: number }>>
  }
}

let landmarkerPromise: Promise<FaceLandmarkerInstance | null> | null = null

export async function extractFaceLandmarksFromDataUrl(dataUrl: string): Promise<FaceLandmarksPayload | null> {
  if (typeof window === 'undefined') return null

  try {
    const [image, landmarker] = await Promise.all([loadImage(dataUrl), getFaceLandmarker()])
    if (!landmarker) return null

    const result = landmarker.detect(image)
    const face = result.faceLandmarks?.[0]
    if (!face) return null

    const anchors = {
      leftEyeOuter: pick(face, 33),
      leftEyeInner: pick(face, 133),
      rightEyeInner: pick(face, 362),
      rightEyeOuter: pick(face, 263),
      leftPupil: pick(face, 468) ?? midpoint(pick(face, 33), pick(face, 133)),
      rightPupil: pick(face, 473) ?? midpoint(pick(face, 362), pick(face, 263)),
      leftBrow: pick(face, 105),
      rightBrow: pick(face, 334),
      noseBridge: pick(face, 168),
      noseTip: pick(face, 1),
      mouthLeft: pick(face, 61),
      mouthRight: pick(face, 291),
      mouthCenter: pick(face, 13),
      upperLip: pick(face, 0),
      lowerLip: pick(face, 17),
      leftCheek: pick(face, 234),
      rightCheek: pick(face, 454),
      chin: pick(face, 152),
      jawLeft: pick(face, 172),
      jawRight: pick(face, 397),
      forehead: pick(face, 10),
    }
    const contours = {
      faceOutline: pickMany(face, faceOutlineIndices),
      leftEye: pickMany(face, leftEyeIndices),
      rightEye: pickMany(face, rightEyeIndices),
      leftBrow: pickMany(face, leftBrowIndices),
      rightBrow: pickMany(face, rightBrowIndices),
      noseBridge: pickMany(face, noseBridgeIndices),
      noseBase: pickMany(face, noseBaseIndices),
      mouth: pickMany(face, mouthIndices),
      jawline: pickMany(face, jawlineIndices),
      cheekbones: pickMany(face, cheekboneIndices),
    }
    const quality = computeLandmarkQuality(anchors, contours)

    return {
      version: 1,
      source: 'mediapipe-face-landmarker',
      confidence: quality.score,
      image: {
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      anchors,
      contours,
      quality,
    }
  } catch {
    return null
  }
}

function computeLandmarkQuality(
  anchors: FaceLandmarksPayload['anchors'],
  contours: NonNullable<FaceLandmarksPayload['contours']>,
): NonNullable<FaceLandmarksPayload['quality']> {
  const anchorCount = Object.values(anchors).filter(Boolean).length
  const contourPointCount = Object.values(contours).reduce((sum, points) => sum + (points?.length ?? 0), 0)
  const faceCoverage = getFaceCoverage(contours.faceOutline)
  const rollRadians = getRollRadians(anchors.leftPupil ?? anchors.leftEyeOuter, anchors.rightPupil ?? anchors.rightEyeOuter)
  const symmetryError = getSymmetryError(anchors)
  const warnings: string[] = []
  if (anchorCount < 16) warnings.push('partial-anchors')
  if (contourPointCount < 90) warnings.push('sparse-contours')
  if (faceCoverage < 0.08) warnings.push('small-face')
  if (Math.abs(rollRadians) > 0.22) warnings.push('tilted-face')
  if (symmetryError > 0.1) warnings.push('asymmetric-anchor-fit')

  const score = clamp01(
    0.36
    + Math.min(anchorCount / 20, 1) * 0.24
    + Math.min(contourPointCount / 120, 1) * 0.2
    + Math.min(faceCoverage / 0.18, 1) * 0.12
    + Math.max(0, 1 - Math.abs(rollRadians) / 0.35) * 0.08
    - Math.min(symmetryError / 0.2, 1) * 0.18,
  )

  return { score, anchorCount, contourPointCount, faceCoverage, rollRadians, symmetryError, warnings }
}

function getFaceCoverage(points: NormalizedPoint[] | undefined) {
  if (!points?.length) return 0
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
}

function getRollRadians(left?: NormalizedPoint, right?: NormalizedPoint) {
  if (!left || !right) return 0
  return Math.atan2(right.y - left.y, right.x - left.x)
}

function getSymmetryError(anchors: FaceLandmarksPayload['anchors']) {
  const left = anchors.leftPupil ?? anchors.leftEyeOuter
  const right = anchors.rightPupil ?? anchors.rightEyeOuter
  const chin = anchors.chin
  const forehead = anchors.forehead
  if (!left || !right || !chin || !forehead) return 0.08
  const eyeCenterX = (left.x + right.x) / 2
  return (Math.abs(forehead.x - eyeCenterX) + Math.abs(chin.x - eyeCenterX)) / 2
}

function pickMany(points: Array<{ x: number; y: number }>, indices: number[]): NormalizedPoint[] {
  return indices
    .map((index) => pick(points, index))
    .filter((point): point is NormalizedPoint => Boolean(point))
}

async function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = createFaceLandmarker()
  }

  return landmarkerPromise
}

async function createFaceLandmarker(): Promise<FaceLandmarkerInstance | null> {
  try {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl)
    return await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
  } catch {
    return null
  }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for landmark extraction'))
    image.src = dataUrl
  })
}

function pick(points: Array<{ x: number; y: number }>, index: number): NormalizedPoint | undefined {
  const point = points[index]
  if (!point) return undefined

  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  }
}

function midpoint(a?: NormalizedPoint, b?: NormalizedPoint): NormalizedPoint | undefined {
  if (!a || !b) return undefined

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
