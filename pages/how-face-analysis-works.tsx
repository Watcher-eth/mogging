import { useState } from 'react'
import Link from 'next/link'
import { Sun, Camera, ScanFace, ImageIcon, Check } from 'lucide-react'
import { GuidePage, GuideSection, GuideQuestions } from '@/components/app/guide-page'
import { EvaluationPreview } from '@/components/landing/mobile-preview'
import { ReportMetricDemo, ReportPortraitDemo } from '@/components/landing/analysis-story'
import styles from '@/components/app/guide-page.module.css'
import { reportCategories } from '@/lib/creator/mock-report-data'
import type { TimelineAxis } from '@/components/analysis/v2/metric-timeline'

const photoNotes = [
  { icon: Sun, title: 'Even light', detail: 'Face a soft light source. Avoid harsh shadows across your features.' },
  { icon: Camera, title: 'Eye-level camera', detail: 'Keep your face front-on and use a similar distance each time.' },
  { icon: ScanFace, title: 'A relaxed expression', detail: 'Let your features rest naturally. Keep hair away from your eyes and brows.' },
  { icon: ImageIcon, title: 'An original photo', detail: 'Use a sharp image without reshaping, beauty filters or heavy compression.' },
]
const measurementExamples = [
  { category: 'nose', id: 'nose.width', title: 'Nose width', narration: 'Nose-base width', value: .22, axis: { minimum: 0, maximum: .5, unit: '×', digits: 2 }, description: 'The width across the nose base, relative to the width of the face.', reference: 'Nose-base width / cheek width' },
  { category: 'mouth', id: 'mouth.lip-ratio', title: 'Lip proportions', narration: 'Upper and lower lip height', value: 1.1, axis: { minimum: 0, maximum: 2, unit: '×', digits: 2 }, description: 'The height of the lower lip compared with the upper lip. A proportion, rather than a measure of size.', reference: 'Lower lip height / upper lip height' },
  { category: 'brows', id: 'brows.eye-distance', title: 'Brow–eye distance', narration: 'Brow eye distance', value: .6, axis: { minimum: 0, maximum: 1, unit: '×', digits: 2 }, description: 'The gap between the brow and eye, relative to the height of the eye opening.', reference: 'Brow–eye gap / eye opening' },
] satisfies { category: string; id: string; title: string; narration: string; value: number; axis: TimelineAxis; description: string; reference: string }[]

const routine = [
  { title: 'Keep your skin routine consistent', detail: 'Cleanse gently, moisturize and use daily sun protection.' },
  { title: 'Work with your natural grooming', detail: 'Keep a simple, repeatable approach to your hair, brows and facial hair.' },
  { title: 'Take a consistent progress photo', detail: 'Use similar lighting, distance and expression for your next evaluation.' },
]

export default function FaceAnalysisGuide() {
  return <GuidePage title="How Mogging face analysis works" description="Explore Mogging’s face analysis with interactive landmark overlays, feature measurements, scoring explanations and a preview of your personalized daily plan." path="/how-face-analysis-works" eyebrow="HOW THE ANALYSIS WORKS" heading={<>Your Face<br />Decoded.</>} intro="Understand your features, see the detail behind the numbers, and turn your findings into a plan you can follow." visual={<EvaluationPreview />} chapters={[{ id: 'your-photo', label: 'Your photo' }, { id: 'the-measurements', label: 'The measurements' }, { id: 'your-plan', label: 'Your plan' }, { id: 'questions', label: 'Questions' }]}>
    <GuideSection id="your-photo" className={styles.photoSection} eyebrow="01 / A GOOD START" title={<>A better photo.<br />A more useful comparison.</>}>
      <div className={styles.grid}><div><p className={styles.body}>Your evaluation starts with what the camera can see. A clear, repeatable photo helps you understand your features and compare later reports with more context.</p><div className={styles.stats}><div><strong>13</strong><span>Report categories</span></div><div><strong>110+</strong><span>Feature metrics</span></div></div><p className={styles.fine}>Report format can differ in older app versions and saved evaluations.</p></div><div className={styles.photoNotes}>{photoNotes.map(({ icon: Icon, title, detail }) => <div key={title}><Icon size={23} strokeWidth={1.2} /><h3>{title}</h3><p>{detail}</p></div>)}</div></div>
    </GuideSection>
    <GuideSection id="the-measurements" eyebrow="02 / THE DETAIL" title={<>See what sits<br />behind a measurement.</>}>
      <MeasurementLab />
      <div className={styles.grid} style={{ marginTop: 48 }}><div><p className={styles.body}>Detected landmarks describe distances, angles and proportions. Image-based assessment adds context for features such as skin texture, hair and grooming. The report brings both together.</p><p className={styles.fine}>These are estimates from a photograph, not direct measurements of real-world anatomy. Pose, lighting and image quality affect the result.</p></div><div className={styles.scaleList}><div><strong>8<small> point scale</small></strong><h3>PSL score</h3><p>A separate scale used in the report. Read it alongside the feature breakdown.</p></div><div><strong>10<small> point scale</small></strong><h3>Mogging & feature scores</h3><p>Context for your evaluation. Scores are not population percentiles.</p></div></div></div>
    </GuideSection>
    <GuideSection id="your-plan" eyebrow="03 / PUT IT TO WORK" title={<>A finding is a starting point.<br />Your routine is the next step.</>}>
      <div className={styles.grid}><div><p className={styles.body}>Your Protocol turns recommendations into daily steps for skin care, grooming, posture and more. Follow your routine, mark tasks complete, and revisit your evaluations over time.</p><p className={styles.body} style={{ marginTop: 20 }}>Keep your photos consistent when you check in again. A different angle or brighter light can change the report without a physical change.</p><p className={styles.fine}>The routine shown is an example. Recommendations and potential scores are estimates, not a promised result.</p></div><RoutineDemo /></div>
    </GuideSection>
    <GuideSection id="questions" eyebrow="GOOD TO KNOW" title="A little more context.">
      <GuideQuestions items={[
        { question: 'Why can two photos of me receive different results?', answer: 'Camera distance, lighting, head position, expression and filters all change the visible image. The analysis itself can vary too. Compare the photos and feature descriptions before treating a score change as physical progress.' },
        { question: 'Does my score tell me how everyone sees me?', answer: 'No. It is a software-generated assessment of one photograph. It cannot determine your worth, predict everyone’s preferences or guarantee a social outcome.' },
        { question: 'Is the report a medical assessment?', answer: 'No. The report describes visible features and cosmetic appearance. It cannot diagnose a condition or establish a need for a procedure.' },
        { question: 'Can I export my own report?', answer: 'Yes. You can export an image of your own report. Choose carefully what you share, including any photos or results visible in the export.' },
        { question: 'Can I start without an iPhone?', answer: 'You can start a paid analysis in your browser. The iPhone app brings evaluations, your personalized Protocol and progress tracking together.' },
      ]} /><p className={styles.fine}>Questions about photos or account data? Read our <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link> or <Link href="/support" className="underline underline-offset-4">contact support</Link>.</p>
    </GuideSection>
  </GuidePage>
}

function MeasurementLab() {
  const [selected, setSelected] = useState(0), example = measurementExamples[selected]
  const source = reportCategories.find(category => category.id === example.category)!.features.find(feature => feature.id === example.id)!
  const metric = { ...source, positions: [(example.value - example.axis.minimum) / (example.axis.maximum - example.axis.minimum)] }
  return <><div className={styles.tabs} role="group" aria-label="Explore report measurements">{measurementExamples.map((item, index) => <button key={item.title} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.title}</button>)}</div><div className={styles.grid}><div><ReportMetricDemo key={example.id} metric={metric} axis={example.axis} /><p className={styles.metricNotes}>{example.description}<small>{example.reference}<br />Hover or drag to explore the scale. Illustrative values.</small></p></div><ReportPortraitDemo category={example.category} narration={example.narration} /></div></>
}

function RoutineDemo() {
  const [done, setDone] = useState<string[]>([])
  return <div className={styles.routine}><div className={styles.routineHeader}><strong>Your Protocol</strong><span>{done.length} / {routine.length} complete</span></div>{routine.map(task => { const checked = done.includes(task.title); return <button key={task.title} type="button" aria-pressed={checked} className={styles.task} onClick={() => setDone(current => checked ? current.filter(title => title !== task.title) : [...current, task.title])}><span className={styles.checkbox}>{checked ? <Check size={14} /> : null}</span><span><strong>{task.title}</strong><small>{task.detail}</small></span></button> })}<p className={styles.fine}>Interactive example. Try checking off a step.</p></div>
}
