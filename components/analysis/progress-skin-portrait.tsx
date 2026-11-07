import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { useEffect, useState } from 'react'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable, type FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'

export type SkinPortrait = { src: string; landmarks: FaceLandmarksPayload | null }

const skinPreset = getReportOverlayPreset('skin')

export function ProgressSkinPortrait({ src, landmarks }: SkinPortrait) {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<FaceLandmarksPayload | null>(null)

  useEffect(() => {
    if (!image) return
    let current = true
    const original = new Image()
    original.src = image.src
    void Promise.all([import('@/lib/creator/editorial-posters'), original.decode()]).then(([{ cutout }]) => current ? cutout(original) : null).then(canvas => {
      if (current && canvas) setSubject(canvas.toDataURL('image/png'))
    }).catch(() => { /* The original stays visible when segmentation is unavailable. */ })
    const measured = isFaceLandmarksUsable(landmarks)
      ? Promise.resolve(landmarks)
      : getReportImageLandmarks(src, image.src)
    void measured.then(result => { if (current) setOverlay(enrichFaceLandmarks(result)) }).catch(() => {})
    return () => { current = false }
  }, [image, src, landmarks])

  return <span className="relative ml-auto block h-28 w-full max-w-48 overflow-hidden sm:h-36 [mask-image:radial-gradient(ellipse_100%_88%_at_50%_0%,black_72%,transparent_100%)]">
    {/* Keep the original for landmark detection and mask generation. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="" loading="lazy" className={`absolute inset-0 size-full object-contain object-center ${subject ? 'opacity-0' : ''}`} onLoad={event => {
      const loaded = event.currentTarget
      setImage({ src: loaded.currentSrc, width: loaded.naturalWidth, height: loaded.naturalHeight })
    }} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {subject && <img src={subject} alt="" className="absolute inset-0 size-full object-contain object-center" />}
    {image && overlay && <FaceOverlay categoryId="skin" preset={skinPreset} image={image} landmarks={overlay} fit="contain" />}
    <ProgressiveBlur className="pointer-events-none absolute inset-x-0 bottom-[12%] h-[36%]" intensity={7} />
  </span>
}
