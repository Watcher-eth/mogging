import { motion, useReducedMotion } from 'motion/react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { CaptureFrameImagePosition } from './capture-frame'
import { desktopCaptureViewport, getFaceGuide } from './face-guide'

const centered = { x: 50, y: 50, scale: 1 }

export function DesktopCaptureOval({ side = false, light = false, landmarks, position = centered, fit = 'cover' }: {
  side?: boolean
  light?: boolean
  landmarks?: FaceLandmarksPayload | null
  position?: CaptureFrameImagePosition
  fit?: 'cover' | 'contain'
}) {
  const reduce = useReducedMotion()
  const stroke = light ? 'white' : '#4e4c49'
  const initial = { cx: 240, cy: 271, rx: side ? 119 : 127, ry: 189 }
  const measured = getFaceGuide(landmarks, position, desktopCaptureViewport, fit)
  const target = landmarks?.contours?.faceOutline?.length ? measured : initial
  const transition = { duration: reduce ? 0 : .66, ease: [.22, 1, .36, 1] as const }
  return <svg className="desktop-capture-oval" viewBox="0 0 480 600" aria-hidden="true">
    <motion.ellipse initial={initial} animate={target} transition={transition} stroke={light ? '#161616' : 'white'} strokeOpacity=".25" strokeWidth="4" fill="none" vectorEffect="non-scaling-stroke" />
    <motion.ellipse initial={initial} animate={target} transition={transition} stroke={stroke} strokeOpacity=".9" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 7" fill="none" vectorEffect="non-scaling-stroke" />
  </svg>
}

export function DesktopCaptureExample({ side = false }: { side?: boolean }) {
  return <svg className="desktop-capture-example" viewBox="0 0 240 320" fill="none" aria-hidden="true">
    {side ? <>
      <path d="M40 318c9-31 32-48 63-64l1-27c-20-13-30-34-32-54l-16-7c-6-3-6-7-1-13l17-23c3-6 0-15 1-24 4-43 31-77 75-77 45 0 72 31 72 76 0 30-15 47-30 65l-4 67c26 17 48 38 54 81Z" fill="currentColor" />
      <path d="M85 126c7-6 15-7 24-4m-26 60c8 2 14 1 20-2m51-23c10-13 24-8 22 3-2 10-10 20-17 20m-49 46c16 9 31 6 46-1" />
    </> : <>
      <path d="M0 318c7-27 36-50 81-64l4-33c-15-13-25-33-30-56-13-2-21-13-21-28 0-9 6-14 12-13-1-61 26-95 74-95s75 34 74 95c6-1 12 4 12 13 0 15-8 26-21 28-5 23-15 43-30 56l4 33c45 14 74 37 81 64Z" fill="currentColor" />
      <path d="M66 128c9-5 20-5 29 0m50 0c9-5 20-5 29 0m-54 10-7 23c3 3 11 3 14 0m-24 26c11-3 23-3 34 0m-45 38c17 12 39 12 56 0" />
    </>}
  </svg>
}
