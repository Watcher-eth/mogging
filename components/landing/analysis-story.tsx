import Image from 'next/image'
import { useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowRight, Check, Eye, Ruler, Sparkles, ScanFace, ChevronRight, BadgeCheck, Droplets, Scissors } from 'lucide-react'
import { RubricVisual } from '@/components/analysis/v2/rubric-visual'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { FaceOverlay } from '@/components/analysis/face-overlay'
import { resolvePreviewOverlay, previewLandmarks } from './overlay'
import { Primitive } from './mobile-preview'
import portrait from './primer-portrait.json'
import styles from './analysis-story.module.css'

const examples = [
  { id: 'skin', taskIcon: Droplets, color: '#58bdff', title: 'Skin', icon: Sparkles, finding: 'Skin texture', value: 'Uneven in places', kind: 'Rail', positions: [], grade: 7, context: 'Your report brings surface texture, tone and visible blemishes into one clear picture.', task: 'Build a consistent skin routine', detail: 'Gently cleanse, moisturize and use daily sun protection.', timing: 'Morning · Your Protocol' },
  { id: 'brows', taskIcon: Scissors, color: '#c09aff', title: 'Brows', icon: Eye, finding: 'Brow coverage', value: 'Moderate coverage', kind: 'Capsule', positions: [.57], grade: null, context: 'Shape, coverage and position help explain how your brows frame your eyes.', task: 'Define your natural brow shape', detail: 'Brush into place and tidy stray hairs outside the natural outline.', timing: 'Grooming · Your Protocol' },
  { id: 'jaw', taskIcon: Scissors, color: '#32c48d', title: 'Jaw & chin', icon: ScanFace, finding: 'Jaw outline', value: 'Defined', kind: 'Orbit', positions: [.74], grade: null, context: 'Your report separates facial structure from the grooming and presentation you can work on.', task: 'Keep your stubble edges tidy', detail: 'Follow your natural cheek and jaw lines for a consistent finish.', timing: 'Grooming · Your Protocol' },
] as const
const jawOverlay = resolvePreviewOverlay(reportOverlayPresets.jaw, 585)
const image = { src: '/model2.png', ...portrait.image }
const browPaths = [portrait.contours.leftBrow, portrait.contours.rightBrow].map(points => {
  const midpoint = (a: typeof points[number], b: typeof a) => `${(a.x + b.x) * 50} ${(a.y + b.y) * 50}`
  return `M${midpoint(points[points.length - 1], points[0])} ${points.map((point, index) => `Q${point.x * 100} ${point.y * 100} ${midpoint(point, points[(index + 1) % points.length])}`).join(' ')} Z`
})
const points = portrait.anchors
const cheekWidth = points.rightCheek.x - points.leftCheek.x
const measurements = [
  { title: 'Eye spacing', description: 'The distance between pupil centers, compared with the width across the cheeks.', a: points.leftPupil, b: points.rightPupil, numerator: 'Distance between pupils', denominator: 'Visible cheek width', value: (points.rightPupil.x - points.leftPupil.x) / cheekWidth },
  { title: 'Jaw width', description: 'The width between the jaw corners, compared with the cheek width above them.', a: points.jawLeft, b: points.jawRight, numerator: 'Visible jaw width', denominator: 'Visible cheek width', value: (points.jawRight.x - points.jawLeft.x) / cheekWidth },
  { title: 'Mouth width', description: 'The distance between the mouth corners relative to the width of the face.', a: points.mouthLeft, b: points.mouthRight, numerator: 'Visible mouth width', denominator: 'Visible cheek width', value: (points.mouthRight.x - points.mouthLeft.x) / cheekWidth },
  { title: 'Inner-eye gap', description: 'The gap between the inner eye corners, expressed in eye widths.', a: points.leftEyeInner, b: points.rightEyeInner, numerator: 'Inner-eye distance', denominator: 'Average eye width', value: (points.rightEyeInner.x - points.leftEyeInner.x) / ((points.leftEyeInner.x - points.leftEyeOuter.x + points.rightEyeOuter.x - points.rightEyeInner.x) / 2) },
]

export function AnalysisStory() {
  const reduced = useReducedMotion()
  const entrance = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .4, ease: [.16, 1, .3, 1] as [number, number, number, number] } }
  const [selected, setSelected] = useState(0)
  const [done, setDone] = useState<string[]>([])
  const [day, setDay] = useState(3)
  const [measurement, setMeasurement] = useState(0)
  const [anchors, setAnchors] = useState(false)
  const example = examples[selected]
  const metric = measurements[measurement]
  const taskKey = `${example.id}:${day}`
  const checked = done.includes(taskKey)
  const TaskIcon = example.taskIcon
  const referenceLines = metric.title === 'Inner-eye gap' ? [[points.leftEyeOuter, points.leftEyeInner], [points.rightEyeInner, points.rightEyeOuter]] : [[points.leftCheek, points.rightCheek]]
  return <>
    <m.section {...entrance} data-landing-section="how_it_works" aria-labelledby="story-title" className={styles.section}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>HOW MOGGING WORKS</p>
        <h2 id="story-title">Your face. Your findings.<br />Your next move.</h2>
        <p>Choose a feature. Follow it from your scan to your daily plan.</p>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Explore a feature">
        {examples.map(({ title, icon: Icon }, index) => <button key={title} type="button" role="tab" aria-selected={selected === index} aria-controls="feature-story" onClick={() => setSelected(index)}><Icon size={17} />{title}</button>)}
      </div>
      <div id="feature-story" role="tabpanel" aria-label={example.title} className={styles.story}>
        <article className={styles.scan}>
          <Image src="/model2.png" alt="Example face with the selected feature mapped" fill sizes="(min-width: 1024px) 340px, 90vw" />
          {example.id === 'skin' ? <FaceOverlay preset={null} landmarks={previewLandmarks} image={image} faceMapPointCount={60} /> : example.id === 'brows' ? <svg className={styles.browOverlay} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{browPaths.map((path, index) => <path key={index} d={path} />)}</svg> : <svg key={example.id} viewBox="0 0 390 585" aria-hidden="true">{jawOverlay.map(primitive => <Primitive key={primitive.id} primitive={primitive} />)}</svg>}
          <div className={styles.scanTop}><span>01 / MAP</span><span>{example.title}</span></div>
          <div className={styles.scanBottom}><span>Start with your features.</span><p>Landmarks and contours map the areas your report explores.</p></div>
        </article>
        <article className={styles.finding}>
          <p className={styles.eyebrow}>02 / UNDERSTAND</p>
          <h3>Find your focus.</h3>
          <div className={styles.metric} key={example.id}><span>{example.finding}</span><RubricVisual kind={example.kind} scale="quality" positions={[...example.positions]} grade={example.grade} /><strong>{example.value}</strong></div>
          <p className={styles.context}>{example.context}</p>
          <div className={styles.connection}><span>From your report</span><ArrowRight size={19} /><span>To your Protocol</span></div>
        </article>
        <article className={styles.plan}>
          <p className={styles.eyebrow}>03 / ACT</p>
          <h3>Make your next move.</h3>
          <div className={styles.protocol}>
            <div className={styles.protocolHeader}><strong>Your Protocol</strong><span><BadgeCheck size={17} />{checked ? '5' : '0'}</span></div>
            <div className={styles.week} aria-label="Example Protocol dates">{['Tue', 'Wed', 'Thu', 'Today', 'Sat', 'Sun'].map((label, index) => <button key={index} type="button" aria-label={`Show example day ${index + 6}`} aria-pressed={day === index} data-today={index === 3} onClick={() => setDay(index)}><span>{label}</span><b>{done.includes(`${example.id}:${index}`) ? <Check size={13} /> : index + 6}</b><i /></button>)}</div>
            <div className={styles.schedule}>
              <span className={styles.time}>09:00</span>
              <div className={styles.task} key={taskKey} data-completed={checked} style={{ '--task-color': example.color } as CSSProperties}>
                <div className={styles.taskTop}><span className={styles.taskIcon}><TaskIcon size={17} /></span><strong>{example.task}</strong><button type="button" aria-label={`Complete ${example.task}`} aria-pressed={checked} onClick={() => setDone(current => checked ? current.filter(id => id !== taskKey) : [...current, taskKey])}>{checked ? <Check size={14} /> : null}</button></div>
                <p>{example.detail}</p>
              </div>
              <span className={styles.nextTime}>10:00</span>
            </div>
          </div>
          <p className={styles.context}>A clear priority becomes a repeatable habit. Save your reports to follow changes over time.</p>
        </article>
      </div>
      <p className={styles.caption}>Interactive example report. Your findings and Protocol are personalized to you.</p>
    </m.section>
    <m.section {...entrance} data-landing-section="measurement_proof" aria-labelledby="measurement-title" className={styles.proofSection}>
      <div className={styles.proof}>
        <div className={styles.proofPhoto}>
          <Image src="/model2.png" alt="Example portrait showing the points used to calculate a facial proportion" fill sizes="(min-width: 1024px) 420px, 90vw" />
          <svg key={metric.title} className={styles.measurementOverlay} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {anchors ? Object.values(portrait.contours).flat().map((point, index) => <circle key={index} cx={point.x * 100} cy={point.y * 100} r=".26" fill="white" opacity=".7" />) : null}
            {referenceLines.map(([a, b], index) => <line key={index} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} stroke="white" strokeWidth=".22" strokeDasharray="1 1" />)}
            <line x1={metric.a.x * 100} y1={metric.a.y * 100} x2={metric.b.x * 100} y2={metric.b.y * 100} stroke="#00A8EF" strokeWidth=".4" />
            {[metric.a, metric.b, ...referenceLines.flat()].map((point, index) => <circle key={index} cx={point.x * 100} cy={point.y * 100} r=".65" fill={index < 2 ? '#00A8EF' : 'white'} stroke="white" strokeWidth=".2" />)}
          </svg>
          <button className={styles.anchorToggle} type="button" aria-pressed={anchors} onClick={() => setAnchors(show => !show)}><ScanFace size={16} />{anchors ? 'Hide landmarks' : 'Show landmarks'}</button>
        </div>
        <div className={styles.proofContent}>
          <p className={styles.eyebrow}>LOOK CLOSER</p>
          <h2 id="measurement-title">See where the<br />number comes from.</h2>
          <p className={styles.context}>Explore the geometry behind a proportion. The points, the distances and the relationship between them.</p>
          <div className={styles.measurements}>{measurements.map((item, index) => <button key={item.title} type="button" aria-pressed={measurement === index} onClick={() => setMeasurement(index)}><Ruler size={18} /><span>{item.title}</span><strong>{item.value.toFixed(2)}×</strong><ChevronRight size={16} /></button>)}</div>
          <div className={styles.calculation} key={metric.title}><p className={styles.eyebrow}>THE MEASUREMENT</p><h3>{metric.title}</h3><p className={styles.context}>{metric.description}</p><div className={styles.formula}><span>{metric.numerator}</span><i /><span>{metric.denominator}</span><strong>{metric.value.toFixed(2)}×</strong></div></div>
          <p className={styles.context}>Geometry describes proportions. Visual assessment adds context for skin, hair and individual features. Together, they build your report.</p>
          <p className={styles.caption}>A worked example using the landmarks on this portrait.</p>
        </div>
      </div>
    </m.section>
  </>
}
