import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { FaceOverlay } from './face-overlay'
import { welcomeOverlayPresets } from '@/lib/creator/welcome-overlay-presets'
import { enrichWelcomeLandmarks } from '@/lib/creator/welcome-overlay-landmarks'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import welcomeLandmarks from './scan-welcome-landmarks.json'
import styles from './mobile-scan-pwa.module.css'

const landmarks = welcomeLandmarks as FaceLandmarksPayload
const renderLandmarks = enrichWelcomeLandmarks(landmarks) ?? landmarks
const portrait = { src: '/scan/welcome.jpg', ...welcomeLandmarks.image }
const faceMap: OverlayPreset = {
  id: 'primer-face-map',
  footer: '',
  primitives: Object.entries(landmarks.anchors).flatMap(([id, point], index) => point ? [{
    id, kind: 'point', at: { point }, radius: 2.5, tone: 'dot',
    animation: { delay: index * 35, duration: 500, entrance: 'scale' },
  }] : []),
}
const scenes = [welcomeOverlayPresets.eyes, welcomeOverlayPresets.mouth, faceMap, welcomeOverlayPresets.jaw, welcomeOverlayPresets.symmetry]

export const scanPart: Variants = {
  enter: (from = 12) => ({ opacity: 0, y: from }),
  visible: { opacity: 1, y: 0, transition: { duration: .36, ease: [.16, 1, .3, 1] } },
  leave: { opacity: 0, y: -8, transition: { duration: .18, ease: 'easeIn' } },
}

export const scanSequence: Variants = {
  enter: {},
  visible: { transition: { staggerChildren: .065 } },
  leave: { transition: { staggerChildren: .018, staggerDirection: -1 } },
}

export function MobileScanWelcome({ appLink, onBegin, onSignIn, starting = false }: { appLink?: ReactNode; onBegin: () => void; onSignIn: () => void; starting?: boolean }) {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const [scene, setScene] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setScene(index => (index + 1) % scenes.length)
    }, 4300)
    return () => window.clearInterval(timer)
  }, [reduced])

  return <motion.div className={styles.welcome} variants={scanSequence} initial="enter" animate="visible" exit="leave">
    <motion.div className={styles.welcomePortrait} variants={scanPart} custom={0}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={portrait.src} alt="" fetchPriority="high" />
      <AnimatePresence>
        <FaceOverlay key={scene} preset={scenes[scene]} landmarks={renderLandmarks} image={portrait}
          fit="cover" appearance="primer" fadeDurations={{ enter: .4, exit: .24 }} />
      </AnimatePresence>
    </motion.div>
    <motion.div className={styles.welcomeCopy} variants={scanSequence}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img variants={scanPart} custom={-14} className={styles.icon} src="/scan/icon-512.png" alt="Mogging" />
      <motion.h1 variants={scanPart} custom={-14}>Ascend to your true potential.</motion.h1>
      <motion.p variants={scanPart} custom={-14}>Discover your true potential. Unlock the glow-up you’ve been dreaming of.</motion.p>
      <motion.div className={styles.dock} variants={scanPart} custom={24}>
        <ScanButton onClick={onBegin} disabled={starting}>{starting ? 'Starting…' : 'I’m ready to Mog'}</ScanButton>
        {appLink}
        <motion.button type="button" whileTap={reduced ? undefined : { scale: .96 }} onClick={() => { feedback(); onSignIn() }} className={styles.returning}>Already have an account? Sign in</motion.button>
      </motion.div>
    </motion.div>
  </motion.div>
}

export function ScanButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const feedback = useScanFeedback()
  const reduced = useReducedMotion()
  return <motion.button type="button" className={styles.button} disabled={disabled}
    whileTap={disabled || reduced ? undefined : { scale: .95 }}
    onClick={() => { feedback('action'); onClick() }}>{children}</motion.button>
}
