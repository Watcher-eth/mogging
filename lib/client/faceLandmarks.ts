import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'

const wasmBaseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

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

    return {
      version: 1,
      source: 'mediapipe-face-landmarker',
      confidence: 1,
      image: {
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      anchors: {
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
        chin: pick(face, 152),
        jawLeft: pick(face, 172),
        jawRight: pick(face, 397),
        forehead: pick(face, 10),
      },
    }
  } catch {
    return null
  }
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
