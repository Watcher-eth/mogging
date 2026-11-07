import { ArrowLeft, BatteryFull, BookOpen, ChevronLeft, ChevronRight, Clipboard, Ellipsis, PlusSquare, RefreshCw, Search, Signal, SquareStack, Upload, Wifi, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TextMorph } from 'torph/react'
import { ScanButton } from './mobile-scan-pwa'
import styles from './scan-install-guide.module.css'

const instructions = [
  { title: 'Open the page menu', body: 'In Safari, tap the three dots beside the address bar. If Share is already visible, tap it directly.' },
  { title: 'Tap Share', body: 'Choose Share from the page menu to bring up the iOS share sheet.' },
  { title: 'Add to Home Screen', body: 'Scroll through the actions and tap Add to Home Screen.' },
  { title: 'Confirm the installation', body: 'Leave Open as Web App turned on if it appears, then tap Add.' },
  { title: 'Open Mogging', body: 'Tap the new Mogging icon on your Home Screen. If asked, sign in with the account you paid with.' },
]

export function ScanInstallGuide({ onContinue, onOpenApp }: { onContinue: () => void; onOpenApp: () => void }) {
  const [step, setStep] = useState(0)
  const reduce = useReducedMotion()
  const instruction = instructions[step]
  const last = step === instructions.length - 1
  const next = () => last ? onOpenApp() : setStep(current => Math.min(current + 1, instructions.length - 1))

  useEffect(() => {
    if (last) return
    const timer = window.setTimeout(() => {
      setStep(current => current === step ? current + 1 : current)
    }, 4500)
    return () => window.clearTimeout(timer)
  }, [last, step])
  const surfaceMotion = {
    initial: reduce ? false as const : { opacity: 0, y: 24, scale: .985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: reduce ? 0 : 14 },
    transition: { duration: reduce ? 0 : .36, ease: [.22, 1, .36, 1] as const },
  }

  return <section className={styles.screen} aria-labelledby="install-title">
    <div className={styles.top}>
      {step > 0 && <button className={styles.back} type="button" aria-label="Previous installation step" onClick={() => setStep(step - 1)}><ArrowLeft size={18} /></button>}
      <button type="button" onClick={onContinue}>View my evaluation</button>
    </div>
    <header>
      <p>Your evaluation is ready</p>
      <h1 id="install-title">Add Mogging to your Home Screen.</h1>
    </header>

    <div className={styles.device} aria-label="Interactive iPhone Safari preview" role="group">
      <div className={styles.status} aria-hidden="true"><b>9:41</b><span><Signal /><Wifi /><BatteryFull /></span></div>
      <div className={styles.island} aria-hidden="true" />
      <div className={styles.website} aria-hidden="true">
        <b>Mogging</b>
        <div className={styles.websitePortrait} />
        <strong>Your evaluation</strong>
        <span>Ready to view</span>
      </div>
      <div className={styles.toolbar}>
        <span aria-hidden="true"><ChevronLeft /></span>
        <div><Search aria-hidden="true" /> mogging.com <RefreshCw aria-hidden="true" /></div>
        <button type="button" aria-label="Open simulated Safari page menu" disabled={step !== 0} data-highlight={step === 0 || undefined} onClick={next}><Ellipsis /></button>
      </div>

      <AnimatePresence initial={false}>
        {step === 1 && <motion.div key="menu" className={styles.menu} {...surfaceMotion}>
          <div aria-hidden="true"><BookOpen /> Bookmarks</div>
          <div aria-hidden="true"><SquareStack /> All Tabs</div>
          <button type="button" data-highlight onClick={next}><Upload /> Share</button>
        </motion.div>}
        {step === 2 && <motion.div key="share" className={styles.sheet} {...surfaceMotion}>
          <div className={styles.handle} aria-hidden="true" />
          <div className={styles.shareHeader}><span className={styles.appIcon} /><div><b>Mogging</b><small>mogging.com</small></div><X aria-hidden="true" /></div>
          <div className={styles.shareApps} aria-hidden="true"><span>AirDrop</span><span>Messages</span><span>Mail</span></div>
          <div className={styles.actions}>
            <div aria-hidden="true"><Clipboard /> Copy</div>
            <button type="button" data-highlight onClick={next}><PlusSquare /> Add to Home Screen</button>
          </div>
        </motion.div>}
        {step === 3 && <motion.div key="install" className={styles.install} {...surfaceMotion}>
          <div className={styles.installHeader}><span aria-hidden="true">Cancel</span><b>Add to Home Screen</b><button type="button" data-highlight onClick={next}>Add</button></div>
          <div className={styles.installName}><span className={styles.appIcon} /><div><b>Mogging</b><small>mogging.com</small></div></div>
          <div className={styles.installToggle}>Open as Web App <span className={styles.toggle} aria-hidden="true" /></div>
        </motion.div>}
        {last && <motion.div key="home" className={styles.home} {...surfaceMotion}>
          <div className={styles.homeIcons} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>
          <button type="button" onClick={onOpenApp} aria-label="Open Mogging in this browser"><span className={styles.appIcon} data-highlight /><span>Mogging</span></button>
          <div className={styles.homeDock} aria-hidden="true"><span /><span /><span /><span /></div>
        </motion.div>}
      </AnimatePresence>
      <div className={styles.homeIndicator} aria-hidden="true" />
    </div>

    <div className={styles.instruction} aria-live="polite" aria-atomic="true">
      <small><TextMorph>{`Safari guide · ${step + 1} of ${instructions.length}`}</TextMorph></small>
      <h2>{reduce ? instruction.title : <TextMorph>{instruction.title}</TextMorph>}</h2>
      <div className={styles.copy}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={step} initial={reduce ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -5 }} transition={{ duration: reduce ? 0 : .24 }}>
            {instruction.body}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
    <footer>
      <ScanButton onClick={next}>
        {reduce ? (last ? 'Open Mogging in this browser' : 'Next step') : <TextMorph>{last ? 'Open Mogging in this browser' : 'Next step'}</TextMorph>}
        <ChevronRight size={17} />
      </ScanButton>
    </footer>
  </section>
}
