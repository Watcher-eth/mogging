import type { GeneratorImage } from './content-generator'
import { profileFeatureForText } from './video-profile'
import { createProductionDraft } from './production-drafts'
import { productionPolicy, productionCut, productionTimeline, productionWritingBrief } from './video-production'
import { videoSize } from './video-layout'
import type { VideoDirection, VideoRecipe } from './video-composition'
import type { VideoScriptExample } from './video-script-examples'
import { subjectStudies } from './video-subject-studies'
import { scriptToPlan } from './script-edit'
import { voiceDirection } from './video-speech'

// Creator styles are the existing rendering recipes, with one vocabulary in the UI.
export const creatorVideoStyles = [
  { id: 'portrait-audit', label: 'Portrait study', detail: 'Photo-led. Close-ups, contours and gentle camera moves.' },
  { id: 'report-led', label: 'App walkthrough', detail: 'Report-led. Scrolling results and focused feature cards.' },
  { id: 'measurement-explainer', label: 'Feature breakdown', detail: 'Detail-led. Face guides, measurements and clear explanations.' },
  { id: 'feature-study', label: 'Feature study', detail: 'One feature at a time. Drawn notes, controlled face edits and continuous photo grids.' },
  { id: 'hybrid-story', label: 'Visual story', detail: 'Story-led. Portraits, graphic comparisons and app proof.' },
] as const satisfies ReadonlyArray<{ id: VideoRecipe; label: string; detail: string }>

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

const drafts = {
  clavicular: `What can a face photo actually tell you?
Use this Clavicular portrait to separate visible shape from the way a photograph presents it.
Start with the whole face before zooming into a single feature.
The jaw contour is the visible boundary of the lower face. A stronger shadow can make that boundary easier to see.
That does not mean the underlying structure changed.
The eye area needs the same context. Brows, eyelids and expression all affect what draws attention.
Now compare the cheek and jaw contours without treating either one as the whole story.
Camera distance and head angle can change their apparent relationship.
The Mogging demo keeps the image beside the relevant feature, so the explanation stays grounded.
These report values are illustrative, not measured ratings of Clavicular.
For your own comparisons, use clear originals and repeat the same photo setup.
Understand the detail, keep the whole face in view, and explore your starting point with Mogging.`,
}
function draft(title: string, script: string): VideoScriptExample {
  return { title, script, readingPace: 165, recipe: 'portrait-audit', durationSeconds: Math.round(scriptToPlan(script, 165).duration), voice: voiceDirection('editorial'), disclosure: 'Editorial photo study · UI values illustrative · No endorsement implied' }
}
const clavicularStudioPhotos = ['front', 'three-quarter', 'profile'].map(view => ({
  id: `clavicular-studio-${view}-20261027`, name: `Clavicular · ${view} · AI-generated editorial portrait`,
  dataUrl: `/creator/examples/clavicular-studio-20261027/clavicular-${view}-4k.jpg`,
  width: 2160, height: 3840, status: 'ready' as const, landmarks: null,
}))

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

const storyPhoto = (subject: string, id: string, width: number, height: number) => ({ id, name: subject, dataUrl: `/creator/stories/${subject}/${id}.png`, width, height, status: 'ready' as const, landmarks: null })

const storyPhotos = (...args: Parameters<typeof storyPhoto>) => [storyPhoto(...args)]

export const creatorSubjects = [
  { id: 'marlon', name: 'Marlon', initials: 'M', productionImages: studioPhotos('marlon'), darkImages: darkStudioPhotos('marlon'), example: subjectStudies[0] },
  { id: 'johnson', name: 'The Rock', initials: 'TR', productionImages: studioPhotos('johnson'), darkImages: darkStudioPhotos('johnson'), example: subjectStudies[1] },
  { id: 'trump', name: 'Trump', initials: 'DT', productionImages: storyPhotos('trump','trump-front-supplied',2250,2850), example: draft('Trump · The portraits out of order', 'Which Trump portrait came first?') },
  { id: 'tom-holland', name: 'Tom Holland', initials: 'TH', productionImages: storyPhotos('tom-holland','tom-editorial-front-bw',1920,2400), example: draft('Tom Holland · Two paths to one ratio', 'Which Tom Holland looks better?') },
  { id: 'zendaya', name: 'Zendaya', initials: 'Z', productionImages: storyPhotos('zendaya','zendaya-editorial-three-quarter',4024,6048), example: draft('Zendaya · The line beyond the eye', 'What makes this eye look longer?') },
  { id: 'clavicular', name: 'Clavicular', initials: 'C', example: { ...draft('Clavicular · Shape and presentation', drafts.clavicular), images: clavicularStudioPhotos, disclosure: 'AI-generated editorial portraits · Report values illustrative · No endorsement implied' } },
] as const
export const creatorSubjectPhotos = (subject: (typeof creatorSubjects)[number], theme: 'light' | 'dark' = 'light'): GeneratorImage[] | undefined => {
  const photos = theme === 'dark' && 'darkImages' in subject ? subject.darkImages : 'productionImages' in subject ? subject.productionImages : subject.example.images
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
