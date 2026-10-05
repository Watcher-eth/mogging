import { useRef } from 'react'
import { useInView } from 'motion/react'
import styles from './video-submission-animation.module.css'

/** Decorative editor → submission loop; CSS owns the animation clock. */
export function VideoSubmissionAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)

  return (
    <div ref={ref} className={styles.scene} data-running={inView} aria-hidden="true">
      <svg viewBox="0 0 320 180" fill="none" className={styles.art}>
        <g className={styles.editor}>
          <rect x="32" y="12" width="256" height="152" rx="16" fill="white" stroke="#E4E7EB" />
          <circle cx="47" cy="26" r="2" fill="#D4D8DE" />
          <circle cx="55" cy="26" r="2" fill="#D4D8DE" />
          <circle cx="63" cy="26" r="2" fill="#D4D8DE" />
          <text x="160" y="29" textAnchor="middle" fill="#8A9099" fontSize="7" letterSpacing="1.4">YOUR NEXT VIDEO</text>
          <rect x="44" y="38" width="232" height="72" rx="8" fill="#F0F4F7" />
          <g className={styles.preview}>
            <rect x="125" y="42" width="70" height="64" rx="7" fill="#E2F4FC" />
            <path d="M139 97C139 82 149 77 160 77C171 77 181 82 181 97" fill="#B4DFEF" />
            <ellipse cx="160" cy="64" rx="11" ry="13" fill="#B4DFEF" />
          </g>
          <circle cx="160" cy="74" r="13" fill="white" fillOpacity=".9" />
          <path d="m157 69 8 5-8 5V69Z" fill="#252A30" />
          <path d="M51 121H269" stroke="#E9ECEF" strokeLinecap="round" />
          <rect x="52" y="127" width="216" height="23" rx="5" fill="#EEF0F3" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <rect x={56 + i * 35} y="130" width="31" height="17" rx="3" fill={i % 2 ? '#CBEAF7' : '#DDEAF0'} />
              <path d={`M${61 + i * 35} 142l7-7 7 7`} stroke="#B1CEDC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          <g className={styles.trim}>
            <rect x="53" y="128" width="214" height="21" rx="4" stroke="#00A8EF" strokeWidth="1.5" />
            <rect x="51" y="127" width="5" height="23" rx="2" fill="#00A8EF" />
            <rect x="264" y="127" width="5" height="23" rx="2" fill="#00A8EF" />
          </g>
          <g className={styles.playhead}>
            <path d="M62 123v29" stroke="#252A30" strokeWidth="1.5" />
            <path d="m59 120 3 4 3-4" fill="#252A30" />
          </g>
        </g>
        <g className={styles.submission}>
          <rect x="82" y="36" width="156" height="112" rx="16" fill="white" stroke="#E4E7EB" />
          <rect x="141" y="49" width="38" height="46" rx="7" fill="#EDF8FE" />
          <path d="m157 62 10 7-10 7V62Z" fill="#00A8EF" />
          <path d="M101 110H219" stroke="#EEF0F3" strokeWidth="4" strokeLinecap="round" />
          <path className={styles.upload} d="M101 110H219" stroke="#00A8EF" strokeWidth="4" strokeLinecap="round" />
          <text className={styles.sending} x="160" y="132" textAnchor="middle" fill="#858A91" fontSize="9">Submitting video</text>
          <text className={styles.sent} x="160" y="132" textAnchor="middle" fill="#252A30" fontSize="9" fontWeight="500">Ready for review</text>
          <g className={styles.check}>
            <circle cx="178" cy="88" r="11" fill="#00A8EF" stroke="white" strokeWidth="3" />
            <path d="m173.5 88 3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
        <g className={styles.spark} stroke="#00A8EF" strokeWidth="1.5" strokeLinecap="round">
          <path d="M244 49v6m-3-3h6M77 93v6m-3-3h6" />
        </g>
      </svg>
    </div>
  )
}
