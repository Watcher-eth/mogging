import { useRef } from 'react'
import { useInView } from 'motion/react'
import { Check, Play, X } from 'lucide-react'
import styles from './submission-review-animation.module.css'

export function SubmissionReviewAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)

  return (
    <div ref={ref} className={styles.scene} data-running={inView} aria-hidden="true">
      {[true, false].map((approved, index) => (
        <div
          key={String(approved)}
          className={`${styles.card} ${approved ? styles.approved : styles.declined}`}
          style={{ animationDelay: `${-index * 5}s` }}
        >
          <div className={styles.skeleton} />
          <span className={styles.play}><Play size={13} fill="currentColor" strokeWidth={0} /></span>
          <div className={styles.caption}>
            <span /><span />
          </div>
          <span className={styles.verdict}>
            {approved ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
            {approved ? 'Approved' : 'Declined'}
          </span>
        </div>
      ))}
    </div>
  )
}
