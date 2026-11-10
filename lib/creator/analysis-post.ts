export type AnalysisPostFormatId = 'score-reveal' | 'feature-audit' | 'brand-explainer'

export type AnalysisPostInput = {
  formatId: AnalysisPostFormatId
  subject: string
  hook: string
  overallScore: string
  potentialScore: string
  potentialScale?: 8 | 10
  potentialCurrentScore?: number
  strongestFeature: string
  strongestScore: string
  opportunityFeature: string
  opportunityScore: string
  recommendation: string
  productFeatures: string[]
  cta: string
}

export type AnalysisPostScene = {
  id: string
  start: number
  end: number
  label: string
  purpose: string
  visual: string
  onScreen: string
  narration: string
  pace: 'fast' | 'hold'
}

export type AnalysisPostPlan = {
  title: string
  duration: number
  formatLabel: string
  strategy: string
  scenes: AnalysisPostScene[]
  caption: string
}

export const analysisPostFormats = [
  { id: 'score-reveal' as const, label: 'Score reveal', duration: 40, description: 'Fast result-first post with a score, proof, feature audit and CTA.' },
  { id: 'feature-audit' as const, label: 'Feature audit', duration: 46, description: 'A creator-native breakdown of one strength and one improvement area.' },
  { id: 'brand-explainer' as const, label: 'Mogging explainer', duration: 70, description: 'Polished product story covering the scan, report and personalized protocol.' },
]

export const analysisHookOptions = [
  'How attractive is this face—according to the numbers?',
  'This score looks low, but one feature changes everything.',
  'What if attractiveness could be mapped?',
  'Most people miss the feature carrying this face.',
]

export const moggingFeatureOptions = [
  '46-point face scan',
  'Category scores',
  'Strengths and weaknesses',
  'Personalized protocol',
  'Progress tracking',
]

const clean = (value: string, fallback: string) => value.trim() || fallback
const score = (value: string) => clean(value, '—')

function scene(start: number, end: number, label: string, purpose: string, visual: string, onScreen: string, narration: string, pace: AnalysisPostScene['pace'] = 'fast'): AnalysisPostScene {
  return { id: `${start}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, start, end, label, purpose, visual, onScreen, narration, pace }
}

export function buildAnalysisPost(input: AnalysisPostInput): AnalysisPostPlan {
  const subject = clean(input.subject, 'this face')
  const strength = clean(input.strongestFeature, 'eye area')
  const opportunity = clean(input.opportunityFeature, 'jaw definition')
  const recommendation = clean(input.recommendation, `Build a focused routine around ${opportunity.toLowerCase()} and track changes consistently.`)
  const productFeatures = input.productFeatures.length ? input.productFeatures : ['46-point face scan', 'Category scores', 'Strengths and weaknesses']
  const hook = clean(input.hook, analysisHookOptions[0])
  const overall = score(input.overallScore)
  const potential = score(input.potentialScore)
  const strengthScore = score(input.strongestScore)
  const opportunityScore = score(input.opportunityScore)
  const cta = clean(input.cta, 'Get your Mogging score—link in bio.')

  if (input.formatId === 'brand-explainer') {
    const scenes = [
      scene(0, 3.5, 'Pattern interrupt', 'Create curiosity before naming the product.', 'Rapid close-ups: eyes, jaw, profile. Use two to three cuts.', hook, `${hook} We usually judge a face in seconds, but the reasons are measurable.`),
      scene(3.5, 10.5, 'Measurement proof', 'Make the analysis feel concrete.', 'Cycle through eye spacing, facial thirds and jaw-angle overlays.', 'Ratios · angles · symmetry', `Small relationships—like facial thirds, eye spacing and angularity—shape the overall impression.`),
      scene(10.5, 15, 'Thesis', 'Translate measurements into a simple promise.', 'Hold on the aligned face map, then pull back to the report.', 'Turn features into a plan', `The useful part is not a single rating. It is knowing what already works and what to improve.`),
      scene(15, 22, 'Introduce Mogging', 'Name the product only after the proof.', 'Open the Mogging scan and move through the report header.', 'Mogging Face Scan', `Mogging maps ${subject} and turns the scan into a detailed, easy-to-read face analysis.`),
      scene(22, 31, 'Overall score', 'Deliver the result viewers were waiting for.', 'Reveal the overall score, then briefly show potential.', `Overall ${overall} → Potential ${potential}`, `The current overall score is ${overall} out of ten, with a potential score of ${potential}.`),
      scene(31, 43, 'Feature breakdown', 'Show specificity, not a vague verdict.', 'Alternate face map and report cards; one metric per overlay.', `${strength} ${strengthScore} · ${opportunity} ${opportunityScore}`, `${strength} is the standout at ${strengthScore}. The clearest opportunity is ${opportunity}, currently ${opportunityScore}.`),
      scene(43, 53, 'Actionable insight', 'Convert the weakness into a constructive next step.', 'Show the weakness card followed by one protocol task.', 'Your next move', recommendation, 'hold'),
      scene(53, 62, 'Product depth', 'Show that the app continues after the score.', 'Scroll through report sections, protocol and progress views.', productFeatures.join(' · '), `The report includes ${naturalList(productFeatures)} so the analysis becomes a repeatable plan.`),
      scene(62, 70, 'CTA', 'End on one direct action.', 'Clean logo lockup, app screen and link-in-bio cue.', cta, cta, 'hold'),
    ]
    return plan('Mogging face-analysis explainer', 'Mogging explainer', 70, 'Proof before product: demonstrate the measurements, reveal the score, then sell the personalized plan.', scenes, cta)
  }

  if (input.formatId === 'feature-audit') {
    const scenes = [
      scene(0, 1.8, 'Hook', 'Stop the scroll with a specific tension.', 'Face fills the frame; hard cut on the final word.', hook, hook),
      scene(1.8, 5, 'Result first', 'Pay off the hook immediately.', 'Flash the report result and score.', `Overall score: ${overall}`, `Mogging scored ${subject} ${overall} out of ten.`),
      scene(5, 10, 'Face map', 'Prove the result is based on visible details.', 'Show landmarks and category labels locking onto the face.', '46 mapped points', `The scan maps proportions, symmetry, angularity and individual features.`),
      scene(10, 18, 'Strongest feature', 'Give viewers a positive, shareable insight.', `Crop tightly to ${strength}; hold the metric for at least two seconds.`, `${strength}: ${strengthScore}`, `The strongest feature is ${strength}, scoring ${strengthScore}. This is what carries the face most.`),
      scene(18, 28, 'Opportunity', 'Introduce contrast without turning insulting.', `Move to ${opportunity}, then show its report card.`, `${opportunity}: ${opportunityScore}`, `The main opportunity is ${opportunity} at ${opportunityScore}. That matters because it affects the overall balance.`),
      scene(28, 37, 'Recommendation', 'Make the analysis useful.', 'Show one protocol card and a progress check-in.', 'Recommended next move', recommendation, 'hold'),
      scene(37, 42, 'Product proof', 'Connect the insight to Mogging features.', 'Quick report-to-protocol montage.', productFeatures.slice(0, 3).join(' · '), `Mogging turns the score into ${naturalList(productFeatures.slice(0, 3))}.`),
      scene(42, 46, 'CTA', 'Give one unambiguous action.', 'Return to the full portrait with the app mark.', cta, cta, 'hold'),
    ]
    return plan(`${subject} feature audit`, 'Feature audit', 46, 'One clear strength, one constructive opportunity, and one actionable recommendation.', scenes, cta)
  }

  const scenes = [
    scene(0, 1.6, 'Hook', 'Use a question or contradiction to stop the scroll.', 'Start on the face, already cropped close. Hard cut after one sentence.', hook, hook),
    scene(1.6, 4.5, 'Score reveal', 'Deliver the headline result early.', 'Flash the Mogging result screen, then freeze on the number.', `${overall} / 10`, `Mogging gave ${subject} an overall score of ${overall} out of ten.`),
    scene(4.5, 9, 'Proof', 'Show that the result comes from a detailed report.', 'Fast report scroll: category rings, feature grid, face map.', '46 points mapped', `But the overall number is only the headline. The report shows exactly where it comes from.`),
    scene(9, 16, 'Face map', 'Anchor the analysis to the subject.', 'Animate guide lines over the eyes, midface and jaw.', 'Harmony · symmetry · structure', `Mogging maps the face across harmony, symmetry, structure and individual features.`),
    scene(16, 24, 'Strength', 'Create a positive peak in the middle.', `Tight crop on ${strength} with one metric overlay.`, `${strength}: ${strengthScore}`, `${strength} is the strongest feature here, scoring ${strengthScore}.`),
    scene(24, 32, 'Opportunity', 'Add useful contrast and sustain attention.', `Cut to ${opportunity}; compare face view and report card.`, `${opportunity}: ${opportunityScore}`, `${opportunity} is the biggest opportunity at ${opportunityScore}.`),
    scene(32, 36.5, 'Potential', 'Reframe the analysis around improvement.', 'Reveal potential beside the current score.', `${overall} → ${potential}`, `With a focused plan, the modeled potential is ${potential}.`),
    scene(36.5, 40, 'CTA', 'Close before attention drops.', 'Clean app screen and link-in-bio cue.', cta, cta, 'hold'),
  ]
  return plan(`${subject} score reveal`, 'Score reveal', 40, 'Reveal the score in the first five seconds, prove it with a face map, then turn the verdict into potential.', scenes, cta)
}

function plan(title: string, formatLabel: string, duration: number, strategy: string, scenes: AnalysisPostScene[], cta: string): AnalysisPostPlan {
  return {
    title,
    duration,
    formatLabel,
    strategy,
    scenes,
    caption: `Your face is more than one score. Map the strengths, find the opportunities, and build a plan with Mogging. ${cta} #mogging #looksmaxxing #faceanalysis #glowup`,
  }
}

function naturalList(values: string[]) {
  if (values.length <= 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

export function analysisPostScript(plan: AnalysisPostPlan) {
  return plan.scenes.map(item => `[${time(item.start)}–${time(item.end)}] ${item.narration}`).join('\n\n')
}

export function analysisPostBrief(plan: AnalysisPostPlan) {
  const scenes = plan.scenes.map(item => `${time(item.start)}–${time(item.end)} · ${item.label}\nGoal: ${item.purpose}\nVisual: ${item.visual}\nOn-screen: ${item.onScreen}\nNarration: ${item.narration}`).join('\n\n')
  return `${plan.title}\n${plan.formatLabel} · ${plan.duration} seconds\n\nStrategy\n${plan.strategy}\n\nStoryboard\n${scenes}\n\nCaption\n${plan.caption}`
}

export function time(seconds: number) {
  const whole = Math.floor(seconds)
  const decimal = seconds % 1 ? `.${Math.round((seconds % 1) * 10)}` : ''
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${decimal}`
}
