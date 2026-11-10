import type { VideoScriptExample } from './video-script-examples'
import type { VideoDirection } from './video-composition'
import { scriptToPlan } from './script-edit'
import { glassOverlaySchema, portraitLightingSchema } from './video-portrait-effects'
import { voiceDirection } from './video-speech'

const photo = (subject: 'marlon' | 'johnson', view: string, width: number, height: number, revision = '') => ({ id: `${subject}-${view}`, name: `${subject === 'marlon' ? 'Marlon' : 'Dwayne Johnson'} · ${view} · supplied reference`, dataUrl: `/creator/examples/user-studies/${subject}-${view}.png${revision ? `?v=${revision}` : ''}`, width, height, status: 'ready' as const, landmarks: null })
const portrait = (imageId: string, categoryId = 'overall', profileStudy?: VideoDirection['profileStudy'], editorial: VideoDirection['editorial'] = categoryId === 'overall' ? 'context' : ['eyes', 'cheeks'].includes(categoryId) || profileStudy ? 'compare' : 'detail'): VideoDirection => ({ kind: 'portrait', imageId, categoryId, profileStudy, editorial })
const references: Record<'marlon' | 'johnson', NonNullable<VideoDirection['study']>['references']> = {
  marlon: [{ id: 'width', imageId: 'marlon-angle', categoryId: 'cheeks', label: 'Upper frame' }, { id: 'taper', imageId: 'marlon-angle', categoryId: 'jaw', label: 'Lower taper' }, { id: 'softness', imageId: 'marlon-front', categoryId: 'mouth', label: 'Soft contrast' }],
  johnson: [{ id: 'frame', imageId: 'johnson-front', categoryId: 'jaw', label: 'Lower frame' }, { id: 'border', imageId: 'johnson-front', categoryId: 'cheeks', label: 'Surface contour' }, { id: 'expression', imageId: 'johnson-angle', categoryId: 'mouth', label: 'Expression' }],
}
const chapter = (subject: 'marlon' | 'johnson', operation: NonNullable<VideoDirection['study']>['operation'], activeId: string, imageId?: string): VideoDirection => {
  const reference = references[subject].find(reference => reference.id === activeId)!
  return { ...portrait(imageId ?? reference.imageId, reference.categoryId, undefined, operation === 'establish' ? 'context' : operation === 'inspect' ? 'detail' : 'compare'), portraitFX: { overlay: glassOverlaySchema.parse({ pattern: operation === 'inspect' ? 'dashed' : 'dotted', regions: operation === 'planes' }), ...(operation === 'light' ? { lighting: portraitLightingSchema.parse({ target: 'cheeks', side: subject === 'marlon' ? 'right' : 'left', lightX: subject === 'marlon' ? .7 : -.9, color: 'selective' }) } : {}) }, study: { id: `${subject}-argument`, operation, activeId, references: references[subject] } }
}
const instruments = (items: Array<[string, string, 'width' | 'taper' | 'contour' | 'expression']>): VideoDirection => ({ kind: 'explainer', graphic: { layout: 'pillars', tone: 'light', variant: 0, items: items.slice(0, 1).map(([label, detail, diagram], index) => ({ id: `feature-${diagram}`, label, detail, diagram, value: '', role: 'main' })), footnote: '' } })
const beats = (values: Array<[string, VideoDirection, string?]>): Array<[string, VideoDirection]> => values.map(([text, direction, delivery]) => [text, { ...direction, delivery: { direction: delivery ?? 'Clear, conversational explanation; make the contrast easy to follow.', emphasis: [], pauseAfterMs: 100 } }])

export const subjectStudies: VideoScriptExample[] = [
  {
    title: 'Marlon · One face, three perspectives', recipe: 'portrait-audit' as const, readingPace: 175, voice: voiceDirection('editorial'),
    images: [photo('marlon', 'front', 1200, 1200, '20261027'), photo('marlon', 'angle', 1200, 675), photo('marlon', 'context', 462, 663, '20261027')],
    reference: 'C + D · fast portrait audit, angled contour, app proof',
    beats: beats([
      ['Would a bigger jaw actually improve this face? Marlon shows why that question is incomplete.', chapter('marlon', 'establish', 'width', 'marlon-context'), 'Curious, lightly upbeat; let the question land without a sales-hook delivery.'],
      ['A useful report separates the features before judging how they work together.', { kind: 'report', imageId: 'marlon-front', categoryId: 'overall', focus: 'feature:0', emphasis: 'section-lift' }],
      ['His cheeks establish the upper width. Beneath them, the lower face narrows toward the chin.', chapter('marlon', 'planes', 'width')],
      ['The jaw is defined, but it does not compete with the cheeks for width. Its outline resolves that upper frame.', chapter('marlon', 'contour', 'taper')],
      ['The cheek hollow makes the border readable. Dramatic light strengthens the contrast without creating its shape.', chapter('marlon', 'light', 'width')],
      ['Width and definition describe different things: the space occupied, and the clarity of the edge.', instruments([['Width', 'The space a feature occupies', 'width'], ['Definition', 'The clarity of its border', 'contour']])],
      ['A taper leads the eye downward; a broad frame holds it outward. Neither works independently of the surrounding features.', instruments([['Upper frame', 'Width establishes the silhouette', 'width'], ['Lower taper', 'The chin resolves the frame', 'taper']])],
      ['Now the softer counterpoint: full lips break the sequence of angular contours instead of repeating it.', chapter('marlon', 'inspect', 'softness'), 'A warm, contained turn; emphasize counterpoint, not attractiveness.'],
      ['That contrast matters. A face can lose its hierarchy when every feature demands the same kind of attention.', chapter('marlon', 'compare', 'softness')],
      ['Put the three details together: width above, taper below, softness in the middle. Their different roles are the point.', chapter('marlon', 'recap', 'softness')],
      ['Bigger is not automatically better. Ask what a change does to those relationships.', chapter('marlon', 'establish', 'width', 'marlon-context'), 'Quiet conviction; resolve the opening question rather than starting a new slogan.'],
      ['Explore your own proportions with Mogging.', chapter('marlon', 'establish', 'width', 'marlon-context'), 'A brief, natural invitation.'],
    ]),
  },
  {
    title: 'Dwayne Johnson · Contour, structure, expression', recipe: 'hybrid-story' as const, readingPace: 165, voice: voiceDirection('expert'),
    images: [photo('johnson', 'front', 2000, 3000), photo('johnson', 'studio', 647, 972), photo('johnson', 'angle', 1920, 1440)],
    reference: 'B + E · forensic visual explainer and report proof',
    beats: beats([
      ['Why does Johnson’s face read as substantial without a pointed chin? Width is only part of the explanation.', chapter('johnson', 'establish', 'frame'), 'A precise question, delivered with documentary calm.'],
      ['A useful report separates shape, contour and expression rather than collapsing them into one impression.', { kind: 'report', imageId: 'johnson-front', categoryId: 'overall', focus: 'feature:1', emphasis: 'section-lift' }],
      ['The broad lower frame finishes in a rounded chin, not a narrow tip.', chapter('johnson', 'planes', 'frame')],
      ['Follow the border: the jaw turns near its back corner, then continues forward. Clarity of that edge is different from width.', chapter('johnson', 'contour', 'frame')],
      ['One describes space; the other describes a boundary. A wider face need not have a sharper boundary.', instruments([['Width', 'Space occupied by the frame', 'width'], ['Contour', 'Clarity of the visible edge', 'contour']])],
      ['Light changes how distinctly the cheek and jaw surfaces separate. It cannot tell us the exact bones underneath.', chapter('johnson', 'light', 'border')],
      ['Structure provides the frame; expression changes how its surfaces gather and fold.', instruments([['Contour', 'The frame remains the reference', 'contour'], ['Expression', 'Surface shapes move around it', 'expression']])],
      ['Expression changes the reading. Smiling lifts the cheeks and spreads the mouth across that lower frame.', chapter('johnson', 'inspect', 'expression')],
      ['That is surface movement, not evidence that the underlying framework changed between photographs.', chapter('johnson', 'compare', 'expression')],
      ['Compare those details together: a broad lower frame, a readable contour, and an expression that changes the surface.', chapter('johnson', 'recap', 'expression')],
      ['Not simply a stronger jaw: width, contour and expression supporting the same face.', chapter('johnson', 'establish', 'frame', 'johnson-studio'), 'Resolve the original question without switching into advertising delivery.'],
      ['Understand your own proportions with Mogging.', chapter('johnson', 'establish', 'frame', 'johnson-studio'), 'Understated invitation, no change into advertising voice.'],
    ]),
  },
].map(authoredExample)

export const portraitEffectsLab = authoredExample({
    title: 'Portrait effects · Light, glass and proportion', recipe: 'portrait-audit' as const, readingPace: 165, voice: voiceDirection('expert'),
    images: [photo('johnson', 'front', 2000, 3000)],
    reference: 'Portrait effects lab · registered glass, 2.5D light and reversible liquify',
    beats: beats([
      ['Why can the same face look so different without its structure changing?', { ...portrait('johnson-front', 'overall'), portraitFX: { overlay: glassOverlaySchema.parse({ pattern: 'dashed', regions: true }) } }],
      ['A report gives us a reference, but a photograph still contains light, expression and perspective.', { kind: 'report', imageId: 'johnson-front', categoryId: 'overall', focus: 'feature:0' }],
      ['The brow is a contour rather than a straight line; its corners give us useful reference points.', { ...portrait('johnson-front', 'brows'), portraitFX: { overlay: glassOverlaySchema.parse({ pattern: 'dotted' }) } }],
      ['A narrower nose would change the balance of the central features, not simply improve a number.', { kind: 'portrait', imageId: 'johnson-front', categoryId: 'nose', photoStudy: { feature: 'nose', mode: 'pinch', amount: .24 } }],
      ['More cheek width would also change the relationship between the upper frame and the chin.', { kind: 'portrait', imageId: 'johnson-front', categoryId: 'cheeks', photoStudy: { feature: 'cheeks', mode: 'stretch', axis: 'x', amount: .24 } }],
      ['Moving a contour is not the same as revealing it through light.', { ...portrait('johnson-front', 'cheeks', undefined, 'context'), portraitFX: { lighting: portraitLightingSchema.parse({ target: 'cheeks', lightX: -.7, side: 'left', color: 'selective', ambientEv: -2, intensity: 2.5 }) } }],
      ['A grazing light separates the edge, while a frontal source softens the contrast.', { ...portrait('johnson-front', 'jaw', undefined, 'context'), portraitFX: { lighting: portraitLightingSchema.parse({ preset: 'rim', target: 'whole', radius: 1.5, ambientEv: -1.6, intensity: 2.8 }) } }],
      ['Remove color from one side and the tonal pattern becomes easier to compare.', { ...portrait('johnson-front', 'overall', undefined, 'context'), portraitFX: { lighting: portraitLightingSchema.parse({ preset: 'split', target: 'whole', radius: 1.5, color: 'split-mono', ambientEv: -.8 }) } }],
      ['Even a small change around the eyes can alter the hierarchy of the whole face.', { kind: 'portrait', imageId: 'johnson-front', categoryId: 'eyes', photoStudy: { feature: 'eyes', mode: 'drag', axis: 'y', amount: .2 } }],
      ['These are reversible illustrations, not predictions; relationships matter more than chasing an isolated ideal.', { ...portrait('johnson-front', 'overall'), portraitFX: { overlay: glassOverlaySchema.parse({ pattern: 'solid', regions: true }) } }],
    ]),
  })

function authoredExample({ beats, ...example }: Omit<VideoScriptExample, 'script' | 'durationSeconds' | 'directions'> & { beats: Array<[string, VideoDirection]> }): VideoScriptExample {
  const script = beats.map(([text]) => text).join('\n')
  let cue = 0
  const directions = Object.fromEntries(beats.flatMap(([text, direction]) => scriptToPlan(text, example.readingPace).scenes.map(() => [`script-${cue++}`, direction])))
  return { ...example, script, disclosure: 'Report values illustrative', durationSeconds: Math.round(scriptToPlan(script, example.readingPace).duration), directions }
}
