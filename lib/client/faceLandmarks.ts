import { refinePhotographedContours } from './refineFaceContours'
import type { LandmarkInput } from '@/lib/analysis-v2/measurements'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'

export const faceContourRevision = 'mediapipe-contours-20261102-v6'
export const hasCurrentFaceContours = (face?: FaceLandmarksPayload|null) => face?.source==='mediapipe-face-landmarker' && face.detectorRevision===faceContourRevision

const wasmBaseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const faceOutlineIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10]
const leftEyeIndices = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33]
const rightEyeIndices = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362]
const leftBrowIndices = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70]
const rightBrowIndices = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285, 336]
const noseBridgeIndices = [168, 6, 197, 195, 5, 4, 1]
const noseBaseIndices = [64, 98, 97, 2, 326, 327, 294]
const mouthIndices = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]
const jawlineIndices = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]
const cheekboneIndices = [234, 116, 117, 118, 119, 100, 47, 126, 209, 49, 129, 203, 205, 50, 101, 36, 206, 207, 187, 147, 213, 192, 214, 210, 211, 32, 208, 199, 428, 262, 431, 430, 434, 416, 433, 376, 411, 427, 426, 266, 330, 280, 425, 423, 358, 279, 429, 355, 277, 329, 348, 347, 346, 454]

type FaceLandmarkerInstance = {
  detect: (image: HTMLImageElement | HTMLCanvasElement) => {
    facialTransformationMatrixes?: Array<{ data: number[] }>
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>
  }
}

let landmarkerPromise: Promise<FaceLandmarkerInstance> | null = null

export type FaceDetectionResult =
  | { status: 'detected'; landmarks: FaceLandmarksPayload }
  | { status: 'no-face' | 'multiple-faces' | 'unavailable'; message: string }

// Existing photo uploads retain their nullable API; the creator UI can show
// actionable failures instead of treating a blocked model download as no face.
export async function extractFaceLandmarksFromDataUrl(dataUrl: string, profile = false): Promise<FaceLandmarksPayload | null> {
  const { detection: result } = await detectWebAnalysisEvidence(dataUrl, profile)
  return result.status === 'detected' ? result.landmarks : null
}

export async function detectFaceLandmarksFromDataUrl(dataUrl: string): Promise<FaceDetectionResult> {
  return (await detectWebAnalysisEvidence(dataUrl)).detection
}

// A single detector pass supplies both the existing overlay anchors and web v2 geometry.
export async function detectWebAnalysisEvidence(dataUrl: string, profile = false): Promise<{ detection: FaceDetectionResult; mesh: LandmarkInput | null }> {
  try {
    const [image, landmarker] = await Promise.all([loadImage(dataUrl), getFaceLandmarker()])
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    let faces = landmarker.detect(image).faceLandmarks ?? []
    let detection = landmarksFromFaces(faces, size)
    if (profile && detection.status === 'no-face') {
      faces = await detectCroppedProfile(image, landmarker)
      detection = landmarksFromFaces(faces, size)
    }
    if(detection.status==='detected') {
      const canvas=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(size.width,size.height))
      canvas.width=Math.round(size.width*scale);canvas.height=Math.round(size.height*scale)
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!
      ctx.drawImage(image,0,0,canvas.width,canvas.height)
      detection.landmarks=refinePhotographedContours(detection.landmarks,ctx.getImageData(0,0,canvas.width,canvas.height), profile)
    }
    const points = faces[0]
    const mesh = detection.status === 'detected' && points?.length === 478
      ? { ...size, points: points.map(point => ({ x: point.x, y: point.y, z: point.z ?? 0 })) }
      : null
    return { detection, mesh }
  } catch {
    return { detection: { status: 'unavailable', message: 'Face detection could not load. Check your connection and retry, or try another browser.' }, mesh: null }
  }
}

async function detectCroppedProfile(image: HTMLImageElement, landmarker: FaceLandmarkerInstance) {
  const { getProfileSilhouetteRegions } = await import('./profile-silhouette')
  const silhouette = await getProfileSilhouetteRegions(image.src)
  if (!silhouette?.skin.length) return []
  const { naturalWidth: width, naturalHeight: height } = image
  const xs = silhouette.skin.map(p => p.x), ys = silhouette.skin.map(p => p.y)
  const faceWidth = (Math.max(...xs) - Math.min(...xs)) * width
  const faceHeight = (Math.max(...ys) - Math.min(...ys)) * height
  const size = Math.min(Math.max(faceWidth, faceHeight) * 1.45, width, height)
  if (size < 32 || size >= Math.max(width, height) * .94) return []
  const x = Math.min(width - size, Math.max(0, (Math.min(...xs) + Math.max(...xs)) * width / 2 - size / 2))
  const y = Math.min(height - size, Math.max(0, (Math.min(...ys) + Math.max(...ys)) * height / 2 - size / 2))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(768, Math.round(size))
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(image, x, y, size, size, 0, 0, canvas.width, canvas.height)
  return (landmarker.detect(canvas).faceLandmarks ?? []).map(face => face.map(point => ({
    x: (x + point.x * size) / width, y: (y + point.y * size) / height,
    z: point.z === undefined ? undefined : point.z * size / width,
  })))
}

export function landmarksFromFaces(faces: Array<Array<{ x: number; y: number; z?:number }>>, image: { width: number; height: number }): FaceDetectionResult {
  if (faces.length > 1) return { status: 'multiple-faces', message: 'More than one face detected. Crop the image to one person and upload it again.' }
  const face = faces[0]
  if (!face) return { status: 'no-face', message: 'No usable face detected. Try a clear, front-facing photo with the whole face visible.' }

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
    leftCheekbone: pickMany(face,[234,116,117,118,119]),
    rightCheekbone: pickMany(face,[454,345,346,347,348]),
    leftSubmalar: pickMany(face,[93,123,50,101]),
    rightSubmalar: pickMany(face,[323,352,280,330]),
  }
  const quality = computeLandmarkQuality(anchors, contours, image)
  if(Number.isFinite(face[33]?.z)&&Number.isFinite(face[263]?.z)) quality.yawRadians=Math.atan2(face[263].z!-face[33].z!,Math.hypot(face[263].x-face[33].x,(face[263].y-face[33].y)*image.height/image.width))

  return { status: 'detected', landmarks: {
    version: 1,
    detectorRevision: faceContourRevision,
    source: 'mediapipe-face-landmarker',
    confidence: quality.score,
    image,
    anchors,
    contours,
    quality,
  } }
}

function computeLandmarkQuality(
  anchors: FaceLandmarksPayload['anchors'],
  contours: NonNullable<FaceLandmarksPayload['contours']>,
  image: { width: number; height: number },
): NonNullable<FaceLandmarksPayload['quality']> {
  const anchorCount = Object.values(anchors).filter(Boolean).length
  const contourPointCount = Object.values(contours).reduce((sum, points) => sum + (points?.length ?? 0), 0)
  const faceCoverage = getFaceCoverage(contours.faceOutline)
  const rollRadians = getRollRadians(anchors.leftPupil ?? anchors.leftEyeOuter, anchors.rightPupil ?? anchors.rightEyeOuter, image)
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

function getRollRadians(left: NormalizedPoint | undefined, right: NormalizedPoint | undefined, image: { width: number; height: number }) {
  if (!left || !right) return 0
  return Math.atan2((right.y - left.y) * image.height, (right.x - left.x) * image.width)
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
  const selected = indices.map((index) => pick(points, index))
  // Never collapse gaps: contour indices carry anatomical meaning.
  return selected.every((point): point is NormalizedPoint => Boolean(point)) ? selected : []
}

export async function createWebCameraPoseReader() {
  const detector = await getFaceLandmarker()
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Camera processing unavailable')
  return (video: HTMLVideoElement) => {
    const width = Math.min(video.videoWidth, 480)
    const height = Math.round(video.videoHeight * width / video.videoWidth)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    context.drawImage(video, 0, 0, width, height)
    const result = detector.detect(canvas)
    const faces = result.faceLandmarks ?? []
    if (faces.length !== 1) return { status: faces.length ? 'multiple' : 'missing' } as const
    const face = faces[0]
    const matrix = result.facialTransformationMatrixes?.[0]?.data
    if (!matrix || !face[152] || !face[10] || !face[234] || !face[454]) return { status: 'missing' } as const
    const degrees = 180 / Math.PI
    return {
      status: 'found',
      yaw: Math.atan2(-matrix[2], Math.hypot(matrix[0], matrix[1])) * degrees,
      pitch: Math.atan2(matrix[6], matrix[10]) * degrees,
      roll: Math.atan2(matrix[1], matrix[0]) * degrees,
      centerX: (face[234].x + face[454].x) / 2,
      centerY: (face[10].y + face[152].y) / 2,
      width: Math.abs(face[454].x - face[234].x),
      height: face[152].y - face[10].y,
    } as const
  }
}

async function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = createFaceLandmarker().catch((error) => {
      landmarkerPromise = null
      throw error
    })
  }
  return landmarkerPromise
}

async function createFaceLandmarker(): Promise<FaceLandmarkerInstance> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl)
  const create = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'IMAGE',
    numFaces: 2,
    minFaceDetectionConfidence: .6,
    minFacePresenceConfidence: .6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  })
  try { return await create('GPU') } catch { return await create('CPU') }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for landmark extraction'))
    image.crossOrigin = 'anonymous'
    image.src = dataUrl
  })
}

function pick(points: Array<{ x: number; y: number }>, index: number): NormalizedPoint | undefined {
  const point = points[index]
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return undefined

  return {
    x: point.x,
    y: point.y,
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
