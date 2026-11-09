import { CalendarDays, Check, ChevronLeft, CircleUserRound, Globe2, Grid2X2, Heart, Mars, ScanFace, Target, UsersRound, Venus, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { TextMorph } from 'torph/react'
import { PopulationDistribution, ageBands, ethnicityOptions, formatEthnicityLabel, populationRegion, skipEthnicity } from './population-distribution'
import { FocusParticles } from './focus-particles'
import { StudioGuide } from './studio-guide'

export const desktopSetupSteps = ['ethnicity', 'profile', 'age', 'focus', 'recap'] as const
export const desktopCaptureSteps = ['front', 'side', 'review'] as const
export type DesktopSetupStep = typeof desktopSetupSteps[number]
export type DesktopCaptureStep = typeof desktopCaptureSteps[number]
export type AnalysisGender = 'male' | 'female' | 'other'

const profiles = [
  { id: 'male', label: 'Man', icon: Mars },
  { id: 'female', label: 'Woman', icon: Venus },
  { id: 'other', label: 'Other', icon: CircleUserRound },
] as const
const goalColors = {
  blue: '#32ade6', pink: '#ff2d55', teal: '#00a99d', orange: '#ff9500', yellow: '#ffcc00',
} as const

const focuses = [
  { id: 'overall', label: 'Better looks', icon: ScanFace, color: goalColors.blue },
  { id: 'skin', label: 'Clearer skin', symbol: 'drop.fill', color: goalColors.teal },
  { id: 'symmetry', label: 'Better facial harmony', icon: Grid2X2, color: goalColors.pink },
  { id: 'higher-psl', label: 'Higher PSL', symbol: 'trophy', color: goalColors.yellow },
  { id: 'dating-confidence', label: 'More dating confidence', icon: Heart, color: goalColors.pink },
  { id: 'jaw', label: 'Sharper jawline', drawing: 'jaw', color: goalColors.orange },
  { id: 'eyes', label: 'More defined eyes', symbol: 'eye.fill', color: goalColors.blue },
  { id: 'brows', label: 'More defined brows', drawing: 'brows', color: goalColors.teal },
  { id: 'nose', label: 'A more balanced nose', symbol: 'nose.fill', color: goalColors.orange },
  { id: 'mouth', label: 'More defined lips', symbol: 'mouth.fill', color: goalColors.pink },
  { id: 'cheeks', label: 'More defined cheekbones', drawing: 'cheeks', color: goalColors.yellow },
  { id: 'hair', label: 'Healthier-looking hair', symbol: 'scissors', color: goalColors.teal },
] as const

type Goal = typeof focuses[number]
type SavedGoalId = Goal['id'] | 'proportions' | 'face-shape'
export type DesktopAnalysisPreferences = {
  ageBand?: typeof ageBands[number]
  focus?: SavedGoalId
  goals?: SavedGoalId[]
}

export function getDesktopReportFocus(preferences: DesktopAnalysisPreferences) {
  const goal = preferences.goals?.[0] ?? preferences.focus
  return goal === 'higher-psl' || goal === 'dating-confidence' ? 'overall' : goal
}

const facialDrawings = {
  jaw: 'M4.5 7.5v4.3c0 2 1 3.9 2.6 5l3.5 2.5c.8.6 2 .6 2.8 0l3.5-2.5a6.2 6.2 0 0 0 2.6-5V7.5M9 16c.8.7 1.8 1 3 1s2.2-.3 3-1',
  brows: 'M3 10.5c2.2-3.2 5.3-3.4 7.3-1.4m3.4 0c2-2 5.1-1.8 7.3 1.4M4.3 14.2c1.5-1.2 3.2-1.3 4.8-.4m5.8 0c1.6-.9 3.3-.8 4.8.4',
  cheeks: 'M4 7.5v3.8c0 3.4 2 6.8 5 8.5m11-12.3v3.8c0 3.4-2 6.8-5 8.5M5.5 12c1.8-.3 3.4.3 4.4 1.5m4.2 0c1-1.2 2.6-1.8 4.4-1.5',
} as const

function GoalIcon({ goal }: { goal: Goal }) {
  if ('symbol' in goal) return <span aria-hidden="true" className="desktop-goal-symbol"
    style={{ maskImage: `url(/creator-icons/protocol/${goal.symbol}.png)` }} />
  if ('drawing' in goal) return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={facialDrawings[goal.drawing]} /></svg>
  return <goal.icon size={21} strokeWidth={1.65} aria-hidden="true" />
}

const headings = {
  profile: ['What gender are you?', 'Choose the option that best describes you.'],
  age: ['What’s your age range?', 'Add context to your starting point. This is optional.'],
  ethnicity: ['What’s your ethnicity?', 'You can skip this question.'],
  focus: ['What are your goals?', 'Choose everything you’d like to work toward.'],
  recap: ['Invest in yourself.', 'Take the first step toward your goal with a personal face scan.'],
} as const

const ease = [.22, 1, .36, 1] as const
const actionMorphMs = 320
const rowHeight = 62

export function DesktopStep({ step, direction, title, description, children, media, bareMedia, onBack, onContinue, actionIcon: ActionIcon, secondaryAction, continueLabel = 'Continue', disabled = false, busy = false }: {
  step: DesktopSetupStep | DesktopCaptureStep
  direction: 1 | -1
  title: string
  description: string
  children?: ReactNode
  media: ReactNode
  bareMedia?: boolean
  onBack?: () => void
  onContinue: () => void
  continueLabel?: string
  actionIcon?: LucideIcon
  secondaryAction?: ReactNode
  disabled?: boolean
  busy?: boolean
}) {
  const reduce = useReducedMotion()
  const heading = useRef<HTMLHeadingElement>(null)
  const hasMounted = useRef(false)
  const index = [...desktopSetupSteps, ...desktopCaptureSteps].findIndex(item => item === step)
  const total = desktopSetupSteps.length + desktopCaptureSteps.length
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (hasMounted.current) heading.current?.focus({ preventScroll: true })
    hasMounted.current = true
  }, [step])
  return <div className="desktop-onboarding public-gutters" data-onboarding-step={step}>
    <div className="desktop-onboarding-navigation">
      {onBack && <button className="desktop-onboarding-back" type="button" onClick={onBack} disabled={busy}>
        <ChevronLeft size={16} aria-hidden="true" /> Back
      </button>}
    </div>
    <div className="desktop-onboarding-grid">
      <div className="desktop-onboarding-copy">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div key={step} custom={direction}
            variants={{ from: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 20, filter: reduce ? 'none' : 'blur(4px)' }), active: { opacity: 1, x: 0, filter: 'none' }, to: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -14 }) }}
            initial="from" animate="active" exit="to" transition={{ duration: reduce ? 0 : .32, ease }}>
            <h1 ref={heading} tabIndex={-1}>{title}</h1>
            <p>{description}</p>
            {children && <div className="desktop-onboarding-options">{children}</div>}
          </motion.div>
        </AnimatePresence>
        <div className="desktop-onboarding-actions">
          <motion.button type="button" className="assessment-primary desktop-onboarding-continue" onClick={onContinue}
            disabled={disabled || busy} aria-label={continueLabel} whileTap={reduce ? undefined : { scale: .97 }}
            layout="position" layoutId="desktop-onboarding-action" transition={{ layout: { duration: reduce ? 0 : actionMorphMs / 1000, ease } }}>
            {ActionIcon && <ActionIcon size={17} aria-hidden="true" />}
            <TextMorph duration={actionMorphMs} ease="cubic-bezier(.22, 1, .36, 1)">{continueLabel}</TextMorph>
          </motion.button>
          {secondaryAction}
        </div>
      </div>
      <motion.div className={bareMedia ? "desktop-onboarding-media desktop-onboarding-media-bare" : "desktop-onboarding-media assessment-media"} layoutId="analysis-portrait" transition={{ duration: reduce ? 0 : .44, ease }}>
        {media}
      </motion.div>
    </div>
    <div className="desktop-onboarding-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
      {Array.from({ length: total }, (_, item) => <motion.span key={item} data-done={item < index || undefined} data-active={item === index || undefined}
        layout={reduce ? false : 'position'} transition={{ duration: reduce ? 0 : .32, ease }} />)}
    </div>
  </div>
}

export function DesktopSetup({ step, direction, gender, preferences, country, background, onBackground, onGender, onPreferences, onBack, onContinue }: {
  step: DesktopSetupStep
  direction: 1 | -1
  gender: AnalysisGender | null
  preferences: DesktopAnalysisPreferences
  country: string | null
  background: string
  onBackground: (value: string) => void
  onGender: (value: AnalysisGender) => void
  onPreferences: (value: DesktopAnalysisPreferences) => void
  onBack?: () => void
  onContinue: () => void
}) {
  const reduce = useReducedMotion()
  const [title, description] = headings[step]
  const cohort = step === 'recap' ? recapCohort(country, gender, preferences.ageBand) : null
  const savedGoals = preferences.goals ?? (preferences.focus ? [preferences.focus] : [])
  const goals = [...new Set(savedGoals.map(goal => goal === 'proportions' ? 'symmetry' : goal === 'face-shape' ? 'overall' : goal))]
  const selectedGoals = goals.flatMap(id => focuses.find(item => item.id === id) ?? [])
  const activeGoal = selectedGoals.at(-1)
  function toggleGoal(goal: typeof focuses[number]['id']) {
    const next = goals.includes(goal) ? goals.filter(item => item !== goal) : [...goals, goal]
    onPreferences({ ...preferences, goals: next, focus: undefined })
  }
  const media = step === 'profile' || step === 'age' || step === 'ethnicity'
    ? <PopulationDistribution country={country} gender={gender} ageBand={preferences.ageBand} background={background} mode={step} />
    : step === 'focus' ? <>
      <FocusParticles focus={activeGoal?.id} accent={activeGoal?.color} />
      <GoalPills goals={selectedGoals} />
    </>
    : step === 'recap' ? <StudioGuide kind="distance" distanceVariant={gender === 'male' ? 'male' : 'female'} />
    : null
  return <DesktopStep step={step} direction={direction} title={title} description={cohort ? `${cohort.region.scope === 'country' ? `You’re one of about ${cohort.count} ${cohort.group} in your country.` : `Our ${cohort.region.name} reference includes about ${cohort.count} ${cohort.group}.`} ${description}` : description} onBack={onBack} onContinue={onContinue}
    disabled={step === 'profile' && !gender || step === 'focus' && !goals.length}
    continueLabel={step === 'recap' ? 'I’m ready to invest in myself'
      : step === 'focus' ? 'Save' : step === 'ethnicity' && background === skipEthnicity ? 'Skip for now' : 'Continue'}
    actionIcon={step === 'recap' ? Target : undefined} media={media} bareMedia={step !== 'recap'}>
    {step === 'profile' && <div className="desktop-profile-options" role="group" aria-label="Gender">
      {profiles.map(item => <motion.button key={item.id} type="button" aria-pressed={gender === item.id} onClick={() => onGender(item.id)} whileTap={reduce ? undefined : { scale: .98 }}>
        {gender === item.id && <motion.span className="desktop-profile-highlight" layoutId="desktop-profile-selection" transition={{ duration: reduce ? 0 : .24, ease }} />}
        <item.icon size={19} aria-hidden="true" /><span>{item.label}</span>{gender === item.id && <Check size={17} aria-hidden="true" />}
      </motion.button>)}
    </div>}
    {step === 'age' && <SelectionWheel label="Age range" options={ageBands} value={preferences.ageBand ?? ageBands[0]} onChange={ageBand => onPreferences({ ...preferences, ageBand })} />}
    {step === 'ethnicity' && <SelectionWheel key={country} label="Ethnic background" options={ethnicityOptions(country)} value={background} onChange={onBackground} formatValue={formatEthnicityLabel} />}
    {step === 'focus' && <div className="onboarding-choice-grid" role="group" aria-label="Your goals">
      {focuses.map(item => <motion.button key={item.id} type="button" aria-pressed={goals.includes(item.id)}
        style={{ '--goal-color': item.color } as CSSProperties} onClick={() => toggleGoal(item.id)}
        whileTap={reduce ? undefined : { scale: .92 }}
        transition={{ type: 'spring', stiffness: 530, damping: 30, mass: .65 }}>
        <GoalIcon goal={item} /><span>{item.label}</span>
      </motion.button>)}
    </div>}
    {step === 'recap' && <StartingStats goals={selectedGoals.map(goal => goal.label)} age={preferences.ageBand} gender={gender} background={background} country={country} />}
  </DesktopStep>
}

function GoalPills({ goals }: { goals: Goal[] }) {
  const reduce = useReducedMotion()
  return <ul className="desktop-particle-labels" aria-label="Selected goals">
    <AnimatePresence initial={false} mode="popLayout">
      {goals.map(goal => <motion.li key={goal.id} className="desktop-particle-label" layout={reduce ? false : 'position'}
        initial={reduce ? false : { opacity: 0, x: 12, scale: .94 }} animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: .96 }}
        transition={{ duration: reduce ? 0 : .28, ease }}>
        <span className="desktop-particle-label-icon" aria-hidden="true">
          <GoalIcon goal={goal} />
        </span>
        {goal.label}
      </motion.li>)}
    </AnimatePresence>
    {!goals.length && <li className="desktop-particle-label">
      <span className="desktop-particle-label-icon"><ScanFace size={15} aria-hidden="true" /></span> Face map
    </li>}
  </ul>
}

function SelectionWheel<T extends string>({ label, options, value, onChange, formatValue }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  formatValue?: (value: T) => string
}) {
  const list = useRef<HTMLDivElement>(null)
  const optionId = useId()
  const index = Math.max(0, options.indexOf(value))
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = index * rowHeight }, []) // Restore the selected row when revisiting this step.

  function select(row: number) {
    const next = Math.max(0, Math.min(options.length - 1, row))
    list.current?.scrollTo({ top: next * rowHeight, behavior: 'instant' })
    onChange(options[next])
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const row = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: options.length - 1 }[event.key]
    if (row === undefined) return
    event.preventDefault()
    select(row)
  }

  return <div className="desktop-selection-wheel">
    <div ref={list} role="listbox" aria-label={label} aria-activedescendant={`${optionId}-${index}`} tabIndex={0} onKeyDown={handleKeys}
      onScroll={event => {
        const row = Math.max(0, Math.min(options.length - 1, Math.round(event.currentTarget.scrollTop / rowHeight)))
        if (options[row] !== value) onChange(options[row])
      }}>
      {options.map((item, row) => <div id={`${optionId}-${row}`} key={item} role="option" aria-selected={item === value} onClick={() => select(row)}>{formatValue?.(item) ?? item}</div>)}
    </div>
  </div>
}


const formatPopulation = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 2 })

function recapCohort(country: string | null, gender: AnalysisGender | null, age?: string) {
  const region = populationRegion(country)

  const band = ageBands.findIndex(item => item === age)
  const populations = gender === 'male' ? [region.population[0]] : gender === 'female' ? [region.population[1]] : region.population
  const population = populations.reduce((total, group) => total + (band > 0 ? group[band] : group[0] + group[1]), 0)
  if (!population) return null

  const group = gender === 'male' ? band === 1 ? 'boys' : 'men' : gender === 'female' ? band === 1 ? 'girls' : 'women' : 'people'
  const ageLabel = band > 1 ? ` aged ${age}` : band === 1 ? ' under 18' : ''
  return { count: formatPopulation.format(population), group: group + ageLabel, region }
}

function StartingStats({ goals, age, gender, background, country }: {
  goals: string[]
  age?: string
  gender: AnalysisGender | null
  background: string
  country: string | null
}) {
  const region = populationRegion(country)
  const rows = [
    [UsersRound, 'Gender', profiles.find(item => item.id === gender)?.label ?? 'Not specified'],
    [CalendarDays, 'Age range', age && age !== ageBands[0] ? age : 'Not specified'],
    [CircleUserRound, 'Ethnicity', background === skipEthnicity ? 'Not specified' : formatEthnicityLabel(background)],
    [Globe2, 'Region', region.scope === 'country' ? region.name : `${region.name} (reference)`],
  ] as const
  return <section className="desktop-starting-stats" aria-label="Your stats">
    <h2 className="desktop-stats-divider">Your Goals</h2>
    <div className="desktop-stats-highlights">
      <div className="desktop-goal-laurels">
        <GoalBranch /><span>{goals.join(' · ') || 'Overall'}</span><GoalBranch />
      </div>
    </div>
    <dl className="desktop-stats-rows">
      {rows.map(([Icon, label, value]) => <div key={label} className="desktop-stats-row"><dt><Icon size={17} strokeWidth={1.65} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>
}


function GoalBranch() {
  return <svg viewBox="0 0 24 46" aria-hidden="true" fill="none">
    <path d="M21 42C9 36 5 23 7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M7 11C2 8 4 3 8 1c2 4 2 7-1 10Zm0 8C1 19 0 15 1 11c4 0 7 4 6 8Zm2 8c-6 1-9-2-9-6 5-1 8 2 9 6Zm4 8c-6 3-10 1-11-3 4-2 9 0 11 3Zm7 6c-5 5-10 3-12 0 4-3 9-3 12 0ZM7 17c0-5 3-7 7-7 1 5-2 8-7 7Zm2 9c-1-5 2-8 6-9 2 5-1 9-6 9Zm4 8c-2-5 0-9 4-11 3 4 2 9-4 11Zm6 6c-3-4-2-8 1-11 4 3 4 8-1 11Z" fill="currentColor" />
  </svg>
}
