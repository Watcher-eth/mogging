import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Activity, Heart, MessageCircle, ScanFace, X } from '@/components/ui/mogging-glyphs'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { protocolTasks } from '@/lib/creator/protocol-tasks'
import { expertQuotes } from '@/lib/client/scan-expert-quotes'
import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { ScanButton, scanPart, scanSequence } from './mobile-scan-pwa'
import styles from './mobile-scan-pwa.module.css'

const demoTasks = protocolTasks.filter(task => task.key === 'neck-posture' || task.key === 'tongue-rest')
const hours = Array.from({ length: 14 }, (_, index) => index + 6)

export function ProtocolStoryPreview() {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const [completed, setCompleted] = useState<string[]>([])
  const [opened, setOpened] = useState<(typeof demoTasks)[number] | null>(null)

  function toggle(key: string) {
    setCompleted(current => current.includes(key) ? current.filter(id => id !== key) : [...current, key])
  }

  return <>
    <div className={styles.storySchedule} aria-label="Example Protocol schedule">
      {hours.map(hour => <div key={hour}>{String(hour).padStart(2, '0')}:00</div>)}
      {demoTasks.map((task, index) => <motion.article key={task.key} data-done={completed.includes(task.key)}
        initial={reduced ? false : { opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduced ? 0 : .36, delay: reduced ? 0 : .48 + index * .36 }}
        style={{ top: (1 + index * 3) * 46 + 8, backgroundColor: task.color + (completed.includes(task.key) ? '40' : '66') }}>
        <motion.button type="button" whileTap={reduced ? undefined : { scale: .96 }}
          onClick={() => { feedback(); setOpened(task) }}>
          <span className={styles.storyScheduleIcon} style={{ color: task.color }}>{index ? <ScanFace size={22} /> : <Activity size={22} />}</span>
          <strong>{task.title}</strong>
        </motion.button>
        <motion.button type="button" className={styles.storyCheck} whileTap={reduced ? undefined : { scale: .85 }}
          aria-label={`Complete ${task.title}`} aria-pressed={completed.includes(task.key)} onClick={() => { feedback('selection'); toggle(task.key) }}>
          {completed.includes(task.key) && <X size={14} />}
        </motion.button>
        <p>{task.detail}</p>
      </motion.article>)}
    </div>
    <Dialog open={!!opened} onOpenChange={open => { if (!open) setOpened(null) }}>
      {opened && <DialogContent className="gap-4 p-6">
        <DialogTitle>{opened.title}</DialogTitle>
        <DialogDescription className="text-sm leading-6">{opened.detail}</DialogDescription>
        <ScanButton onClick={() => { toggle(opened.key); setOpened(null) }}>
          {completed.includes(opened.key) ? 'Mark incomplete' : 'Mark complete'}
        </ScanButton>
      </DialogContent>}
    </Dialog>
  </>
}

export function EvidenceCards() {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  return <motion.div className={styles.evidenceCards} variants={scanSequence}>
    {expertQuotes.map(post => <motion.a key={post.handle} href={post.url} target="_blank" rel="noreferrer"
      variants={scanPart} whileTap={reduced ? undefined : { scale: .975 }} onClick={() => feedback()}>
      <div className={styles.evidenceAuthor}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.image} alt="" loading="lazy" />
        <div><strong>{post.name}</strong><small>{post.handle}</small></div>
        <span aria-hidden="true">𝕏</span>
      </div>
      <p>{post.quote}</p>
      <small>{post.source}</small>
      <div className={styles.evidenceFooter}><MessageCircle size={15} aria-hidden="true" /><Heart size={15} aria-hidden="true" />
        <small>{post.date}</small><ArrowUpRight size={14} aria-hidden="true" /></div>
    </motion.a>)}
    <motion.p variants={scanPart}>Independent source excerpts. No affiliation or endorsement.</motion.p>
  </motion.div>
}

const hearts = Array.from({ length: 14 }, (_, index) => ({
  delay: index * .055,
  drift: [-118, 22, -56, 32, -150, 8, -88][index % 7],
  lift: 340 + (index % 4) * 27,
  size: 19 + (index % 4) * 5,
  rotation: (index % 2 ? 1 : -1) * (14 + index * 3),
  symbol: ['❤️', '💗', '💕'][index % 3],
}))

export function DatingProfileLikes() {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const [replay, setReplay] = useState(0)
  return <div className={styles.profileStage}>
    <div className={styles.profileCard} aria-label="Example dating profile photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/scan/dating-profile.jpg" alt="" />
      <div className={styles.profileSegments} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.profileCaption}><strong>Your next chapter.</strong><small>A first impression that feels like you.</small></div>
    </div>
    <div key={replay} aria-hidden="true">
      {!reduced && hearts.map((heart, index) => <motion.span key={index} className={styles.profileParticle}
        style={{ fontSize: heart.size }}
        animate={{ opacity: [0, 1, 1, 0, 0], x: [0, heart.drift * .35 + 12, heart.drift, heart.drift, heart.drift],
          y: [0, -heart.lift * .34, 155 - heart.lift, 155 - heart.lift, 155 - heart.lift],
          rotate: [0, heart.rotation / 2, heart.rotation, heart.rotation, heart.rotation], scale: [.45, 1, 1.05, 1.05, 1.05] }}
        transition={{ duration: 2.5, times: [0, .13, .52, .64, 1], delay: heart.delay, repeat: Infinity, ease: 'linear' }}>{heart.symbol}</motion.span>)}
      <motion.div className={styles.profileMatch} initial={false}
        animate={reduced ? undefined : { opacity: [0, 1, 1, 0, 0], y: [-18, 0, 0, -9, -9], scale: [.96, 1, 1, 1, 1] }}
        transition={{ duration: 2.5, times: [0, .088, .7, .86, 1], repeat: Infinity }}>
        <span><Heart size={15} fill="currentColor" /></span>You got a new match
      </motion.div>
    </div>
    <motion.button className={styles.profileLike} type="button" aria-label="Animate profile likes"
      whileTap={reduced ? undefined : { scale: .92 }} onClick={() => { feedback('selection'); setReplay(value => value + 1) }}>
      <span><Heart size={25} fill="currentColor" /></span>
    </motion.button>
  </div>
}
