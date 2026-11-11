import { documentaryVariationCount } from './video-documentary-plan'
import type { GeneratorImage } from './content-generator'
import { profileFeatureForText } from './video-profile'
import { createProductionDraft } from './production-drafts'
import { productionPolicy, productionCut, productionTimeline, productionWritingBrief } from './video-production'
import { videoSize } from './video-layout'
import type { VideoDirection, VideoRecipe } from './video-composition'
import type { VideoScriptExample } from './video-script-examples'
import editorialCatalog from '../../public/creator/round3-catalog.json'
import { scriptToPlan } from './script-edit'
import { voiceDirection } from './video-speech'
import { subjectStudies } from './video-subject-studies'

// Creator styles are the existing rendering recipes, with one vocabulary in the UI.
export const creatorVideoStyles = [
  { id: 'portrait-audit', label: 'Portrait study', detail: 'Photo-led. Close-ups, contours and gentle camera moves.' },
  { id: 'report-led', label: 'App walkthrough', detail: 'Report-led. Scrolling results and focused feature cards.' },
  { id: 'measurement-explainer', label: 'Feature breakdown', detail: 'Detail-led. Face guides, measurements and clear explanations.' },
  { id: 'feature-study', label: 'Feature study', detail: 'One feature at a time. Drawn notes, controlled face edits and continuous photo grids.' },
  { id: 'hybrid-story', label: 'Visual story', detail: 'Story-led. Portraits, graphic comparisons and app proof.' },
  { id: 'editorial-story', label: 'Evidence-led editorial', detail: 'Persistent portraits, feature trays, comparison grids and word-aligned evidence.' },
  { id: 'sculpture-study', label: 'Cephra sculpture study', detail: 'Continuous 3D morphs, registered constructions and studio-lit material studies.' },
  { id: 'documentary-studio', label: 'Documentary Studio', detail: 'Cinematic reconstruction, projected evidence, and archival cuts.' },
] as const satisfies ReadonlyArray<{ id: VideoRecipe; label: string; detail: string }>

export const creatorContentStyles = [
  {id:'qoves',name:'Qoves',description:'One question. A visual experiment. A reveal worth staying for.',recipes:['editorial-story','feature-study'],defaultRecipe:'editorial-story'},
  {id:'mogging-editorial',name:'Mogging Editorial',description:'Face-led analysis. Clean portraits, native reports and precise visual detail.',recipes:['portrait-audit','report-led','measurement-explainer','hybrid-story'],defaultRecipe:'portrait-audit'},
  {id:'cephra',name:'Cephra',description:'Facial anatomy, perspective and proportions. Sculptural explanations in motion.',recipes:['sculpture-study'],defaultRecipe:'sculpture-study'},
  {id:'fern',name:'Fern',description:'Documentary cuts. Projected evidence, contour diagrams, and archive reels.',recipes:['documentary-studio'],defaultRecipe:'documentary-studio'},
] as const satisfies ReadonlyArray<{id:string;name:string;description:string;recipes:readonly VideoRecipe[];defaultRecipe:VideoRecipe}>
export type CreatorContentStyleId = typeof creatorContentStyles[number]['id']
export function creatorContentStyle(recipe:VideoRecipe) {
  return creatorContentStyles.find(style=>(style.recipes as readonly VideoRecipe[]).includes(recipe)) ?? creatorContentStyles.find(style=>style.id==='mogging-editorial')!
}
export function contentStyleSupportsScript(contentStyle:CreatorContentStyleId,story:{kind?:string}) {
  if(story.kind==='sculpture-explainer')return contentStyle==='cephra'
  return contentStyle!=='cephra'||story.kind!=='score-walkthrough'
}

export type CreatorTake={storyId:string;recipe:VideoRecipe;variation:number;storyCycle?:string[]}
/** Choose among approved recordings without synthesizing narration. */
export function chooseCreatorTake(styleId:CreatorContentStyleId,stories:ReadonlyArray<{id:string;kind?:string;recording?:string}>,previous?:CreatorTake,random:()=>number=Math.random):CreatorTake{
  const style=creatorContentStyles.find(style=>style.id===styleId)!
  const specialized=styleId==='cephra' && stories.some(story=>story.kind==='sculpture-explainer' && story.recording)
  const candidates=stories.filter(story=>story.recording && contentStyleSupportsScript(styleId,story) && (!specialized || story.kind==='sculpture-explainer'))
  if(!candidates.length)throw new Error('No recorded stories are ready for this person in this content style yet.')
  const ids = [...new Set(candidates.map(story => story.id))]
  const cycle = new Set((previous?.storyCycle ?? []).filter(id => ids.includes(id)))
  if (previous && ids.includes(previous.storyId)) cycle.add(previous.storyId)
  if (cycle.size === ids.length) cycle.clear()
  const fresh = ids.filter(id => !cycle.has(id))
  const alternatives = fresh.filter(id => id !== previous?.storyId)
  const pool = alternatives.length ? alternatives : fresh
  const storyId = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  const families = styleId === 'fern' ? documentaryVariationCount : 6
  const family = previous ? (previous.variation + 1) % families : Math.min(families - 1, Math.floor(random() * families))
  const bands = Math.floor(10000 / families)
  const variation = previous ? (previous.variation + 1) % 10000 : families * Math.min(bands - 1, Math.floor(random() * bands)) + family
  return { storyId, recipe: style.recipes[family % style.recipes.length], variation, storyCycle: [...cycle, storyId] }
}

export function creatorStyleDirections(example: VideoScriptExample, recipe: VideoRecipe) {
  const directions: Record<string, VideoDirection> = { ...example.directions }
  const angled = example.images?.find(image => /three-quarter|angle/.test(image.id))
  const profile = example.images?.find(image => /profile/.test(image.id))
  for (const beat of scriptToPlan(example.script, example.readingPace).scenes) {
    if (directions[beat.id]) continue
    const sideView = /head angle|side profile|side view|camera distance/i.test(beat.narration)
    const contour = /jaw contour|cheek and jaw contours/i.test(beat.narration)
    const image = sideView ? profile ?? angled : contour ? angled : undefined
    if (image) directions[beat.id] = { kind: 'portrait', imageId: image.id, categoryId: 'jaw', editorial: 'context', ...(sideView && profile ? { profileStudy: { view: 'profile', side: 'left', feature: profileFeatureForText(beat.narration, 'jaw') } } : {}) }
  }
  return Object.fromEntries(Object.entries(directions).filter(([, direction]) => {
    const effect = direction.kind === 'portrait' && (direction.photoStudy || direction.portraitFX?.lighting || direction.profileStudy || ['inspect', 'light'].includes(direction.study?.operation ?? ''))
    return recipe === 'hybrid-story' || effect || direction.kind === 'portrait' && direction.imageId !== undefined && direction.imageId !== example.images?.[0]?.id || recipe === 'portrait-audit' && direction.kind === 'portrait' || recipe === 'measurement-explainer' && direction.kind === 'portrait' || recipe === 'minimal-explainer' && direction.kind === 'explainer'
  }))
}

function draft(title: string, script: string): VideoScriptExample {
  return { title, script, readingPace: 165, recipe: 'portrait-audit', durationSeconds: Math.round(scriptToPlan(script, 165).duration), voice: voiceDirection('editorial'), disclosure: 'Editorial photo study · UI values illustrative · No endorsement implied' }
}
const studioPhotos = (subject: 'marlon' | 'johnson') => ['front', 'three-quarter', 'profile'].map(view => ({
  id: `${subject}-studio-${view}-20261027`, name: `${subject} · ${view} · AI editorial portrait · upscaled 4K export`,
  dataUrl: `/creator/examples/${subject}-studio-20261027/${subject}-${view}-4k.jpg`,
  width: 2160, height: 3840, status: 'ready' as const, landmarks: null,
}))

const darkStudioPhotos = (subject: 'marlon' | 'johnson') => studioPhotos(subject).map(photo => ({
  ...photo,
  name: photo.name.replace('upscaled 4K export', 'dark-mode wardrobe'),
  dataUrl: photo.dataUrl.replace('studio-20261027', 'studio-dark-20261027').replace('-4k.jpg', '.png'),
  width: 941, height: 1672,
}))

const round3Ids = ['marlon', 'v', 'jordan-barrett', 'tom-holland', 'zeta', 'clavicular'] as const
export const creatorSubjects = [...round3Ids.map(id => {
  const entry = editorialCatalog.find(subject => subject.id === id)!
  const images: GeneratorImage[] = entry.images.map(image => ({ ...image, status: 'ready', landmarks: null }))
  return { id, name: entry.name, initials: entry.name.split(' ').map(word => word[0]).join(''), productionImages: images,
    ...(id === 'marlon' ? { darkImages: darkStudioPhotos('marlon').map((image,index)=>({...image,id:images[index].id})) } : {}),
    example: { ...draft(entry.title, entry.script), readingPace: entry.pace, images } }
}),
  { id: 'kareem-shami' as const, name: 'Kareem Shami', initials: 'KS', productionImages: [{ id: 'kareem-front', name: 'Kareem Shami', dataUrl: '/creator/stories/kareem-shami/front.png', width: 941, height: 1672, status: 'ready' as const, landmarks: null }], example: draft('Play Kareem’s glow-up backwards', 'You’ve seen Kareem Shami’s glow-up. But would you recognise the moment he starts looking like a different person?') },
  { id: 'johnson' as const, name: 'The Rock', initials: 'TR', productionImages: studioPhotos('johnson'), darkImages: darkStudioPhotos('johnson'), example: subjectStudies[1] },
  { id: 'trump' as const, name: 'Trump', initials: 'DT', productionImages: [{ id: 'trump-front', name: 'Trump · Smiling portrait', dataUrl: '/creator/stories/trump/trump-front-supplied.png', width: 2250, height: 2850, status: 'ready' as const, landmarks: null }], example: draft('Trump · The portraits out of order', 'Which Trump portrait came first?') },
  { id: 'zendaya' as const, name: 'Zendaya', initials: 'Z', productionImages: [{ id: 'zendaya-front', name: 'Zendaya', dataUrl: '/creator/stories/zendaya/zendaya-front.png', width: 1600, height: 2000, status: 'ready' as const, landmarks: null }], example: draft('Zendaya · The shape beyond the eye', 'What makes this eye look longer?') },
]
export const creatorSubjectPhotos = (subject: (typeof creatorSubjects)[number], theme: 'light' | 'dark' = 'light'): GeneratorImage[] | undefined => {
  const photos = theme === 'dark' && 'darkImages' in subject ? subject.darkImages ?? subject.productionImages : subject.productionImages
  return photos
}
export type CreatorSubjectId = (typeof creatorSubjects)[number]['id'] | 'custom' | 'project'

export function validateCreatorPhotos(images: ReadonlyArray<{ width: number; height: number }>) {
  if (images.length < 1 || images.length > 3) throw new Error('Upload 1–3 photos of the same person.')
  for (const image of images) {
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || Math.min(image.width, image.height) < 1080 || Math.max(image.width, image.height) < 1920) {
      throw new Error('Each photo must be at least Full HD: 1080 × 1920 portrait or 1920 × 1080 landscape. Larger originals are better.')
    }
  }
}

export function customVideoExample(name: string): VideoScriptExample {
  return draft(`${name.trim() || 'Custom person'} · Photo study`, `What stands out when you look at this face as a whole?
Start with a clear portrait before focusing on a single detail.
The eye area combines shape, spacing and the frame formed by the brows.
The cheeks establish the upper width, while the jaw contour describes the lower frame.
Light and expression affect how clearly those boundaries appear in a photograph.
Look at the features together rather than treating one detail as the whole story.
The Mogging report demo connects each explanation to the image. Its values are illustrative.
For a useful comparison, repeat the same lighting, distance and expression.
Explore your own proportions with Mogging.`)
}

export function creatorProductionBrief() {
  return {
    version: 2,
    productionPolicy,
    output: { ...videoSize, fps: 30 },
    styles: creatorVideoStyles,
    photoRequirements: { count: '1–3', minShortEdge: 1080, minLongEdge: 1920, note: 'Use high-quality originals. Larger is better; do not upscale small sources.' },
    subjects: [...creatorSubjects.map(subject => ({ id: subject.id, name: subject.name, example: { ...subject.example, images: creatorSubjectPhotos(subject) } })), { id: 'custom', name: 'Custom person', example: customVideoExample('Custom person') }].map(({ id, name, example }) => ({
      id, name, title: example.title, production: productionWritingBrief(createProductionDraft(name)),
      cuts: [30, 45, 60, 75].map(seconds => ({ maximumSeconds: seconds, sections: productionTimeline(productionCut(createProductionDraft(name), seconds as 30 | 45 | 60 | 75)) })),
      scriptStatus: 'needs-editorial-approval', voiceoverStatus: 'pending',
      voice: example.voice ?? voiceDirection('editorial'),
      sources: example.images?.map(image => ({ id: image.id, url: image.dataUrl, width: image.width, height: image.height })) ?? [],
      sourceStatus: example.images?.length ? 'existing-sources-review-quality' : 'needs-1-to-3-full-hd-photos',
      steps: ['Add reference transcripts and editorial notes', 'Write and approve self-contained sections in Script & voice', 'Review 30/45/60/75-second cuts and early CTA', 'Record reusable sections once in a consistent narrator style', 'Review actual duration, transcript, word alignment and section joins', 'Compare five visual formats and their ranked alternatives against the same audio', 'Export MP4 with the selected cut voiceover'],
    })),
  }
}
