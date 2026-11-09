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
    'Grids hold the evidence long enough to compare. The selected tile expands from its own position; neighboring tiles leave before a new argument begins.',
    'Rulers, protractors, drafting tools and line art use neutral grays. White guide ink stays softly diffused. Text carriers are compact, white, rounded and minimally shadowed. Keep natural image colour.',
    'Use actual supplied angles as angles, not controlled edits. Texture changes require registered photo evidence; a cursor or tool prop never proves a change.',
  ],
} as const

type EditorialKind = EditorialPresentation['kind']
const editorialFamilies: ReadonlyArray<ReadonlyArray<EditorialKind>> = [
  ['feature-tray', 'cursor-tour', 'callout', 'reference-inset'],
  ['tile-expand', 'focus-grid', 'card-morph', 'reference-inset'],
  ['drafting', 'line-art', 'view-cone', 'callout'],
  ['network', 'view-cone', 'callout', 'cursor-tour'],
  ['reference-hinge', 'evidence-fan', 'orbit', 'reference-inset'],
  ['swatch-strip', 'color-reveal', 'document-lift', 'focus-grid'],
]
const gridKinds: EditorialKind[] = ['focus-grid', 'tile-expand', 'evidence-fan', 'feature-tray']

/** Rank treatments by the visual evidence, then give each take a different visual vocabulary. */
export function planEditorialPresentation(text:string,_feature:SemanticBeat['feature'],variation:number,hasReference=false,history:EditorialKind[]=[],family=variation%6):EditorialPresentation|undefined {
  if (/\b(?:before and after|original and edited|scores?|out of ten|out of 10)\b/i.test(text)) return
  const variant=variation%6
  const words=text.trim().split(/\s+/).length
  let choices: EditorialKind[]
  if (hasReference && /\b(?:three views|three angles|side view|profile|turns?|different views|another angle|both (?:pictures|portraits)|side by side)\b/i.test(text)) {
    choices=['reference-hinge','evidence-fan','orbit','comparison','reference-inset','focus-grid']
  } else if (/\b(?:colou?r|tone|contrast|monochrome|black[- ]and[- ]white)\b/i.test(text)) {
    choices=['swatch-strip','color-reveal','cursor-tour','callout','reference-inset']
  } else if (/\b(?:outline|contour|silhouette|ruler|angle|spacing|ratio|width|measure\w*)\b/i.test(text)) {
    choices=['drafting','line-art','view-cone','network','reference-inset','cursor-tour','tile-expand','callout']
  } else if (/\b(?:close[- ]up|closer|detail|texture|focus on)\b/i.test(text)) {
    choices=['reference-inset','tile-expand','cursor-tour','network','callout','line-art']
  } else {
    choices=['feature-tray','cursor-tour','focus-grid','card-morph','tile-expand','network','view-cone','callout','reference-inset','line-art']
  }
  if (words<8) choices=choices.filter(kind=>!gridKinds.includes(kind) && !['orbit','drafting','line-art','color-reveal'].includes(kind))
  if (!choices.length) choices=['callout','reference-inset']
  const fresh=choices.filter(kind=>!history.slice(-2).includes(kind))
  const eligible=fresh.length?fresh:choices
  const preferred=editorialFamilies[family%editorialFamilies.length].filter(kind=>eligible.includes(kind))
  const pool=preferred.length?preferred:eligible
  const kind=pool[Math.floor(variation/6)%pool.length]
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
    const motions=['push','pan-left','pull','pan-right'] as const
    return {...direction,featureStudy:{...study,motion:motions[family%motions.length],annotationStyle:styles[variant%styles.length],
      ...(study.edit && !study.opening ? {comparison:comparisons[family%comparisons.length]} : {}),
      ...(registered?{tool:study.topic==='facial-hair'?'clipper':'brush'}:{})}}
  }
  if (direction.kind!=='portrait' || direction.presentation || direction.scoreCallouts?.length || direction.photoStudy || direction.study || direction.profileStudy || direction.portraitFX?.lighting || ['cta','product'].includes(section.role)) return direction
  const category=direction.categoryId==='mouth'?'lips':direction.categoryId
  const feature=beat.feature==='whole' && visualFeatures.includes(category as SemanticBeat['feature'])?category as SemanticBeat['feature']:beat.feature
  const source=images.find(image=>image.id===direction.imageId)
  if (!source || source.retouch || /profile/.test(source.id)) return direction
  const references=images.filter(image=>image.id!==source.id && !image.retouch && /three-quarter|profile/.test(image.id)).slice(0,2)
  let presentation=planEditorialPresentation(beat.quote,feature,variation,references.length>0,history,family)
  if (!presentation) return direction
  if (direction.portraitCrop) presentation={...presentation,kind:'reference-inset'}
  if (presentation.kind==='evidence-fan' && references.length<2) presentation={...presentation,kind:'reference-hinge'}
  if (presentation.kind==='card-morph' && feature!=='whole') presentation={...presentation,kind:'tile-expand'}
  if (presentation.kind==='reference-hinge') presentation={...presentation,referenceMode:'asset',assetCaption:references[0]?.name}
  const names=[['brows','brows?|eyebrows?'],['eyes','eyes?'],['lips','lips?|mouth'],['jaw','jaw(?:line)?|chin'],['nose','nose'],['cheeks','cheekbones?|cheeks?']] as const
  const named=names.flatMap(([feature,pattern])=>{const match=new RegExp(`\\b(?:${pattern})\\b`,'i').exec(beat.quote);return match?[{feature,anchor:match[0],index:match.index}]:[]}).sort((a,b)=>a.index-b.index)
  const beats=named.length>1?named.map(({feature,anchor})=>({feature,anchor})):[{feature,anchor:named[0]?.anchor??beat.quote.split(/\s+/).slice(0,6).join(' ')}]
  history.push(presentation.kind)
  if(decision)decision.reason+=` Editorial treatment: ${presentation.kind}.`
  return {...direction,presentation:{...presentation,feature,imageIds:references.map(image=>image.id),beats},featureStudy:undefined,portraitCrop:undefined,portraitProgram:undefined,portraitFX:undefined,overlay:'none'}
}
