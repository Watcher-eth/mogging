import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'

export function OnboardingVault({ locked }: { locked: boolean }) {
  const id = useId()
  const reduce = useReducedMotion()
  const transition = { duration: reduce ? 0 : .7, ease: [.22, 1, .36, 1] as const }
  return <div className="onboarding-vault" aria-hidden="true">
    <svg viewBox="44 36 266 237" fill="none">
      <defs>
        <linearGradient id={id + 'steel'} x1="58" y1="44" x2="288" y2="249" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eef0f2" /><stop offset=".28" stopColor="#b1b5ba" /><stop offset=".53" stopColor="#d1d4d7" /><stop offset="1" stopColor="#747b82" />
        </linearGradient>
        <linearGradient id={id + 'door'} x2=".86" y2="1">
          <stop stopColor="#d9dde0" /><stop offset=".36" stopColor="#a9aeb4" /><stop offset=".59" stopColor="#c6cbd0" /><stop offset="1" stopColor="#838b93" />
        </linearGradient>
        <linearGradient id={id + 'side'} x1="0" y1="0" x2="1" y2=".7">
          <stop stopColor="#9aa1a8" /><stop offset=".46" stopColor="#6c747e" /><stop offset="1" stopColor="#444b55" />
        </linearGradient>
        <linearGradient id={id + 'hardware'} x2="0" y2="1">
          <stop stopColor="#f2f4f5" /><stop offset=".35" stopColor="#a0a7ae" /><stop offset=".58" stopColor="#727982" /><stop offset="1" stopColor="#c3c8cc" />
        </linearGradient>
        <pattern id={id + 'grain'} width="7" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 .5h7m-7 2h7" stroke="#fff" strokeOpacity=".075" strokeWidth=".45" />
          <path d="M0 1.5h7m-7 2h7" stroke="#333941" strokeOpacity=".075" strokeWidth=".45" />
        </pattern>
        <radialGradient id={id + 'shadow'}><stop stopColor="#282b34" stopOpacity=".17" /><stop offset="1" stopColor="#282b34" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="184" cy="252" rx="138" ry="22" fill={`url(#${id}shadow)`} />
      <path d="m81 54 35-13h139l35 27-38 9z" fill="#c7cbd0" stroke="#9ba2aa" strokeLinejoin="round" />
      <path d="m252 55 38 13q6 2 6 9v149q0 5-5 7l-39 13z" fill={`url(#${id}side)`} stroke="#666e78" />
      <path d="m269 78 19-6m-19 162 20-7" stroke="#f1f3f5" strokeOpacity=".28" strokeLinecap="round" />
      <rect x="64" y="53" width="200" height="193" rx="16" fill={`url(#${id}steel)`} stroke="#6f7780" />
      <rect x="67" y="56" width="194" height="187" rx="14" stroke="#f2f4f5" strokeOpacity=".72" />
      <rect x="77" y="65" width="174" height="169" rx="11" fill="#353a43" stroke="#eef0f2" strokeOpacity=".8" />
      <path d="M83 222h162l-11-17H91z" fill="#515862" />
      <motion.g style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
        animate={{ scaleX: locked ? 1 : .84, skewY: locked ? 0 : 6 }} transition={transition}>
        <path d="M235 111h16m-16 39h16m-16 39h16" stroke={`url(#${id}hardware)`} strokeWidth="6" strokeLinecap="round" />
        <rect x="86" y="73" width="160" height="158" rx="10" fill="#666e78" stroke="#4f5862" />
        <rect x="82" y="70" width="161" height="158" rx="9" fill={`url(#${id}door)`} stroke="#eef0f2" />
        <rect x="83" y="71" width="159" height="156" rx="8" fill={`url(#${id}grain)`} />
        <rect x="88" y="76" width="149" height="146" rx="5" stroke="#727982" strokeOpacity=".57" />
        <circle cx="165" cy="152" r="33" fill="#69727b" stroke="#4d555e" />
        <circle cx="164" cy="149" r="31" fill={`url(#${id}hardware)`} stroke="#e0e4e7" />
        <circle cx="164" cy="149" r="26" fill="#606873" stroke="#404750" />
        <motion.g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} animate={{ rotate: locked ? 72 : 0 }} transition={transition}>
          <circle cx="164" cy="149" r="21" fill={`url(#${id}hardware)`} stroke="#d0d5d9" />
          <path d="M164 134v30m-15-15h30" stroke="#464f59" strokeWidth="5" strokeLinecap="round" />
          <path d="M163 135v28m-13-15h28" stroke="#d4d8db" strokeWidth="2" strokeLinecap="round" />
          <circle cx="164" cy="149" r="6" fill={`url(#${id}hardware)`} stroke="#d9dce0" />
        </motion.g>
        <path d="M211 166h8v12h-8z" fill="#747c85" stroke="#cdd1d5" />
        <path d="M215 170v4" stroke="#343b45" strokeWidth="2" strokeLinecap="round" />
      </motion.g>
      <path d="M78 93h10v21H78zm0 91h10v21H78z" fill={`url(#${id}hardware)`} stroke="#68717a" />
    </svg>
  </div>
}

const privacyGlyphs = {
  vault: 'M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 3h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm4 2v4m-2-2h4',
  report: 'M4 8V6a2 2 0 0 1 2-2h2m8 0h2a2 2 0 0 1 2 2v2m0 8v2a2 2 0 0 1-2 2h-2m-8 0H6a2 2 0 0 1-2-2v-2m5-5 1-.7m4 0 1 .7m-5 4c1.4 1.2 2.6 1.2 4 0',
  control: 'M5 7h14M5 12h14M5 17h14M9 5v4m6 1v4m-5 1v4',
} as const

export function OnboardingPrivacyIcon({ name }: { name: keyof typeof privacyGlyphs }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={privacyGlyphs[name]} />
  </svg>
}
