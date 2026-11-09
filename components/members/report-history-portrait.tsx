import { useEffect, useMemo, useState } from 'react'
import { FaceOverlay, type LoadedImage } from '@/components/analysis/face-overlay'
import { parseFaceLandmarksPayload, type FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'

const preset = getReportOverlayPreset('overall')
const thumbnailPreset = {
  ...preset,
  primitives: preset.primitives.filter(primitive => primitive.kind !== 'label').map(primitive => {
    const animation = primitive.animation && { ...primitive.animation, delay: 0, duration: 360 }
    if (primitive.kind === 'line' || primitive.kind === 'polyline') {
      return { ...primitive, strokeWidth: 1.5, opacity: .92, animation }
    }
    return { ...primitive, animation }
  }),
}

export function ReportHistoryPortrait({ imageUrl, landmarks }: { imageUrl: string; landmarks: unknown }) {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const stored = useMemo(() => parseFaceLandmarksPayload(landmarks), [landmarks])
  const mapped = isFaceLandmarksUsable(stored) ? stored : detected

  useEffect(() => {
    if (!image || isFaceLandmarksUsable(stored)) return
    let active = true
    void getReportImageLandmarks(imageUrl, image.src).then(result => { if (active) setDetected(result) })
    return () => { active = false }
  }, [image, imageUrl, stored])

  return <div className="scan-evaluation-thumbnail">
    <img src={imageUrl} alt="" loading="lazy" onLoad={event => {
      const photo = event.currentTarget
      setImage({ src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
    }} />
    {image && mapped && <FaceOverlay image={image} landmarks={mapped} preset={thumbnailPreset} appearance="scan" fit="cover" fadeDurations={{ enter: .22, exit: .15 }} />}
  </div>
}
