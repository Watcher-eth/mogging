import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

let detector: Promise<FaceLandmarker> | undefined
async function createDetector() {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE', numFaces: 2,
    minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  })
}

export async function detectV2Landmarks(image: HTMLImageElement) {
  detector ??= createDetector().catch(error => { detector = undefined; throw error })
  const result = (await detector).detect(image)
  if (result.faceLandmarks.length !== 1) throw new Error(result.faceLandmarks.length ? 'Use a photo containing only one face.' : 'No face detected. Try a clearer front-facing photo.')
  return { points: result.faceLandmarks[0], blendshapes: result.faceBlendshapes[0]?.categories ?? [], transformation: result.facialTransformationMatrixes[0] ?? null }
}
