import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { useReducedMotion } from 'motion/react'

const guides = {
  front: { caption: 'Look straight ahead', description: 'Hold the phone at eye level and keep your entire face in the frame.' },
  side: { caption: 'Turn to a full profile', description: 'Turn 90 degrees. Keep your forehead, nose, chin and ear visible.' },
  distance: { caption: 'Step back and level the camera', description: 'Place the phone at eye level, a few feet away, then take the photo.' },
} as const

export function StudioGuide({ kind, distanceVariant }: { kind: keyof typeof guides; distanceVariant?: 'male' | 'female' }) {
  const reduce = useReducedMotion()
  const guide = guides[kind]
  const asset = kind === 'distance' && distanceVariant ? `phone-distance-${distanceVariant}` : `phone-${kind}`
  return <figure className="desktop-studio-guide">
    <video key={asset} autoPlay={!reduce} loop={!reduce}
      src={`/analysis/studio/${asset}.mp4`} poster={`/analysis/studio/${asset}.jpg`} muted playsInline preload="metadata" aria-hidden="true" />
    <ProgressiveBlur className="desktop-studio-blur" blurLayers={4} intensity={4} />
    <figcaption><span>{guide.caption}</span><small>{guide.description}</small></figcaption>
  </figure>
}
