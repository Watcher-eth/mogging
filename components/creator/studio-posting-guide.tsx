import { Anchor, ArrowUpRight, Link2, Send } from 'lucide-react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { TIKTOK_ANCHOR_INVITE } from '@/lib/creator/tiktok-anchor'
import { motionEase, motionTiming } from '@/lib/creator/motion-presets'
import { TextEffect } from './motion-primitives'
import styles from './studio-posting-guide.module.css'

const wordDuration=.24
const wordTime=(text:string)=>text.trim().split(/\s+/).length*motionTiming.stagger
const steps=[
  {icon:Link2,title:'Post with your link in bio',detail:'Tag @moggingcom in your caption.'},
  {icon:Send,title:'Submit right away',detail:'Send your post link after publishing so we can track analytics and improve future videos.'},
  {icon:Anchor,title:'Use the Mogging anchor',detail:'Add the app anchor whenever it’s available for your TikTok account.',link:'Get the anchor'},
]
let clock=.12
const sequence=steps.map(step=>{
  const start=clock,titleAt=start+.14,detailAt=titleAt+wordTime(step.title)+.1
  const end=detailAt+wordTime(step.detail)+wordDuration
  clock=end+.42
  return {...step,start,titleAt,detailAt,end}
})

/** One shared schedule drives the icon, rail and individual words in reading order. */
export function StudioPostingGuide(){
  const ref=useRef<HTMLElement>(null),visible=useInView(ref,{once:true,amount:.3}),reduced=useReducedMotion()
  const shown=visible || reduced
  return <section ref={ref} className={styles.guide} aria-label="Before you post">
    <p className={styles.heading}>Before you post</p>
    <ol className={styles.steps}>
      {sequence.map((step,index)=><li key={step.title} className={styles.step}>
        {index<sequence.length-1?<span className={styles.rail} aria-hidden="true"><motion.span initial={{scaleY:0}} animate={{scaleY:shown?1:0}} transition={{duration:reduced?0:step.end-step.start,delay:reduced?0:step.start,ease:'linear'}}/></span>:null}
        <motion.span aria-hidden="true" className={styles.icon} initial={reduced?false:{opacity:0,transform:'translateY(4px) scale(.92)'}} animate={{opacity:shown?1:0,transform:shown?'translateY(0px) scale(1)':'translateY(4px) scale(.92)'}} transition={{duration:reduced?0:.24,delay:reduced?0:step.start,ease:motionEase}}><step.icon size={16} strokeWidth={1.5}/></motion.span>
        <div className={styles.copy}>
          <h3><span className={styles.number} aria-hidden="true">0{index+1}</span><TextEffect preset="group-reveal" delay={step.titleAt} duration={wordDuration} visible={Boolean(shown)}>{step.title}</TextEffect></h3>
          <p><TextEffect preset="group-reveal" delay={step.detailAt} duration={wordDuration} visible={Boolean(shown)}>{step.detail}</TextEffect></p>
          {step.link?<motion.a href={TIKTOK_ANCHOR_INVITE} target="_blank" rel="noreferrer" className={styles.link} initial={reduced?false:{opacity:0,transform:'translateY(3px)'}} animate={{opacity:shown?1:0,transform:shown?'translateY(0px)':'translateY(3px)'}} transition={{duration:reduced?0:.24,delay:reduced?0:step.end,ease:motionEase}}>{step.link}<ArrowUpRight size={12}/></motion.a>:null}
        </div>
      </li>)}
    </ol>
  </section>
}
