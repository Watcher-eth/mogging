import {editorialAccentProfiles} from './editorial-scenes'
import type { EditorialPresentation } from './editorial-scenes'
import type { VisualDecision } from './video-director'
import type { VideoDirection } from './video-composition'
import type { ScriptSection } from './video-script'
import { visualFeatures } from './video-semantics'
import type { SemanticBeat } from './video-semantics'
import type { GeneratorImage } from './content-generator'

export const referenceEditorialBrief = {
  sources: [
    { id:'trust-contact-sheets', title:'Too hot to trust?', url:'https://www.youtube.com/watch?v=3YBVWun37tA', study:'docs/qoves-trust-reference.md' },
    { id:'soft-tissue-overlays', title:'Why is everyone obsessed with Bad Bunny’s aesthetics?', url:'https://www.linkedin.com/posts/qoves_why-is-everyone-obsessed-with-bad-bunnys-activity-7447936678704422912-i9_T' },
    { id:'evidence-hinge', title:'Do you have a masculine or feminine face?', url:'https://www.linkedin.com/posts/qoves_do-you-have-a-masculine-or-feminine-face-activity-7445080324637696000-7QDl' },
    { id:'progressive-face-cues', title:'Jealousy-inducing face', url:'https://www.linkedin.com/posts/qoves_jealousy-inducing-face-activity-7457103114370994176-xhqm' },
    { id:'eye-window', title:'Cute vs Hot Eyes', url:'https://www.linkedin.com/posts/qoves_cute-vs-hot-eyes-activity-7473406567426449408-xxqO' },
    { id:'paired-philtrum', title:'How the philtrum can totally change the face', url:'https://www.linkedin.com/posts/qoves_how-the-philtrum-can-totally-change-the-face-activity-7473006315569594370-lp6t' },
    { id:'paired-rows', title:'Taller people have different beauty than preferences to short people', url:'https://www.linkedin.com/posts/qoves_taller-people-have-different-beauty-than-activity-7445779780530077696-zcRi' },
    { id:'brow-perception', title:'How Your Brows Change How People Perceive You', url:'https://www.tiktok.com/@qovesstudio/video/7678657290710437140', study:'docs/qoves-brow-perception.md' },
    { id:'elvis-counterexample', title:'Clavicular says Elvis is a 5?', url:'https://www.tiktok.com/@qovesstudio/video/7704341383821217045', study:'docs/qoves-elvis-reference.json' },
    { id:'chalamet-tradeoff', title:'Masculinizing Chalamet', published:'2026-11-02', url:'https://www.tiktok.com/@qovesstudio/video/7703401397919747349', study:'docs/qoves-round2-reference.json' },
    { id:'lipstick-context', title:'Lipstick Theory', published:'2026-11-01', url:'https://www.tiktok.com/@qovesstudio/video/7703012514316979476', study:'docs/qoves-round2-reference.json' },
  ],
  structures: [
    { id:'cumulative-tradeoff', hook:'Offer a person-specific visible counterfactual or preview, rather than a vague question.', arc:['Establish the baseline and preview the outcome','Explain a few cumulative changes with the baseline persistent','Separate the named dimension from a better/worse judgment','Return to a fair comparison and resolve the opening'], visual:['Registered reveal','Persistent feature tray and local cursor','Original versus reviewed edit','Three-way comparison only with three genuine assets'], cut:'Keep preview, one complete mechanism and the concluding distinction. A cumulative state requires its preceding change or an explicit reset.' },
    { id:'prediction-context', hook:'Offer a fair, visible choice and give the viewer time to form a prediction.', arc:['Show evidence-equivalent choices','Expand the relevant tile when the answer arrives','Explain the mechanism with reviewed evidence','Introduce the exception or a changed context','Resolve what the finding does and does not explain'], visual:['Choice grid and selection indicator','Shared-tile expansion','Reviewed source card or document lift','Photograph colour samples or supplied variants','Context inset or genuine source footage'], cut:'Keep the choice, its evidence, the important exception and the payoff. Reorder independent examples, never detach a result from its conditions.' },
    { id:'claim-counterexample', hook:'Attribute a verified claim, then introduce a concrete counterexample.', arc:['Verified claim and recognizable person','Visible evidence that tests the claim','One precise distinction with appropriate sources','Return to the original proposition'], visual:['Attributed chip','Persistent portrait and comparison','Tracks, links, local feature markers','A readable source stack only during supported claims'], cut:'Retain attribution, counterexample, evidence and resolution. Do not cut a source qualifier or treat an individual score as research.' },
  ],
  writing: [
    'Choose the person-specific argument before the visual format. Ground cultural context in verified sources; never infer personality, health or hormones from a face.',
    'Sound like a conversational editorial analysis: concrete nouns and active verbs, varied sentence lengths, a quick observation followed by a useful explanation. Avoid fake suspense, announcer language, forced slang and repetitive what-if hooks.',
    'Use the source structures as principles, never sentence-by-sentence paraphrases or a copied narrator persona. Do not repeat the same mechanism with a new celebrity name.',
    'A prediction/reveal story keeps the answer out of its opening and delays it until roughly the middle. A demonstration may show the outcome first: its question is why the impression changes, not what the edit is.',
    'Keep one or two real, source-bound scores only when they advance the argument. Keep scientific attribution visual and attach reviewed claim IDs to the exact sentence; do not inherit unverified claims from a reference video.',
    'Each removable example must restate its subject and relation. Mark dependencies for cumulative changes, pronouns, comparisons, withheld answers and qualifications. Every shorter cut keeps a hook, intelligible evidence, payoff and a natural contextual Mogging.com invitation.',
    'Write the argument and visual worksheet together: exact phrase, source asset IDs, baseline, variable, protected features, feature anchors, reveal word, hold and exit state. Mark missing registered edits and footage; never fabricate them.',
  ],
  quality: {
    captions:'Use 90% of the existing photographic caption size, retaining the same word clock, contrast sampling, safe margins and report caption placement.',
    rhythm:'Establish → acquire → demonstrate → hold → resolve. Alternate full portraits, local details, shared-tile compositions and clean holds. Never cycle effects merely because a sentence ends.',
    causality:'The cursor press or drop starts the overlay clock. Let an acquisition settle before adding links; stagger angle legs and then their arc. Preserve the source identity and eye line.',
    variations:'Change framing, entry direction, cursor trajectory, feature selection and overlay combinations within an eligible treatment; balance treatment families across a story. Never change anatomy or evidence to manufacture variety.',
    review:'Inspect the opening, every transition boundary, reveal and reading hold at normal speed. Compare crops, click causality, text size, colour preservation and continuity against the source, not just a contact sheet.',
  },
  ingestion: {
    required:['source URL and reviewed date','time-coded shot ranges','observed action versus inference','exact phrase and feature anchor','required asset and baseline identities','entry, click, reveal, hold and exit timings','shared elements across cuts','safe feature substitutions','implemented renderer and remaining fidelity gaps'],
    rule:'Add a reviewed technique to its existing owner and compatible pool. Keep unsupported assets explicit. A new reference should expand the grammar, never add another independent rendering pipeline.',
  },
  motion: [
    'The portrait, feature tray, caption, source card and cursor have independent lifetimes. Caption splits never restart the treatment.',
    'Use one dominant action at a time: target → acquire → demonstrate → hold → restore. Bind the arrival to its exact recorded phrase, not a guessed fraction of the sentence.',
    'For a location cue, open a tracked aperture on the named feature. For a relationship, let the first detail settle before the second joins it. Keep the full portrait available as context and use a single source for comparisons between regions.',
    'For a perception hook, start with one spoken attribute over the portrait. Use small neutral reactions or a continuous dot-to-line pan. Reserve an expression rail or an animated inset for a later explanatory beat.',
    'Use a compact dark-glass citation only on the supported phrase. Shrink the same portrait into a face crop or a phone before revealing separate footage inside it.',
    'For a list of related features, hold the face and accumulate small callouts as each feature is spoken. For a turn, keep one evidence card anchored and hinge in a genuine alternate view on its cue.',
    'Grids hold the evidence long enough to compare. The selected tile expands from its own position; neighboring tiles leave before a new argument begins.',
    'Use a contact sheet or center-weighted lineup to compare authentic views. A radial board maps where reference images sit in a composition, with no scores implied. Reuse the photograph as it travels between compatible treatments.',
    'Rulers, protractors, drafting tools and line art use neutral grays. White guide ink stays softly diffused. Text carriers are compact, white, rounded and minimally shadowed. Keep natural image colour.',
    'Use actual supplied angles as angles, not controlled edits. Texture changes require registered photo evidence; a cursor or tool prop never proves a change.',
  ],
} as const

type EditorialKind = EditorialPresentation['kind']
const featureNames = /\b(?:eyebrows?|brows?|upper lids?|lower lids?|eyes?|lips?|mouth|jawline|jaw|chin|nose|cheekbones?|cheeks?|philtrum|freckles?|ears?|beard|facial hair|moustache|mustache)\b/gi
function namedFeatures(text:string){
  return Array.from(text.matchAll(featureNames),match=>{
    const anchor=match[0]
    const name=anchor.toLowerCase()
    const feature:SemanticBeat['feature']=
      /brow/.test(name)?'brows':/eye|lid/.test(name)?'eyes':/lip|mouth/.test(name)?'lips':
        /jaw|chin/.test(name)?'jaw':/cheek/.test(name)?'cheeks':/freckle/.test(name)?'freckles':
          /^(?:beard|facial hair|moustache|mustache)$/.test(name)?'facial-hair':/ear/.test(name)?'ears':name==='nose'?'nose':'philtrum'
    return {feature,anchor}
  }).slice(0,5)
}
const distinctFeatures = (text:string) => namedFeatures(text).filter((item,i,items)=>items.findIndex(other=>other.feature===item.feature)===i)
const colorCue = /\b(?:colou?r|tone|contrast|monochrome|black[- ]and[- ]white)\b/i
const viewCue = /\b(?:profile|side view|side angle|three[- ]quarter(?: view)?|another angle|different angle|different views|turns? to the side)\b/i

export function referenceFeatureStack(text:string,variation:number):EditorialPresentation|undefined {
  if (/\b(?:before|after|edit(?:ed|s)?|chang(?:e|ed)|scores?|out of ten)\b/i.test(text)) return
  const beats=distinctFeatures(text)
  if (beats.length<3 || variation%3===0) return
  return {kind:'feature-stack',variant:variation%6,referenceIndex:0,imageIds:[],feature:'whole',beats,...(colorCue.test(text)?{sampleColors:true}:{})}
}
const relation = /\b(?:between|relative to|against|beside|compared with|compared to|sits (?:inside|below|above)|frames?)\b/i
const editorialFamilies: ReadonlyArray<ReadonlyArray<EditorialKind>> = [
  ['feature-tray', 'cursor-tour', 'feature-aperture', 'paired-detail', 'glass-phone'],
  ['tile-expand', 'focus-grid', 'card-morph', 'spotlight-sheet', 'face-window'],
  ['drafting', 'line-art', 'view-cone', 'dash-timeline', 'ink-pan'],
  ['network', 'feature-stack', 'callout', 'feature-checklist', 'portrait-radar'],
  ['reference-hinge', 'reference-flip', 'evidence-fan', 'orbit', 'context-triptych', 'comparison'],
  ['swatch-strip', 'color-reveal', 'document-lift', 'tool-sweep', 'reaction-fountain', 'animated-cutaway', 'expression-rail'],
]

function editorialFamily(kind: EditorialKind) {
  return editorialFamilies.findIndex(family => family.includes(kind))
}

/** Favor the take's visual grammar, but cycle through every suitable treatment on later takes. */
function chooseEditorialTreatment<T extends { kind: EditorialKind }>(
  choices: T[], variation: number, history: EditorialKind[], family: number,
) {
  const fresh = choices.filter(({ kind }) => !history.slice(-2).includes(kind))
  const eligible = fresh.length ? fresh : choices
  const preferred = eligible.filter(({ kind }) => editorialFamily(kind) === family)
  const rest = eligible.filter(({ kind }) => editorialFamily(kind) !== family)
  const previousFamily = history.length ? editorialFamily(history.at(-1)!) : -1
  const ordered = [...preferred, ...rest.filter(({ kind }) => editorialFamily(kind) !== previousFamily),
    ...rest.filter(({ kind }) => editorialFamily(kind) === previousFamily)]
  return ordered[Math.floor(variation / 6) % ordered.length]
}
const impression = /\b(?:intimidat(?:ing|ion|e)|approachable|friendly|stern|softer|softer look|intense|intensity|severe|serious|calm|dramatic|confiden(?:t|ce)|relaxed|playful|angry|trustworthy|welcoming|innocent|exhausted|surprised|hard to miss|mood)\b/gi
const illustration = /\b(?:cartoons?|animat(?:ed|ion)|illustration|characters?)\b/i
const phoneView = /\b(?:on (?:a|your) (?:phone|screen)|selfies?|phone camera|in the frame)\b/i
const detailView = /\b(?:close[- ]up|zoom|crop|closer look|focus on|look at the)\b/i
const trackingCue = /\b(?:across|from one side|towards?|outer (?:corner|tail)s?|inner (?:corner|edge)s?|eye line|lateral|tail|aligned|angles?|tilts?|spacing|in line|frame(?:s)? (?:the|around))\b/i
const editCue = /\b(?:before and after|original and edited|scores?|out of (?:ten|10))\b/i

/** Give a whole spoken section one entrance, hold and exit, across caption fragments. */
export function referencePortraitMotion(text:string,feature:SemanticBeat['feature'],variation:number,history:EditorialKind[]=[]):EditorialPresentation|undefined {
  if (editCue.test(text)) return
  const named=distinctFeatures(text)
  const target=feature==='whole' ? named.find(()=>true)?.feature??feature : feature
  const reactions=[...text.matchAll(impression)].map(match=>match[0])
  const v=variation%6
  const options: Array<{kind:EditorialKind; anchor?:string}> = []
  const add=(kind:EditorialKind,anchor?:string)=>options.push({kind,anchor})
  const featureCue=named.find(item=>item.feature===target)?.anchor
  if (illustration.test(text) && (target==='brows' || target==='eyes')) add('animated-cutaway',illustration.exec(text)?.[0])
  if (phoneView.test(text)) add('glass-phone',phoneView.exec(text)?.[0])
  if (detailView.test(text) && target!=='whole') add('face-window',featureCue??detailView.exec(text)?.[0])
  if (reactions.length && target!=='whole') {
    add('reaction-fountain',reactions[0])
    if(target==='brows' || target==='eyes')add('expression-rail',featureCue??reactions[0])
  }
  if ((target === 'brows' || target === 'eyes') && trackingCue.test(text)) {
    add('dash-timeline', trackingCue.exec(text)?.[0])
  }
  if (target !== 'whole' && featureCue) add('ink-pan', featureCue)
  if(named.length===2 && !relation.test(text))add('feature-checklist',named[0].anchor)
  if (!options.length || (v===1 || v===5) && options.length===1) return
  const { kind, anchor } = chooseEditorialTreatment(options, variation, history, v)
  const uniqueReactions=[...new Map(reactions.map(word=>[word.toLowerCase(),word])).values()].slice(0,3)
  const beats=kind==='reaction-fountain' ? uniqueReactions.map(word=>({feature:target,anchor:word,label:word[0].toUpperCase()+word.slice(1).toLowerCase()}))
    : kind==='feature-checklist'?named.map(item=>({...item,label:item.anchor[0].toUpperCase()+item.anchor.slice(1).toLowerCase()}))
    : anchor?[{feature:target,anchor}]:undefined
  return {kind,variant:v,feature:target,imageIds:[],referenceIndex:0,
    beats}
}
const gridKinds: EditorialKind[] = ['focus-grid', 'tile-expand', 'evidence-fan', 'feature-tray']

/** Rank treatments by the visual evidence, then give each take a different visual vocabulary. */
export function planEditorialPresentation(text:string,feature:SemanticBeat['feature'],variation:number,hasReference=false,history:EditorialKind[]=[],family=variation%6,registeredEvidence=true):EditorialPresentation|undefined {
  if (/\b(?:before and after|original and edited|scores?|out of ten|out of 10)\b/i.test(text)) return
  const variant=variation%6
  const words=text.trim().split(/\s+/).length
  const named=registeredEvidence?namedFeatures(text):[]
  const related=relation.test(text) && new Set(named.map(beat=>beat.feature)).size===2
  const featureNamed = named.some(item => item.feature === feature)
  const hasViewCue = /\b(?:three views|three angles|side view|profile|turns?|different views|another angle|both (?:pictures|portraits)|side by side)\b/i.test(text)
  const contour = /\b(?:outline|contour|silhouette|ruler|angle|spacing|ratio|width|measure\w*)\b/i.test(text)
  const viewContext = /\b(?:from the front|across (?:these |the )?portraits|same face|side angles?|turns? (?:it|the face)|photo(?:s|graphs)? (?:together|side by side))\b/i.test(text)
  const detail = detailView.test(text) || /\b(?:detail|texture)\b/i.test(text)
  const choices = new Set<EditorialKind>()

  if (hasReference && hasViewCue) {
    for (const kind of ['reference-hinge', 'evidence-fan', 'orbit', 'comparison', 'reference-inset', 'focus-grid'] as const) choices.add(kind)
    if (registeredEvidence && viewCue.test(text)) choices.add('reference-flip')
  }
  if (hasReference && registeredEvidence && (hasViewCue || viewContext)) {
    choices.add('spotlight-sheet'); choices.add('context-triptych')
    if (contour || related || viewContext) choices.add('portrait-radar')
    if (/\b(?:photos?|photographs?|portraits?|campaign)\b/i.test(text)) choices.add('document-lift')
  }
  if (related) {
    for (const kind of ['paired-detail', 'feature-aperture', 'feature-tray', 'feature-stack', 'network'] as const) choices.add(kind)
    if (hasReference && /\b(?:relationship|relative|between|proportions?)\b/i.test(text)) choices.add('portrait-radar')
  }
  if (colorCue.test(text)) {
    choices.add('swatch-strip'); choices.add('color-reveal')
    if (hasReference && /\b(?:monochrome|black[- ]and[- ]white|reference|photo)\b/i.test(text)) choices.add('document-lift')
  }
  if (contour) {
    for (const kind of ['drafting', 'line-art', 'view-cone', 'network'] as const) choices.add(kind)
    if (hasReference && /\b(?:angles?|spacing|proportions?|structure)\b/i.test(text)) choices.add('portrait-radar')
  }
  if (detail) {
    choices.add('reference-inset'); choices.add('tile-expand'); choices.add('line-art')
    if (featureNamed) choices.add('face-window')
  }
  if (!choices.size) {
    for (const kind of ['feature-tray', 'focus-grid', 'card-morph', 'tile-expand', 'view-cone', 'network', 'line-art'] as const) choices.add(kind)
  }
  if (featureNamed && feature === 'facial-hair' && /\b(?:trim|shav|clip|groom)\w*\b/i.test(text)) choices.add('tool-sweep')
  if (featureNamed) choices.add('feature-aperture')
  choices.add('cursor-tour'); choices.add('callout')
  if (!hasViewCue) choices.add('reference-inset')
  const eligible = [...choices].filter(kind => words >= 8 || (!gridKinds.includes(kind) &&
    !['orbit', 'drafting', 'line-art', 'color-reveal', 'spotlight-sheet', 'context-triptych', 'portrait-radar'].includes(kind)))
  const { kind } = chooseEditorialTreatment(eligible.map(kind => ({ kind })), variation, history, family % editorialFamilies.length)
  const accents=[...editorialAccentProfiles[variant]]
  return {kind,variant,referenceIndex:0,imageIds:[],accents,interaction:variant===2?'double-click':variant===4?'drag':'click'}
}

/** Apply after saved directions so the take owns the edit while authored evidence owns the claim. */
export function referenceEditorialDirection(direction:VideoDirection,beat:SemanticBeat,section:ScriptSection,images:GeneratorImage[],variation:number,decision?:VisualDecision,history:EditorialKind[]=[],family=variation%6):VideoDirection {
  const study=direction.featureStudy
  const variant=variation%6
  if (study?.edit || study?.opening || ['compare','grid','evidence'].includes(study?.layout??'')) {
    if (!study) return direction
    const registered=study.editMode==='photo' && images.some(image=>study.images.includes(image.id) && image.retouch?.baselineImageId===direction.imageId)
    const comparisons=['wipe','blend','spotlight'] as const
    const styles=['guide','leader','circle'] as const
    const motions=['push','pan-left','pull','pan-right','hold','pan-up'] as const
    return {...direction,featureStudy:{...study,motion:motions[family%motions.length],annotationStyle:styles[variant%styles.length],
      ...(study.edit && !study.opening ? {comparison:comparisons[family%comparisons.length]} : {}),
      ...(registered?{tool:study.topic==='facial-hair'?'clipper':'brush'}:{})}}
  }
  if (direction.kind!=='portrait' || direction.presentation || direction.scoreCallouts?.length || direction.photoStudy || direction.study || direction.profileStudy || direction.portraitFX?.lighting || ['cta','product'].includes(section.role)) return direction
  const category=direction.categoryId==='mouth'?'lips':direction.categoryId
  const feature=beat.feature==='whole' && visualFeatures.includes(category as SemanticBeat['feature'])?category as SemanticBeat['feature']:beat.feature
  const source=images.find(image=>image.id===direction.imageId)
  if (!source || source.retouch || /profile/.test(source.id)) return direction
  const cue=viewCue.exec(beat.quote)?.[0]
  const prefer=/three[- ]quarter/i.test(cue??'')?'three-quarter':/profile|side/i.test(cue??'')?'profile':''
  const references=images.filter(image=>image.id!==source.id && !image.retouch && /three-quarter|profile/.test(image.id))
    .sort((a,b)=>Number(Boolean(prefer)&&b.id.includes(prefer))-Number(Boolean(prefer)&&a.id.includes(prefer))).slice(0,2)
  let presentation=planEditorialPresentation(beat.quote,feature,variation,references.length>0,history,family)
  if (!presentation) return direction
  if (direction.portraitCrop) presentation={...presentation,kind:'reference-inset'}
  if (presentation.kind === 'context-triptych' && references.length < 2) presentation = { ...presentation, kind: 'spotlight-sheet' }
  if (presentation.kind === 'evidence-fan' && references.length < 2) presentation = { ...presentation, kind: 'reference-hinge' }
  if (presentation.kind==='card-morph' && feature!=='whole') presentation={...presentation,kind:'tile-expand'}
  if (presentation.kind==='feature-stack' && colorCue.test(beat.quote)) presentation={...presentation,sampleColors:true}
  if (presentation.kind==='reference-flip' && prefer && !references[0]?.id.includes(prefer)) presentation={...presentation,kind:'reference-inset'}
  if (presentation.kind==='reference-hinge' || presentation.kind==='reference-flip') presentation={...presentation,referenceMode:'asset',assetCaption:references[0]?.name}
  const named=namedFeatures(beat.quote)
  const distinct=distinctFeatures(beat.quote)
  const beats=presentation.kind==='reference-flip' && cue?[{feature,anchor:cue}]:
    presentation.kind==='feature-stack'?distinct:
    presentation.kind==='paired-detail'?distinct.slice(0,2):
    named.length?named:[{feature,anchor:beat.quote.split(/\s+/).slice(0,6).join(' ')}]
  history.push(presentation.kind)
  if(decision)decision.reason+=` Editorial treatment: ${presentation.kind}.`
  return {...direction,presentation:{...presentation,feature,imageIds:references.map(image=>image.id),beats},featureStudy:undefined,portraitCrop:undefined,portraitProgram:undefined,portraitFX:undefined,overlay:'none'}
}
