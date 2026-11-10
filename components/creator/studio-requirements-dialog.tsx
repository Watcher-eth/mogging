import { CAMPAIGN_PUBLISHING_DEADLINE } from '@/lib/creator/campaign-publishing-policy'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Heart, Link2, MessageCircle, Music2, Share2, Upload } from '@/components/ui/mogging-glyphs'
import { apiPost } from '@/lib/api/client'
import { motionEase } from '@/lib/creator/motion-presets'
import { TIKTOK_ANCHOR_URL as TIKTOK_ANCHOR_INVITE } from '@/lib/creator/facial-campaign-update'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import styles from './studio-requirements.module.css'

const requirements = [
  { title: 'Submit immediately after posting', description: 'Submit your published post link right away so we can start tracking its data. Upload fresh analytics at each campaign milestone.' },
  { title: 'Keep your Mogging link in bio', description: 'Posting accounts with 1,000 or more followers must have a Mogging link in their bio. Accounts below 1,000 followers are exempt from the bio-link requirement only.' },
  { title: 'Add the Mogging anchor', description: 'Every campaign requires publishing with the Mogging TikTok anchor through the campaign link below.' },
] as const

export function StudioRequirementsReminder() {
  const [open, setOpen] = useState(false)
  const request = useRef<Promise<{ show: boolean }> | null>(null)
  useEffect(() => {
    let active = true
    request.current ??= apiPost<{ show: boolean }>('/api/creator/studio/requirements').catch(() => ({ show: true }))
    void request.current.then(result => { if (active) setOpen(result.show) })
    return () => { active = false }
  }, [])
  return <StudioRequirementsDialog open={open} onOpenChange={setOpen} />
}

export function StudioRequirementsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const requirement = requirements[step]
  useEffect(() => { if (open) setStep(0) }, [open])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent ref={contentRef} onOpenAutoFocus={event => { event.preventDefault(); contentRef.current?.focus() }} className="creator-dialog max-h-[calc(100dvh-32px)] max-w-[480px] gap-2 overflow-y-auto border-zinc-100 bg-white p-0">
      <div className="px-6 pt-6 sm:px-8 sm:pt-7">
        <p className="pr-8 text-[15px] font-semibold text-zinc-500">MGC requirements · {step + 1} of 3</p>
        <nav aria-label="MGC requirements" className="mt-5 flex gap-1.5 pr-6">
          {requirements.map((item, index) => <button key={item.title} type="button" aria-label={`Step ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} className="group flex min-h-8 flex-1 items-center">
            <span className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-100">
              {index <= step ? <motion.span initial={false} animate={{ opacity: index === step ? 1 : 0.4 }} transition={{ duration: reduced ? 0 : 0.2 }} className="absolute inset-0 rounded-full bg-[#00A8EF]" /> : null}
            </span>
          </button>)}
        </nav>
      </div>
      <AnimatedDialogPanel contentKey={step} motionStyle="swish" contentClassName="px-6 pb-2 sm:px-8">
        <RequirementGraphic key={step} step={step} />
        <DialogTitle className="creator-dialog-title mt-5 text-[26px] font-semibold leading-tight tracking-[-0.04em]">{requirement.title}</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-zinc-500">{requirement.description}</DialogDescription>
        {step > 0 ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Grace period through {CAMPAIGN_PUBLISHING_DEADLINE}. Missing links will not reduce or deny an otherwise eligible payout on videos posted or submitted before this deadline.</p> : null}
        {step === 1 ? <p className="mt-3 text-xs leading-5 text-zinc-600">Implement these publishing rules by the grace-period deadline. Other campaign rules and analytics requirements still apply.</p> : null}
        {step === 1 ? <Link href="/creator/accounts" onClick={() => onOpenChange(false)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs text-[#00A8EF]"><Link2 className="size-3.5" />Your bio links<ArrowRight className="size-3.5" /></Link> : step === 2 ? <a href={TIKTOK_ANCHOR_INVITE} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs text-[#00A8EF]">Get the Mogging anchor<ArrowRight className="size-3.5" /></a> : null}
      </AnimatedDialogPanel>
      <div className="flex items-center justify-between px-6 pb-4 sm:px-8">
        <button type="button" onClick={() => step ? setStep(step - 1) : onOpenChange(false)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">{step ? <ArrowLeft className="size-4" /> : null}{step ? 'Back' : 'Close'}</button>
        <Button className="rounded-full px-5" onClick={() => step === 2 ? onOpenChange(false) : setStep(step + 1)}>{step === 2 ? <>Got it<Check className="size-4" /></> : <>Next<ArrowRight className="size-4" /></>}</Button>
      </div>
    </DialogContent>
  </Dialog>
}

function RequirementGraphic({ step }: { step: number }) {
  const reduced = useReducedMotion()
  return <div aria-hidden="true" className={styles.graphic}>
    {step === 0 ? <UploadGraphic reduced={Boolean(reduced)} /> : step === 1 ? <BioGraphic /> : <AnchorGraphic reduced={Boolean(reduced)} />}
  </div>
}

function TikTokLabel() {
  return <span className={styles.brand}><Music2 size={15} fill="currentColor" strokeWidth={1.5} />TikTok</span>
}

function UploadGraphic({ reduced }: { reduced: boolean }) {
  return <>
    <motion.div className={styles.upload} initial={false} animate={reduced ? { opacity: 0 } : { opacity: [1, 1, 0, 0], transform: ['translateY(0)', 'translateY(0)', 'translateY(-8px)', 'translateY(-8px)'] }} transition={{ duration: 2, times: [0, .73, .88, 1], ease: motionEase }}>
      <div className={styles.uploadHeader}><TikTokLabel /><span>New post</span></div>
      <div className={styles.uploadBody}>
        <div className={styles.video}><Image src="/model2.png" alt="" fill sizes="76px" className="object-cover object-top" /><div className={styles.videoShade} /><span className={styles.videoTitle}>Your face analysis</span><span className={styles.videoActions}><Heart size={10} fill="white" /><MessageCircle size={10} /><Share2 size={10} /></span></div>
        <div className={styles.uploadDetails}><p>Posting your video</p><span>Keep this page open</span><div className={styles.track}><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1.1, ease: motionEase }} /></div><motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 1.05 }} className={styles.published}><Check size={12} />Published</motion.span></div>
      </div>
    </motion.div>
    <motion.div className={styles.submission} initial={reduced ? false : { opacity: 0, transform: 'translateY(10px)' }} animate={{ opacity: 1, transform: 'translateY(0)' }} transition={{ duration: reduced ? 0 : .35, delay: reduced ? 0 : 1.8, ease: motionEase }}>
      <span className={styles.formEyebrow}>Mogging Creator Studio</span><p>Submit your post</p><span className={styles.fieldLabel}>Published post link</span>
      <div className={styles.urlField}><Link2 size={14} /><span className={styles.typedUrl}>tiktok.com/@you/video/123456789</span></div>
      <div className={styles.submitButton}><Upload size={13} />Submit post<motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 3.6 }}><Check size={13} /></motion.span></div>
      <motion.span className={styles.tracking} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 3.6 }}>Submitted. Tracking starts now.</motion.span>
    </motion.div>
  </>
}

function BioGraphic() {
  return <div className={styles.profile}>
    <div className={styles.profileHeader}><span>your.name</span><TikTokLabel /></div>
    <div className={styles.identity}><Image src="/model2.png" alt="" width={48} height={48} className={styles.avatar} /><div><strong>Your name</strong><span>@your.name</span></div></div>
    <div className={styles.stats}><span><strong>128</strong> Following</span><span><strong>12.4K</strong> Followers</span><span><strong>86.2K</strong> Likes</span></div>
    <div className={styles.profileActions}><span>Follow</span><span>Message</span></div>
    <p className={styles.bio}>A better routine. A more confident you.<br />Get your face analysis ↓</p>
    <div className={styles.bioLink}><Link2 size={12} /><span>mogging.com/r/yourname</span></div>
  </div>
}

function AnchorGraphic({ reduced }: { reduced: boolean }) {
  const particles = [[-88, -47], [-55, -77], [12, -81], [76, -60], [97, -12], [79, 48], [35, 72], [-26, 76], [-78, 45], [-104, 8], [-30, -45], [49, 21]]
  return <div className={styles.anchorScene}>
    <div className={styles.anchorBrand}><TikTokLabel /><span>App anchor</span></div>
    <div className={styles.anchorMark}>
      {!reduced ? particles.map(([horizontal, vertical], index) => <motion.span key={index} className={styles.particle} initial={{ x: horizontal, y: vertical, opacity: 0 }} animate={{ x: [horizontal, horizontal * .55, 0], y: [vertical, vertical * .55, 0], opacity: [0, .45, 0] }} transition={{ duration: 1.2, delay: index * .035, ease: motionEase }} />) : null}
      <svg width="82" height="82" viewBox="0 0 80 80" fill="none">
        <motion.circle cx="40" cy="17" r="6" stroke="currentColor" strokeWidth="3" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reduced ? 0 : .45, delay: reduced ? 0 : .35 }} />
        <motion.path d="M40 24V62M29 34H51M16 46C16 61 26 68 40 68C54 68 64 61 64 46M10 51L16 45L23 51M57 51L64 45L70 51" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .5, ease: motionEase }} />
      </svg>
    </div>
    <motion.div className={styles.anchorTag} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .4, delay: reduced ? 0 : 1.1 }}><Link2 size={13} /><strong>Mogging</strong><span>Get your face analysis</span></motion.div>
  </div>
}
