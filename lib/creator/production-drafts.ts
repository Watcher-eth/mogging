import { createVideoScript, scriptSectionSchema, type ScriptSection, type VideoScript } from './video-script'
import { deliverySchema } from './video-speech'
import { validateProductionScript } from './video-production'

const styles = { photo: ['portrait-audit', 'hybrid-story'], report: ['report-led'], metric: ['measurement-explainer'] } as const
const visual = (treatment: ScriptSection['visuals'][number]['treatment'], categoryId: string, reason: string, options: Partial<ScriptSection['visuals'][number]> = {}): ScriptSection['visuals'][number] => ({ treatment, categoryId, reason, view: 'front', ...options })
const face = (category: string): ScriptSection['visuals'] => [
  visual('detail', category, 'Frame the feature being discussed, keeping enough neighboring anatomy for context.', { styles: [...styles.photo] }),
  visual('measurement', category, 'Trace this category on the supplied face; show a real metric only when measured.', { styles: [...styles.metric] }),
  visual('report', category, 'Keep the feature image beside its explanation in the app.', { styles: [...styles.report], focus: 'features' }),
  visual('portrait', category, 'Return to the whole face so the detail does not lose its context.'),
]

// Working editorial scaffolds, explicitly separate from approved final scripts.
export function createProductionDraft(name: string): VideoScript {
  const subject = name.trim() || 'this person'
  const rows: Array<{ id: string; title: string; role: ScriptSection['role']; text: string; priority: number; visuals: ScriptSection['visuals'] }> = [
    { id: 'hook', title: 'The question', role: 'hook', text: `Two photos of ${subject}. Same face, different impression. What changed?`, priority: 100, visuals: [visual('portrait', 'overall', 'Establish the person before making an isolated feature claim.', { styles: [...styles.photo] }), visual('measurement', 'proportions', 'Introduce the facial frame rather than an unsupported score.', { styles: [...styles.metric] }), visual('portrait', 'overall', 'Begin with a clean portrait before entering the report.')] },
    { id: 'cta', title: 'Find your score', role: 'cta', text: 'Want your score? Go to Mogging.com.', priority: 100, visuals: [visual('report', 'overall', 'Show the report while the narrator invites the viewer to find their score.', { focus: 'scores' })] },
    { id: 'contour', title: 'Read the contour', role: 'explanation', text: 'Start with the jaw. Its visible outline describes the lower face, but a darker shadow can make that same edge look sharper.', priority: 95, visuals: face('jaw') },
    { id: 'product', title: 'Connect the explanation to the image', role: 'product', text: 'In the Mogging app, each feature stays beside its explanation. You can see what the description refers to.', priority: 100, visuals: [visual('report', 'jaw', 'Match the spoken product mention to the feature image and explanation.', { focus: 'features' }), visual('grid', 'overall', 'Show the relationship between feature categories without inventing personal results.', { styles: ['hybrid-story', 'measurement-explainer'] })] },
    { id: 'light', title: 'Separate light from shape', role: 'explanation', text: 'Now look at the light. Side lighting deepens the cheek shadows; a softer frontal light makes those transitions less obvious.', priority: 70, visuals: [visual('lighting', 'cheeks', 'Illustrate a reversible lighting change on the entire portrait, not a change in anatomy.', { styles: ['portrait-audit', 'measurement-explainer', 'hybrid-story'] }), ...face('cheeks')] },
    { id: 'perspective', title: 'Check another angle', role: 'explanation', text: 'Head angle matters too. A side view reveals the profile, while a three-quarter view helps you follow the cheek into the jaw.', priority: 65, visuals: [visual('profile', 'jaw', 'Use the actual side portrait when the voiceover discusses the profile.', { view: 'profile' }), visual('portrait', 'cheeks', 'Follow the cheek-to-jaw boundary in the three-quarter source.', { view: 'three-quarter', styles: ['portrait-audit', 'hybrid-story'] }), visual('measurement', 'jaw', 'Use an image contour guide rather than implying a skeletal measurement.', { view: 'three-quarter', styles: ['measurement-explainer'] })] },
    { id: 'expression', title: 'Look at expression', role: 'explanation', text: 'Expression changes the picture again. A smile lifts the cheeks and changes the mouth, so neutral and smiling photos are different comparisons.', priority: 60, visuals: face('mouth') },
    { id: 'comparison', title: 'Make comparisons useful', role: 'explanation', text: 'For your own Mogging comparisons, use clear photos with similar lighting, distance and expression. Consistent photos make the differences easier to understand.', priority: 55, visuals: [visual('report', 'overall', 'Support the natural brand mention with the report rather than a separate advertising card.', { focus: 'features' }), visual('grid', 'overall', 'Compare feature categories in a calm timeline grid.', { styles: ['hybrid-story'] })] },
    { id: 'takeaway', title: 'Keep the whole face in view', role: 'takeaway', text: 'Check the photograph before deciding what changed in the face.', priority: 100, visuals: [visual('portrait', 'overall', 'Resolve the opening question on the same portrait; preserve image continuity.')] },
  ]
  rows.splice(2, 0, rows.splice(1, 1)[0])
  const script = createVideoScript(rows.map(row => ({ id: row.id, narration: row.text, delivery: deliverySchema.parse({ direction: row.role === 'cta' ? 'A brief, friendly invitation, approximately three seconds. Same voice and energy as the surrounding explanation; no advertising voice.' : 'Speak naturally as one continuous explanation. Complete the thought; no shot announcements or forced dramatic pauses.', pauseAfterMs: row.role === 'cta' ? 400 : 140, emphasis: [] }) })))
  return validateProductionScript({ ...script, references: [], cues: script.cues.map((cue, index) => ({ ...cue, section: scriptSectionSchema.parse({ id: rows[index].id, title: rows[index].title, role: rows[index].role, priority: rows[index].priority, dependsOn: [], visuals: rows[index].visuals }) })) })
}
