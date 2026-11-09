import { AnimatedGroup } from '@/components/core/animated-group'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, Info, X } from 'lucide-react'
import { creatorContentStyles, type CreatorContentStyleId } from '@/lib/creator/creator-catalog'
import { ExampleCarousel } from './campaign-examples'
import styles from './content-style-picker.module.css'

const motionQuery = '(prefers-reduced-motion: reduce)'
const reducedMotionSnapshot = () => window.matchMedia(motionQuery).matches
const serverMotionSnapshot = () => false
function subscribeToMotion(change: () => void) {
  const query=window.matchMedia(motionQuery);query.addEventListener('change',change)
  return () => query.removeEventListener('change',change)
}
const ease = [0.22, 1, 0.36, 1] as const
const exampleLabels = {
  'mogging-editorial': ['Feature breakdown · lighting and measurements', 'App walkthrough · scores and report detail'],
  qoves: ['A controlled comparison · V', 'A hidden-expression reveal · Tom Holland'],
  cephra: ['A sculptural change · continuous anatomy'],
  fern: ['Evidence reel · Clavicular', '3D anatomy and landmark tracing · V'],
}
const asset = (id: CreatorContentStyleId, index: number, extension: string) => `/creator/content-styles/${id}-${index}.${extension}`

export function ContentStylePicker({ value, disabled, onChange, previewId, onPreviewChange: setPreviewId }: { value: CreatorContentStyleId|undefined; disabled: boolean; onChange: (id: CreatorContentStyleId) => void; previewId: CreatorContentStyleId|null; onPreviewChange: (id:CreatorContentStyleId|null)=>void }) {
  const reduced=useSyncExternalStore(subscribeToMotion,reducedMotionSnapshot,serverMotionSnapshot)
  const viewport=useRef<HTMLDivElement>(null)
  const [active,setActive]=useState(0)
  function updateActive(){
    const element=viewport.current;if(!element)return
    const center=element.getBoundingClientRect().left+element.clientWidth/2
    const cards=Array.from(element.querySelectorAll<HTMLElement>('[data-style]'))
    const distances=cards.map(card=>Math.abs(card.getBoundingClientRect().left+card.offsetWidth/2-center))
    setActive(distances.indexOf(Math.min(...distances)))
  }
  function show(index:number){
    const element=viewport.current,card=element?.querySelectorAll<HTMLElement>('[data-style]')[index]
    if(!element || !card)return
    element.scrollTo({left:element.scrollLeft+card.getBoundingClientRect().left-element.getBoundingClientRect().left-(element.clientWidth-card.offsetWidth)/2,behavior:reduced?'instant':'smooth'})
  }
  useEffect(()=>{
    const mobile=window.matchMedia('(max-width:640px)').matches
    if(!mobile || reduced)return
    const videos=viewport.current?.querySelectorAll('video')
    videos?.forEach((video,index)=>{if(index===active)void video.play().catch(()=>{});else video.pause()})
    return()=>videos?.forEach(video=>video.pause())
  },[active,reduced])
  const trigger = useRef<HTMLButtonElement | null>(null)
  const preview = creatorContentStyles.find(style => style.id === previewId)
  const transition = { duration: reduced ? 0 : .32, ease }
  return <div className={styles.picker}>
    <div ref={viewport} className={styles.viewport} onScroll={updateActive} role="region" aria-roledescription="carousel" aria-label="Content style"><AnimatedGroup className={styles.cards} preset="swing">
      {creatorContentStyles.map((style,index) => <div key={style.id} className={styles.card} data-selected={style.id === value} data-style={style.id} data-active={index===active}>
        <button type="button" disabled={disabled} className={styles.choice} aria-pressed={style.id === value} onClick={() => onChange(style.id)}
          onMouseEnter={event => { if (!reduced) void event.currentTarget.querySelector('video')?.play().catch(() => {}) }}
          onMouseLeave={event => event.currentTarget.querySelector('video')?.pause()}>
          <span className={styles.image}><video muted playsInline loop preload="none" poster={asset(style.id,style.id==='mogging-editorial'?2:1,'jpg')} src={asset(style.id,style.id==='mogging-editorial'?2:1,'mp4')} aria-hidden="true" /><span className={styles.selected}><Check size={12} /></span></span>
          <span className={styles.label}>{style.name}</span><span className={styles.detail}>{style.description}</span>
        </button>
        <button type="button" className={styles.info} aria-label={`Preview ${style.name} examples`} onClick={event => { trigger.current = event.currentTarget; setPreviewId(style.id) }}><Info size={17} strokeWidth={1.6} /></button>
      </div>)}
    </AnimatedGroup></div>
    <div className={styles.carouselControls}>
      <button type="button" aria-label="Previous content style" disabled={active===0} onClick={()=>show(active-1)}><ChevronLeft size={18}/></button>
      <div className={styles.dots}>{creatorContentStyles.map((style,index)=><button type="button" key={style.id} aria-label={`Show ${style.name}`} aria-current={index===active?'true':undefined} onClick={()=>show(index)}><span/></button>)}</div>
      <button type="button" aria-label="Next content style" disabled={active===creatorContentStyles.length-1} onClick={()=>show(active+1)}><ChevronRight size={18}/></button>
    </div>
    <DialogPrimitive.Root open={previewId !== null} onOpenChange={open => { if (!open) setPreviewId(null) }}>
      <AnimatePresence>
        {preview ? <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount><motion.div className={styles.backdrop} initial={{opacity:0,backdropFilter:'blur(0px)'}} animate={{opacity:1,backdropFilter:'blur(7px)'}} exit={{opacity:0,backdropFilter:'blur(0px)'}} transition={transition} /></DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
            <motion.div className={styles.previewDialog} initial={reduced ? false : {opacity:0,transform:'translate3d(-50%,calc(-50% + 18px),0) scale(.97)',filter:'blur(7px)'}} animate={{opacity:1,transform:'translate3d(-50%,-50%,0) scale(1)',filter:'blur(0px)'}} exit={{opacity:0,transform:'translate3d(-50%,calc(-50% + 8px),0) scale(.98)',filter:'blur(4px)'}} transition={{...transition,delay:reduced?0:.05}}>
              <DialogPrimitive.Title className={styles.dialogTitle}>{preview.name}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={styles.dialogDescription}>{preview.description}</DialogPrimitive.Description>
              <DialogPrimitive.Close className={styles.close} aria-label="Close examples"><X size={19} /></DialogPrimitive.Close>
              <ExampleCarousel caption="example" key={preview.id} className={styles.previewCarousel} campaign={{name:preview.name,description:preview.description,examples:exampleLabels[preview.id].map((label,index)=>({label,url:asset(preview.id,index+1,'mp4'),poster:asset(preview.id,index+1,'jpg')}))}} />
              <button type="button" className={styles.use} disabled={disabled} onClick={() => { onChange(preview.id); setPreviewId(null) }}>Use {preview.name}</button>
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal> : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  </div>
}
