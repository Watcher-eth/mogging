import { useEffect } from 'react'
import { socialImageForPath } from '@/lib/seo'
import type { FaceStudyRenderInput } from '@/lib/creator/render-mobile-face-study'

export default function FaceStudyRender() {
  useEffect(() => {
    window.renderPrivateFaceStudy = async ({ photo, face, composition }) => {
      const [{ studyImageId }, { prepareVideo }, { encodeStudyFrames }] = await Promise.all([
        import('@/lib/creator/mobile-face-study'), import('@/lib/creator/video-renderer'), import('@/lib/creator/encode-study-frames'),
      ])
      const prepared = await prepareVideo(composition, [{
        id: studyImageId, name: 'Portrait', dataUrl: photo, ...face.image, landmarks: face, status: 'ready',
      }], 'video', { keepPortraitBackground: true })
      const avatar = new Image()
      avatar.src = socialImageForPath('/').path
      await avatar.decode().then(() => { prepared.studyAvatar = avatar }).catch(() => {})
      const video = await encodeStudyFrames(prepared)
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(video)
      })
    }
    return () => { delete window.renderPrivateFaceStudy }
  }, [])
  return null
}

declare global {
  interface Window {
    renderPrivateFaceStudy?: (input: FaceStudyRenderInput) => Promise<string>
  }
}
