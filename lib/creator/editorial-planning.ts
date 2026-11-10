import {editorialAccentProfiles} from './editorial-scenes'
import type { EditorialPresentation } from './editorial-scenes'
import type { VisualDecision } from './video-director'
import type { VideoDirection } from './video-composition'
import type { ScriptSection } from './video-script'
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
  motion: [
    'The portrait, feature tray, caption, source card and cursor have independent lifetimes. Caption splits never restart the treatment.',
    'Use one dominant action at a time: target → acquire → demonstrate → hold → restore. Bind the arrival to its exact recorded phrase, not a guessed fraction of the sentence.',
    'Grids hold the evidence long enough to compare. The selected tile expands from its own position; neighboring tiles leave before a new argument begins.',
    'Rulers, protractors, drafting tools and line art use neutral grays. White guide ink stays softly diffused. Text carriers are compact, white, rounded and minimally shadowed. Keep natural image colour.',
    'Use actual supplied angles as angles, not controlled edits. Texture changes require registered photo evidence; a cursor or tool prop never proves a change.',
  ],
} as const

/** Select a treatment for the argument; never manufacture the supporting evidence. */
export function planEditorialPresentation(text:string,feature:SemanticBeat['feature'],variation:number,hasReference=false):EditorialPresentation|undefined{
  if(/\b(?:edited?|retouch\w*|before and after|original and|versions?)\b/i.test(text))return
  if(/\b(?:scores?|out of ten|out of 10)\b/i.test(text) || variation%4===0)return
  const variant=variation%6
  let kind:EditorialPresentation['kind']='callout'
  if(/\b(?:monochrome|black[- ]and[- ]white|grayscale)\b/i.test(text) && /\bcolou?r\b/i.test(text))kind='color-reveal'
  else if(/\b(?:ruler|protractor|measurement alone|numbers alone)\b/i.test(text))kind='drafting'
  else if(hasReference && /\b(?:three views|three angles)\b/i.test(text))kind='evidence-fan'
  else if(hasReference && /\b(?:side view|profile|turns?|different views)\b/i.test(text))kind='orbit'
  else if(hasReference && /\b(?:side by side|compare both|both pictures)\b/i.test(text))kind='comparison'
  else if(/\b(?:close[- ]up|closer|detail|texture)\b/i.test(text))kind='reference-inset'
  else if(/\b(?:colou?r|tone|contrast)\b/i.test(text))kind='swatch-strip'
  else if(/\b(?:work together|these features|these details|one by one)\b/i.test(text))kind='feature-tray'
  else if(/\b(?:outline|contour|silhouette)\b/i.test(text) && variation%3===0)kind='line-art'
  else if(variation%3===1)kind='network'
  else if(variation%3===2 && feature==='whole')kind='card-morph'

  const accents=['network','line-art','drafting','comparison','orbit','card-morph'].includes(kind)?undefined:[...editorialAccentProfiles[variant]]
  return {kind,variant,referenceIndex:0,imageIds:[],accents}
}

/** Applied after saved-story directions, so the production UI uses the same library as previews. */
export function referenceEditorialDirection(direction:VideoDirection,beat:SemanticBeat,section:ScriptSection,images:GeneratorImage[],variation:number,decision?:VisualDecision):VideoDirection{
  if(direction.featureStudy?.edit && direction.featureStudy.editMode==='photo' && images.some(image=>direction.featureStudy!.images.includes(image.id) && image.retouch?.baselineImageId===direction.imageId))return {...direction,featureStudy:{...direction.featureStudy,tool:direction.featureStudy.topic==='facial-hair'?'clipper':'brush'}}
  if(direction.kind!=='portrait' || direction.presentation || direction.scoreCallouts?.length || direction.featureStudy?.edit || direction.featureStudy?.opening || ['compare','grid','evidence'].includes(direction.featureStudy?.layout??'') || direction.photoStudy || direction.study || direction.profileStudy || direction.portraitCrop || direction.portraitFX || ['cta','product','takeaway'].includes(section.role))return direction
  const source=images.find(image=>image.id===direction.imageId)
  if(!source || source.retouch || /profile|three-quarter/.test(source.id))return direction
  const references=images.filter(image=>image.id!==source.id && !image.retouch && /three-quarter|profile/.test(image.id)).slice(0,2)
  let presentation=planEditorialPresentation(beat.quote,beat.feature,variation,references.length>0)
  if(!presentation)return direction
  if(presentation.kind==='evidence-fan' && references.length<2)return direction
  if(presentation.kind==='callout' && variation%3===2)presentation={...presentation,kind:'cursor-tour'}
  const names=[['brows','brows?|eyebrows?'],['eyes','eyes?'],['lips','lips?|mouth'],['jaw','jaw(?:line)?|chin'],['nose','nose'],['cheeks','cheekbones?|cheeks?']] as const
  const named=names.flatMap(([feature,pattern])=>{const match=new RegExp(`\\b(?:${pattern})\\b`,'i').exec(beat.quote);return match?[{feature,anchor:match[0],index:match.index}]:[]}).sort((a,b)=>a.index-b.index)
  const beats=named.length>1?named.map(({feature,anchor})=>({feature,anchor})):[{feature:beat.feature,anchor:beat.quote.split(/\s+/).slice(0,6).join(' ')}]
  const result={...direction,presentation:{...presentation,feature:beat.feature,imageIds:references.map(image=>image.id),beats},featureStudy:undefined,portraitProgram:undefined,overlay:'none' as const}
  if(decision)decision.reason+=` Editorial treatment: ${presentation.kind}; references retain their actual photographic identity.`
  return result
}
