export const mobileFaceGuide = { centerY: .46, width: .74, height: .5 }
export const frontGuideCoverage = .7

export function guidedCameraFrame(video: HTMLVideoElement, zoom: number) {
  const { videoWidth, videoHeight, clientWidth, clientHeight } = video
  const scale = Math.min(clientWidth / videoWidth, clientHeight / videoHeight) * zoom
  return { width: videoWidth * scale / clientWidth, height: videoHeight * scale / clientHeight }
}

const faceSamples = Array.from({ length: 121 }, (_, index) => ({
  x: (index % 11 - 5) / 5,
  y: (Math.floor(index / 11) - 5) / 5,
})).filter(({ x, y }) => x * x + y * y <= 1)

export function guidedFaceAlignment(
  face: { centerX: number; centerY: number; width: number; height: number },
  frame: { width: number; height: number },
) {
  const x = .5 - (face.centerX - .5) * frame.width
  const y = .5 + (face.centerY - .5) * frame.height
  const width = face.width * frame.width
  const height = face.height * frame.height
  // Sample the area of the detected face, including any part cropped by the preview.
  const inside = faceSamples.filter(sample => {
    const guideX = (x - .5 + sample.x * width / 2) / (mobileFaceGuide.width / 2)
    const guideY = (y - mobileFaceGuide.centerY + sample.y * height / 2) / (mobileFaceGuide.height / 2)
    return guideX * guideX + guideY * guideY <= 1
  }).length
  return { x, y, width, height, coverage: inside / faceSamples.length }
}
