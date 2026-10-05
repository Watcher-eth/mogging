import NumberFlow from '@number-flow/react'
import { useId, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import styles from './video-submission-animation.module.css'

/** Decorative editor → views → submission loop; CSS owns the animation clock. */
export function VideoSubmissionAnimation() {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const [views, setViews] = useState(0)

  return (
    <div ref={ref} className={styles.scene} data-running={inView} aria-hidden="true">
      <svg viewBox="0 0 320 180" fill="none" className={styles.art}>
        <rect className={styles.countCue} onAnimationStart={() => setViews(100)} onAnimationIteration={() => setViews(100)} />
        <rect className={styles.resetCue} onAnimationStart={() => setViews(0)} onAnimationIteration={() => setViews(0)} />
        <defs>
          <clipPath id={`${id}-crop`}><rect width="48" height="64" rx="6" /></clipPath>
          <g id={`${id}-video`}>
            <image href="/_next/image?url=%2Fmodel.png&amp;w=256&amp;q=75" width="48" height="64" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}-crop)`} />
            <rect y="44" width="48" height="20" rx="6" fill="#17191D" fillOpacity=".45" />
            <path d="M8 52h23M8 57h16" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".8" />
          </g>
          <g id={`${id}-play`}>
            <circle r="11" fill="white" fillOpacity=".95" />
            <path d="m-2.5-4 6 4-6 4V-4Z" fill="#252A30" />
          </g>
        </defs>
        <g className={styles.editor}>
          <rect x="32" y="12" width="256" height="152" rx="16" fill="white" stroke="#E4E7EB" />
          <circle cx="47" cy="26" r="2" fill="#D4D8DE" />
          <circle cx="55" cy="26" r="2" fill="#D4D8DE" />
          <circle cx="63" cy="26" r="2" fill="#D4D8DE" />
          <text x="160" y="29" textAnchor="middle" fill="#8A9099" fontSize="7" letterSpacing="1.4">YOUR NEXT VIDEO</text>
          <rect x="44" y="38" width="232" height="72" rx="8" fill="#F0F4F7" />
          <path d="M61 54h36M61 60h25M223 88h34M233 94h24" stroke="#D5DEE5" strokeWidth="3" strokeLinecap="round" />
          <g className={styles.preview}>
            <use href={`#${id}-video`} x="136" y="42" />
          </g>
          <use href={`#${id}-play`} x="160" y="74" />
          <path d="M51 121H269" stroke="#E9ECEF" strokeLinecap="round" />
          <rect x="52" y="127" width="216" height="23" rx="5" fill="#EEF0F3" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <svg x={56 + i * 35} y="130" width="31" height="17" viewBox="0 8 48 28" preserveAspectRatio="xMidYMid slice">
                <use href={`#${id}-video`} />
              </svg>
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
        <g className={styles.analytics}>
          <rect x="40" y="15" width="240" height="148" rx="16" fill="white" stroke="#E4E7EB" />
          <text x="56" y="36" fill="#858A91" fontSize="8" letterSpacing="1.2">VIDEO PERFORMANCE</text>
          <foreignObject x="56" y="43" width="145" height="29">
            <div className={styles.viewCount}>
              <NumberFlow
                value={views}
                suffix="k"
                animated={views > 0}
                transformTiming={{ duration: 2080, easing: 'ease-in-out' }}
                spinTiming={{ duration: 2080, easing: 'ease-in-out' }}
                locales="en-US"
              />
              <span>views</span>
            </div>
          </foreignObject>
          <rect x="213" y="47" width="51" height="19" rx="9.5" fill="#EDF8FE" />
          <text x="238" y="60" textAnchor="middle" fill="#00A8EF" fontSize="8" fontWeight="600">↗ 124%</text>
          {[88, 111, 134].map((y) => <path key={y} d={`M56 ${y}H264`} stroke="#F0F2F5" />)}
          <path className={styles.graphFill} d="M56 133 82 127 108 130 134 113 160 118 186 99 212 103 238 83 262 73V141H56Z" fill="#EDF8FE" />
          <path className={styles.graph} pathLength="1" d="M56 133 82 127 108 130 134 113 160 118 186 99 212 103 238 83 262 73" stroke="#00A8EF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle className={styles.graphDot} cx="262" cy="73" r="4" fill="#00A8EF" stroke="white" strokeWidth="2" />
          <text x="56" y="153" fill="#A0A5AD" fontSize="7">Published</text>
          <text x="264" y="153" textAnchor="end" fill="#A0A5AD" fontSize="7">Today</text>
        </g>
        <g className={styles.submission}>
          <rect x="54" y="20" width="212" height="140" rx="16" fill="white" stroke="#E4E7EB" />
          <text x="70" y="40" fill="#858A91" fontSize="8" letterSpacing="1.2">CAMPAIGN SUBMISSION</text>
          <use href={`#${id}-video`} x="70" y="51" />
          <use href={`#${id}-play`} x="94" y="79" />
          <text x="130" y="68" fill="#252A30" fontSize="10" fontWeight="600">Your next video</text>
          <text x="130" y="84" fill="#858A91" fontSize="8">Published post attached</text>
          <rect x="130" y="94" width="105" height="18" rx="9" fill="#F3F5F7" />
          <path d="M138 105v-4m4 4v-7m4 7v-5" stroke="#858A91" strokeWidth="1.3" strokeLinecap="round" />
          <text x="153" y="106" fill="#73777D" fontSize="7">Analytics attached</text>
          <path d="M70 125H250" stroke="#EEF0F3" strokeWidth="3" strokeLinecap="round" />
          <path className={styles.upload} pathLength="1" d="M70 125H250" stroke="#00A8EF" strokeWidth="3" strokeLinecap="round" />
          <text className={styles.sending} x="160" y="146" textAnchor="middle" fill="#858A91" fontSize="9">Submitting video…</text>
          <text className={styles.sent} x="160" y="146" textAnchor="middle" fill="#252A30" fontSize="9" fontWeight="500">Submitted · Ready for review</text>
          <g className={styles.check}>
            <circle cx="246" cy="29" r="12" fill="#00A8EF" stroke="white" strokeWidth="3" />
            <path d="m241.5 29 3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
        <g className={styles.spark} stroke="#00A8EF" strokeWidth="1.5" strokeLinecap="round">
          <path d="M244 49v6m-3-3h6M77 93v6m-3-3h6" />
        </g>
      </svg>
    </div>
  )
}
