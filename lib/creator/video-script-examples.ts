import type { AnalysisPostInput } from './analysis-post'
import { scriptToPlan } from './script-edit'
import { inferScriptCategory, type VideoDirection, type VideoRecipe } from './video-composition'
import type { GeneratorImage } from './content-generator'
import type { AnatomyPose } from './video-anatomy'
import type { VoiceDirection } from './video-speech'
import { portraitEffectsLab, subjectStudies } from './video-subject-studies'

export type VideoScriptExample = { title: string; recipe: VideoRecipe; readingPace: number; script: string; durationSeconds: number; reference?: string; images?: GeneratorImage[]; directions?: Record<string, VideoDirection>; voice?: VoiceDirection; disclosure?: string; credit?: { author: string; source: string; license: string; licenseUrl: string } }
const referenceGrammar: Record<VideoRecipe, string> = { 'feature-study': 'F · one-feature controlled comparison', 'report-led': 'A · app-category chapters', 'portrait-audit': 'D · map-to-feature audit', 'measurement-explainer': 'B · measurement manifesto', 'minimal-explainer': 'E · kinetic infographic', 'hybrid-story': 'B + C · story and app proof' }

const portrait = (categoryId = 'overall'): VideoDirection => ({ kind: 'portrait', categoryId })
const graphic = (layout: NonNullable<VideoDirection['graphic']>['layout'], items: Array<[string, string, string]>, tone: 'light' | 'ink' = 'light', days?: number[]): VideoDirection => ({ kind: 'explainer', graphic: { layout, tone, variant: 0, footnote: '', days, items: items.map(([id, label, value]) => ({ id, label, value, detail: '', role: 'main' })) } })
const anatomy = (focus: NonNullable<AnatomyPose['focus']>, action: NonNullable<AnatomyPose['action']>, variation: Pick<AnatomyPose, 'deformation' | 'highlight'> = {}): VideoDirection => ({ kind: 'explainer', graphic: { layout: 'story', tone: 'ink', variant: 0, footnote: '', anatomy: { focus, action, ...variation }, items: [{ id: 'anatomy', label: 'Anatomical reference', value: '', detail: '', role: 'main' }] } })
const celebrityExamples = [
  {
    title: 'Taylor Swift · The frame around the eyes', recipe: 'portrait-audit' as const, readingPace: 190,
    image: { id: 'example-taylor-swift', name: 'Taylor Swift · iHeartRadioCA · CC BY 3.0', dataUrl: '/creator/examples/taylor-swift.jpg', width: 1200, height: 1600, status: 'ready' as const, landmarks: null },
    credit: { author: 'iHeartRadioCA', source: 'https://commons.wikimedia.org/wiki/File:Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_4.png', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/' },
    beats: [
      ['Taylor Swift: why does this eye area grab your attention so quickly?', portrait('eyes')],
      ['The dark liner follows the upper eyelid, then extends the visual direction outward.', portrait('eyes')],
      ['But the wing is not working alone; the fringe creates another frame above it.', portrait('brows')],
      ['Seen together, the hair and eye makeup create a very deliberate focal point.', portrait()],
      ['Then the red lip adds a second area of contrast below.', portrait('mouth')],
      ['Two details can lead your attention without competing at every moment.', portrait()],
      ['Here is the same photo in our report demo, with illustrative rather than measured celebrity values.', { kind: 'report', categoryId: 'overall', focus: 'feature:0', emphasis: 'section-lift' }],
      ['A single feature gets attention, then returns to the wider picture.', { kind: 'report', categoryId: 'overall', focus: 'feature:1', emphasis: 'section-expand' }],
      ['The jaw contour gives the lower face context, but a close crop leaves out the styling.', portrait('jaw')],
      ['This subtle nose-width variation is an illustration, not a predicted outcome.', { ...portrait('nose'), photoStudy: { feature: 'nose', amount: .12 } }],
      ['That is why a red carpet photo is not a neutral measurement setup.', portrait()],
      ['Borrow the principle, not her proportions: choose where you want attention to land.', portrait('eyes')],
      ['A close-up explains one detail; the whole face explains how the details work together.', portrait()],
      ['Find your own starting point with Mogging.', portrait()],
    ] as Array<[string, VideoDirection]>,
  },
  {
    title: 'Tom Holland · Structure is not a shadow', recipe: 'hybrid-story' as const, readingPace: 190,
    image: { id: 'example-tom-holland', name: 'Tom Holland · Gage Skidmore · CC BY-SA 3.0', dataUrl: '/creator/examples/tom-holland.jpg', width: 1200, height: 1772, status: 'ready' as const, landmarks: null },
    credit: { author: 'Gage Skidmore', source: 'https://commons.wikimedia.org/wiki/File:Tom_Holland_by_Gage_Skidmore.jpg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
    beats: [
      ['A sharp shadow is not the same thing as a sharp jaw.', portrait('jaw')],
      ['Take this photo of Tom Holland: the outline is visible, but it is only one view.', portrait('jaw')],
      ['Three things change the picture: structure, expression, and camera setup.', graphic('pillars', [['structure', 'Structure', '01'], ['expression', 'Expression', '02'], ['camera', 'Camera + light', '03']])],
      ['The visible edge runs from the chin toward the ear, with light changing its contrast.', portrait('jaw')],
      ['Beneath that outline is depth; this generic reference is not Tom’s actual skull.', anatomy('whole', 'reveal')],
      ['A small illustrative expansion changes this reference jaw, not Tom’s actual bone structure.', anatomy('jaw', 'focus', { deformation: .35, highlight: 'tint' })],
      ['Isolating the lower region helps explain the shape without distracting surface detail.', anatomy('jaw', 'isolate')],
      ['A cutaway reveals the interior, not information we could measure through a photograph.', anatomy('orbits', 'cutaway', { highlight: 'outline' })],
      ['Back in the photo, the smile changes how the lower face reads.', portrait('mouth')],
      ['The eye area also needs the context of the whole portrait.', portrait('eyes')],
      ['In the report demo, one tile gets attention instead of the overall number.', { kind: 'report', categoryId: 'overall', focus: 'feature:0', emphasis: 'section-lift' }],
      ['These values are illustrative; the point is connecting a feature to the image.', { kind: 'report', categoryId: 'overall', focus: 'feature:1', emphasis: 'section-expand' }],
      ['For your own comparisons, match the light, distance, and expression.', graphic('sequence', [['light', 'Match the light', ''], ['distance', 'Keep camera distance', ''], ['expression', 'Repeat the expression', '']])],
      ['Repeat the same setup each week, rather than chasing a dramatic shadow.', graphic('calendar', [['routine', 'Repeatable photo setup', '1']], 'light', [0])],
      ['Understand the detail, keep the whole face in view, and explore your starting point with Mogging.', portrait()],
    ] as Array<[string, VideoDirection]>,
  },
].map(example => {
  const script = example.beats.map(([text]) => text).join('\n'), readingPace = example.readingPace
  return { title: example.title, recipe: example.recipe, readingPace, script, reference: example.recipe === 'portrait-audit' ? 'C · portrait/proof carousel' : 'B + E · educational anatomy and app proof', durationSeconds: Math.round(scriptToPlan(script, readingPace).duration), images: [example.image], credit: example.credit, directions: Object.fromEntries(example.beats.map(([, direction], index) => [`script-${index}`, direction])) }
}) satisfies VideoScriptExample[]

export function videoScriptExamples(input: AnalysisPostInput): VideoScriptExample[] {
  const overall = input.overallScore.trim() || '7.1'
  const strength = input.strongestFeature.trim() || 'eye area', strengthScore = input.strongestScore.trim() || '8.1'
  const opportunity = input.opportunityFeature.trim() || 'jaw definition', opportunityScore = input.opportunityScore.trim() || '6.2'
  return [...subjectStudies, portraitEffectsLab, ...celebrityExamples, ...[
    {
      title: 'The two-second face audit', recipe: 'report-led' as const, readingPace: 165,
      script: `One overall score, and two very different stories underneath it.
This demo report starts at ${overall} out of ten.
The eye report breaks one area into smaller, readable relationships.
Eye spacing compares the pupil distance with the width of the face.
Outer-corner tilt describes the direction of the eye corners, not their size.
Eye aspect ratio compares width with height; these are three different relationships.
The jaw report asks a different question about the lower face.
Its visible contour needs the context of the whole portrait.
Back in the overall report, ${strength} is ${strengthScore}, while ${opportunity} is ${opportunityScore}.
That difference is more useful than staring at the average again.
The symmetry report adds another perspective without replacing the earlier details.
Keep the report connected to the image, rather than treating a rating as the whole story.
Explore your own detailed report with Mogging.`,
    },
    {
      title: 'Eyes, jaw, then the whole face', recipe: 'portrait-audit' as const, readingPace: 145,
      script: `This demo starts with an overall score of ${overall}, but one feature needs a closer look.
This face map starts with the photograph, not a number floating beside it.
The eye area contains both shape and spacing, and those are different relationships.
The brows add a frame above the eyes.
The mouth changes the lower part of the expression.
The jaw contour connects those local details back to the whole face.
In this demo, the overall rating is ${overall}, with ${strength} at ${strengthScore} and ${opportunity} at ${opportunityScore}.
Those numbers are a summary, not a substitute for looking at the image.
A close crop can make one detail feel much more important than it looks in context.
So the useful comparison is between the detail and the whole portrait, not between two isolated numbers.
Keep the image, the feature, and the explanation together.
Explore your own face in detail with Mogging.`,
    },
    {
      title: 'What a face measurement means', recipe: 'measurement-explainer' as const, readingPace: 145,
      script: `A number without an image tells you surprisingly little.
The eye spacing measurement starts with two visible pupil centers.
The inner-eye gap uses different anchors, so it answers a different question.
The upper and lower eyelids add shape that neither distance can describe alone.
Three features can belong to the same area without measuring the same thing.
The jaw contour is another example: a visible outline is not a reconstruction of hidden bone.
Our generic anatomy reference makes that distinction easier to see.
The report places each visible relationship beside a scale and an explanation.
In this demo, ${strength} is ${strengthScore}, ${opportunity} is ${opportunityScore}, and the overall rating is ${overall}.
The useful part is knowing which feature a number refers to, and what the photograph actually supports.
Keep the measurement connected to the portrait with Mogging.`,
    },
    {
      title: 'Stop chasing the average', recipe: 'minimal-explainer' as const, readingPace: 145,
      script: `Compare two feature scores, and the average starts hiding the interesting part.
An overall score of ${overall} compresses a lot of different information into one number.
Compare ${strength} at ${strengthScore} with ${opportunity} at ${opportunityScore}.
That comparison is not a complete plan, but it gives the next question some context.
Three features can stand out for three different reasons.
Split those features into groups: what you notice, and what you can realistically change.
A strength is something to understand, not automatically something to exaggerate.
An opportunity is not a promise that a routine will change underlying structure.
The practical routine starts with choices you can repeat, like grooming and consistent presentation.
A weekly routine is easier to evaluate when the photo setup stays the same.
Use a scale to read the detail, then use the comparison to decide what deserves attention.
Turn the comparison into a repeatable routine with Mogging.`,
    },
    {
      title: 'From first impression to next step', recipe: 'hybrid-story' as const, readingPace: 145,
      script: `Before changing your face, ask a more useful question than how to fix everything.
Three features can tell three different stories about the same face.
The overall report gives this demo a rating of ${overall}.
The comparison is more specific: ${strength} is ${strengthScore}, and ${opportunity} is ${opportunityScore}.
Inside the eye report, one spacing measurement becomes a concrete detail instead of another abstract rating.
The jaw report gives the lower face its own context.
Back in the portrait, those categories have to work together again.
A useful routine starts with one choice you can actually repeat.
That might be grooming, a haircut, or simply taking progress photos in a consistent setup.
The plan should make the next step clearer, not turn your whole face into a checklist.
The face in a photo is part of your presentation, not a promise about dating outcomes.
Use the report to understand the detail, then come back to the whole picture with Mogging.`,
    },
  ].map(example => {
    const plan = scriptToPlan(example.script, example.readingPace)
    let categoryId = 'overall'
    const directions: Array<[string, VideoDirection]> = []
    for (const [index, beat] of plan.scenes.entries()) {
      categoryId = /overall report/i.test(beat.narration) ? 'overall' : inferScriptCategory(beat.narration) ?? categoryId
      if (example.recipe === 'measurement-explainer' && index === 0) directions.push([beat.id, { kind: 'explainer', graphic: { layout: 'scale', tone: 'light', variant: 1, items: [{ id: 'primary', label: 'Overall', value: overall, detail: '/ 10', role: 'main' }], footnote: '' } }])
      if (example.recipe === 'report-led') {
        const metric = categoryId === 'eyes' ? /eye spacing/i.test(beat.narration) ? 'eyes.spacing' : /outer-corner tilt/i.test(beat.narration) ? 'eyes.canthal-tilt' : /eye aspect ratio/i.test(beat.narration) ? 'eyes.aspect' : undefined : undefined
        directions.push([beat.id, { kind: 'report', categoryId, focus: index < 2 ? 'scores' : metric ? `feature:${metric}` : 'features', emphasis: metric ? 'border-beam' : undefined }])
      }
      if (example.recipe === 'portrait-audit' && /In this demo/i.test(beat.narration)) directions.push([beat.id, { kind: 'report', categoryId: 'overall', focus: 'feature:0', emphasis: 'section-lift' }])
      if (example.recipe === 'portrait-audit' && index === 0) directions.push([beat.id, { kind: 'report', categoryId: 'overall', focus: 'scores' }])
      if (example.recipe === 'portrait-audit' && index === 1) directions.push([beat.id, portrait()])
    }
    return { ...example, reference: referenceGrammar[example.recipe], directions: directions.length ? Object.fromEntries(directions) : undefined, durationSeconds: Math.round(plan.duration) }
  })]
}
