import { useScanFeedback } from '@/hooks/use-scan-feedback'
import { useWebStep } from '@/hooks/use-web-step'
import { trackWebEvent } from '@/lib/analytics/client'
import { DatingProfileLikes, EvidenceCards, ProtocolStoryPreview } from './mobile-scan-stories'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Activity, ArrowUpRight, Camera, Check, Clock3, Droplet, Dumbbell, Eye, FlaskConical, Focus, Heart, ListChecks, MessageCircle, Repeat2, ScanFace, Sparkles, Syringe, Users, Utensils, TriangleAlert } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { MobileScanStory, ScanButton, scanPart, scanSequence } from './mobile-scan-pwa'
import { getOnboardingProfileSteps, motivations, obstacles, onboardingChoices, relevanceCopy, storyHeadings, type OnboardingProfileStepId } from '@/lib/client/scan-onboarding'
import styles from './mobile-scan-pwa.module.css'

const inputs = ['goals', 'experience', 'methods', 'age', 'gender', 'time']
const ages = Array.from({ length: 88 }, (_, index) => ({ id: String(index + 13), label: String(index + 13) }))
const optionsByStep = {
  motivation: motivations, obstacle: obstacles, goals: onboardingChoices.goals,
  experience: onboardingChoices.experience, methods: onboardingChoices.methods,
  age: ages, gender: onboardingChoices.gender, time: onboardingChoices.commitment.map(item => item.id === 'flexible' ? { ...item, label: 'Keep it flexible' } : item),
} satisfies Partial<Record<OnboardingProfileStepId, ReadonlyArray<{ id: string; label: string }>>>

const choiceIcons: Partial<Record<OnboardingProfileStepId, Record<string, typeof Sparkles>>> = {
  motivation: { confidence: Sparkles, dating: Heart, direction: Focus, routine: ListChecks, photos: Camera, social: Users },
  obstacle: { starting: Focus, advice: MessageCircle, consistency: Repeat2, progress: Activity, time: Clock3 },
  goals: { jaw: ScanFace, 'skin-age': Droplet, symmetry: Focus, eyes: Eye, 'facial-fat': Activity, hair: Sparkles,
    eyebrows: Eye, nose: Focus, lips: Heart, cheekbones: ScanFace, overall: ArrowUpRight },
  methods: { exercise: Dumbbell, mewing: ScanFace, 'skin-care': Droplet, injectables: Syringe, surgery: Activity,
    'bone-smashing': TriangleAlert, diets: Utensils, peptides: FlaskConical, other: Sparkles },
}

export function MobileScanOnboarding({ onComplete, analyticsEnabled = false }: {
  analyticsEnabled?: boolean
  onComplete: (gender: 'male' | 'female' | 'other') => void
}) {
  const reduced = useReducedMotion()
  const feedback = useScanFeedback()
  const lastAdvancedStep = useRef<OnboardingProfileStepId | null>(null)
  const [comparison, setComparison] = useState(50)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Partial<Record<OnboardingProfileStepId, string[]>>>({})
  const steps = getOnboardingProfileSteps(answers.experience?.[0])
  const step = steps[index] ?? 'commit'
  const heading: { eyebrow?: string; title: string; body: string } | undefined = step === 'relevance' ? relevanceCopy[answers.motivation?.[0] ?? 'confidence']
    : step === 'dating' ? { title: 'Dating starts\nwith a first look.', body: 'More couples meet online. Your photos are your first introduction.' }
    : storyHeadings[step]
  const selected = answers[step] ?? []
  const options = optionsByStep[step as keyof typeof optionsByStep]
  const wheel = step === 'age' || step === 'experience' || step === 'gender' || step === 'time'
  const multiple = step === 'goals' || step === 'methods'
  const inputSteps = steps.filter(id => inputs.includes(id))
  const progress = inputSteps.indexOf(step)
  const required = step === 'motivation' || step === 'obstacle' || step === 'goals'
  const fallback = step === 'age' ? '18' : step === 'gender' ? 'male' : options?.[0]?.id
  const dark = step === 'commit'
  const completeStep = useWebStep(`profile.${step}`, analyticsEnabled)

  function choose(id: string) {
    if (analyticsEnabled) trackWebEvent('onboarding_interaction', { surface: 'web_analysis', step: `profile.${step}`, action: 'selection_changed' })
    setAnswers(current => ({ ...current, [step]: multiple
      ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]
      : [id] }))
  }

  function next() {
    if (lastAdvancedStep.current === step) return
    lastAdvancedStep.current = step
    completeStep()
    if (step === 'commit') {
      const gender = answers.gender?.[0] ?? 'male'
      onComplete(gender === 'male' || gender === 'female' ? gender : 'other')
      return
    }
    if (wheel && !selected.length && fallback) choose(fallback)
    setIndex(index + 1)
  }

  return <AnimatePresence mode="wait" propagate>
    <motion.div key={step} variants={scanSequence} initial="enter" animate="visible" exit="leave">
      {step === 'impressions' ? <MobileScanStory onContinue={next} />
        : step === 'transformation' ? <div className={styles.transformation}>
          <motion.div className={styles.comparison} variants={scanPart} custom={0}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scan/model2.jpg" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scan/male-before.jpg" alt="" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }} />
            <div className={styles.comparisonDivider} style={{ left: `${comparison}%` }} aria-hidden="true"><span>‹ ›</span></div>
            <input type="range" min="0" max="100" aria-label="Compare before and after" value={comparison} onChange={event => setComparison(Number(event.target.value))} />
          </motion.div>
          <motion.header variants={scanPart}>
            <TurningCalendar />
            <h1>{heading?.title}</h1><p>{heading?.body}</p>
          </motion.header>
          <motion.div className={styles.onboardingDock} variants={scanPart} custom={20}><ScanButton onClick={next}><ScanFace size={19} /> Find my starting point</ScanButton></motion.div>
        </div>
        : <div className={styles.onboarding} data-dark={dark || undefined}>
          {progress >= 0 && <motion.div className={styles.onboardingTop} variants={scanPart}>
            <div role="progressbar" aria-label="Personalization" aria-valuenow={progress + 1} aria-valuemax={inputSteps.length}>
              <motion.span initial={{ width: `${progress / inputSteps.length * 100}%` }} animate={{ width: `${(progress + 1) / inputSteps.length * 100}%` }} />
            </div>
            <span>{String(progress + 1).padStart(2, '0')} / {inputSteps.length}</span>
          </motion.div>}
          <motion.header variants={scanPart} data-centered={step === 'dating' || undefined}>
            {heading?.eyebrow && <small>{heading.eyebrow}</small>}
            <h1>{heading?.title}</h1>
            {heading?.body && <p>{heading.body}</p>}
          </motion.header>
          <motion.div className={styles.onboardingBody} variants={scanSequence}>
          {wheel && options ? <motion.div variants={scanPart}>
            <ScanWheel options={options} value={selected[0] ?? fallback} label={heading?.title ?? 'Select an option'}
              age={step === 'age'} onChange={choose} />
          </motion.div> : options ? <motion.div className="onboarding-choice-grid" data-mobile="" variants={scanSequence} role="group" aria-label={heading?.title?.replace('\n', ' ')}>
            {options.map(option => {
              const Icon = choiceIcons[step]?.[option.id]
              return <motion.button key={option.id} type="button" variants={scanPart} aria-pressed={selected.includes(option.id)}
              whileTap={reduced ? undefined : { scale: .97 }} onClick={() => { feedback('selection'); choose(option.id) }}>
              {Icon && <Icon size={20} strokeWidth={1.65} aria-hidden="true" />}
              <span>{option.label}</span>
            </motion.button>
            })}
          </motion.div> : <motion.div variants={scanPart}><StoryArtwork step={step} motivation={answers.motivation?.[0]} goals={answers.goals} commitment={answers.time?.[0]} /></motion.div>}
          </motion.div>
          <motion.div className={styles.onboardingDock} variants={scanPart} custom={20}>
            <ScanButton disabled={required && !selected.length} onClick={next}>
              {dark ? 'I’m ready to invest in myself' : step === 'mechanism' ? 'Personalize my plan' : 'Continue'}
            </ScanButton>
            {step === 'methods' && <button type="button" className={styles.returning} onClick={() => { feedback(); next() }}>Skip this question</button>}
          </motion.div>
        </div>}
    </motion.div>
  </AnimatePresence>
}

function TurningCalendar() {
  const [pages] = useState(() => {
    const today = new Date()
    return [0, 1, 2].map(offset => {
      const date = new Date(today)
      date.setDate(today.getDate() - offset)
      return { day: date.getDate(), month: date.toLocaleDateString('en', { month: 'short' }).toUpperCase() }
    })
  })

  return <div className={styles.turningCalendar} role="img" aria-label="One day at a time">
    {pages.map(({ day, month }, index) => (
      <div key={index} className={styles.calendarPage} data-leaf={index || undefined} aria-hidden="true">
        <span><small>{month}</small><b>{day}</b></span>
      </div>
    ))}
  </div>
}

const wheelRow = 84

function ScanWheel({ options, value, label, age, onChange }: {
  options: ReadonlyArray<{ id: string; label: string }>
  value?: string
  label: string
  age: boolean
  onChange: (id: string) => void
}) {
  const reduced = useReducedMotion()
  const list = useRef<HTMLDivElement>(null)
  const index = Math.max(0, options.findIndex(option => option.id === value))
  const [position, setPosition] = useState(index)
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = index * wheelRow
  // Each wheel mounts at its previously selected value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollTo(row: number) {
    list.current?.scrollTo({ top: Math.max(0, Math.min(options.length - 1, row)) * wheelRow,
      behavior: reduced ? 'instant' : 'smooth' })
  }

  return <div className={styles.onboardingWheel} data-age={age || undefined}>
    {age && <span>Years old</span>}
    <div className={styles.wheelFrame}>
      <div ref={list} className={styles.wheelList} role="listbox" aria-label={label} tabIndex={0}
        aria-activedescendant={`scan-wheel-${index}`}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          scrollTo(index + (event.key === 'ArrowDown' ? 1 : -1))
        }}
        onScroll={event => {
          const next = event.currentTarget.scrollTop / wheelRow
          setPosition(next)
          const option = options[Math.round(next)]
          if (option && option.id !== value) onChange(option.id)
        }}>
        {options.map((option, row) => {
          const distance = Math.min(1, Math.abs(position - row))
          return <div role="option" id={`scan-wheel-${row}`} aria-selected={row === index} key={option.id}
            onClick={() => scrollTo(row)} style={{ opacity: 1 - distance * .82, scale: reduced ? 1 : 1 - distance * .14 }}>
            {option.label}
          </div>
        })}
      </div>
    </div>
  </div>
}

function StoryArtwork({ step, motivation, goals, commitment }: {
  step: OnboardingProfileStepId; motivation?: string; goals?: string[]; commitment?: string
}) {
  const [tasks, setTasks] = useState<number[]>([])
  const feedback = useScanFeedback()
  const reduced = useReducedMotion()
  if (step === 'dating') {
    return <div className={styles.datingStory}>
      <p>Couples who met online</p>
      <div className={styles.datingBars}>
        {[[2009, 22], [2017, 39], [2025, 45]].map(([year, value], index) => <div key={year}>
          <strong>{value}%</strong>
          <motion.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: .55, delay: index * .09 }} style={{ height: `${value * 3}px` }} />
          <small>{year}</small>
        </div>)}
      </div>
      <p>Put your best face forward.</p>
      <small>U.S. different-sex couples · Rosenfeld et al., 2019</small>
    </div>
  }
  if (step === 'relevance') return <motion.div className={styles.relevance} variants={scanSequence}>
    <motion.div variants={scanPart}><DatingProfileLikes /></motion.div>
    <motion.div variants={scanPart}><small>YOUR REASON TO START</small>
      <p>{motivations.find(option => option.id === motivation)?.label ?? motivations[0].label}</p>
    </motion.div>
  </motion.div>
  if (step === 'agency') return <motion.div className={styles.onboardingFeatures} variants={scanSequence}>
    <motion.small variants={scanPart}>YOUR DAILY BASICS</motion.small>
    {[
      ['Do your skin care', 'Cleanse, moisturize, protect.'],
      ['Refresh your grooming', 'Make time for the details.'],
      ['Keep one daily habit', 'Start small. Make it repeatable.'],
    ].map(([title, detail], index) => <motion.button key={title} type="button" variants={scanPart} aria-pressed={tasks.includes(index)}
      whileTap={reduced ? undefined : { scale: .97 }} onClick={() => { feedback('selection'); setTasks(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index]) }}>
      <span className={styles.storyCheck}>{tasks.includes(index) && <Check size={14} />}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </motion.button>)}
    <motion.div className={styles.agencyTimeline} variants={scanPart}>
      {[['Today', 'Start small'], ['Week 1', 'Build a rhythm'], ['Week 2+', 'Keep going']].map(([when, label]) => <span key={when}><strong>{when}</strong><small>{label}</small></span>)}
    </motion.div>
  </motion.div>
  if (step === 'commit') return <motion.div className={styles.commitment} variants={scanSequence}>
    <motion.div variants={scanPart}><strong>01</strong> <span>of 60 days</span></motion.div>
    <motion.div className={styles.commitTicks} variants={scanPart} aria-hidden="true">
      {Array.from({ length: 60 }, (_, index) => <motion.i key={index} initial={{ opacity: 0 }} animate={{ opacity: index ? .25 : 1 }} transition={{ delay: index * .012 }} />)}
    </motion.div>
    <motion.small variants={scanPart}>BUILT AROUND YOUR GOALS</motion.small>
    <motion.p variants={scanPart}>{onboardingChoices.goals.filter(option => goals?.includes(option.id)).map(option => option.label).join(' · ') || 'Your personal starting point'}</motion.p>
    <motion.small variants={scanPart}>{onboardingChoices.commitment.find(option => option.id === commitment && option.id !== 'flexible')?.label ?? 'A routine that fits your day'}</motion.small>
  </motion.div>
  if (step === 'mechanism') return <ProtocolStoryPreview />
  if (step === 'evidence') return <EvidenceCards />
  return null
}
