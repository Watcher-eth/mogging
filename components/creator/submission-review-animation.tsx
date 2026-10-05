import Image from 'next/image'
import { useRef } from 'react'
import { useInView } from 'motion/react'
import { Check, Play, X } from 'lucide-react'
import styles from './submission-review-animation.module.css'

const examples = [
  { image: '/model.png', approved: true },
  { image: '/model3.png', approved: false },
  { image: '/model2.png', approved: true },
  { image: '/model4.png', approved: false },
]

export function SubmissionReviewAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)

  return (
    <div ref={ref} className={styles.scene} data-running={inView} aria-hidden="true">
      {examples.map(({ image, approved }, index) => (
        <div
          key={image}
          className={`${styles.card} ${approved ? styles.approved : styles.declined}`}
          style={{ animationDelay: `${-index * 4}s` }}
        >
          <Image src={image} alt="" fill sizes="120px" className={styles.portrait} />
          <div className={styles.shade} />
          <span className={styles.duration}>0:24</span>
          <span className={styles.play}><Play size={15} fill="currentColor" strokeWidth={0} /></span>
          <div className={styles.caption}>
            <span>Mogging</span>
            <strong>Your next transformation.</strong>
            <div className={styles.track}><span /></div>
          </div>
          <span className={styles.verdict}>
            {approved ? <Check size={12} strokeWidth={2.5} /> : <X size={12} strokeWidth={2.5} />}
            {approved ? 'Approved' : 'Declined'}
          </span>
        </div>
      ))}
    </div>
  )
}
