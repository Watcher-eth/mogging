import type { GeneratorImage } from './content-generator'
import { narratedEvidenceLayouts, type FeatureStudy } from './feature-study'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import { spokenScoreRange } from './spoken-score'
import type { VideoComposition, VideoScene } from './video-composition'
import { isVideoInvitation } from './video-branding'
import { scriptTokens, type VideoScript } from './video-script'
import { photoStudyRegions } from './video-photo-study'
import { decodeVisualBeat } from './video-semantics'
import { profileFeatureForText } from './video-profile'

const photosNoun = '(?:photos?|pictures?|portraits?|shots?|images?|versions?)'
const photoPair = new RegExp([
  `both (?:of (?:these|those|the) )?${photosNoun}`,
  'look at both(?: of them)?(?=\\s*(?:[.!?,;]|$))',
  `(?:these|those|the) two ${photosNoun}`,
  `compare\\s+(?:the ${photosNoun}|(?:these|those)(?: two)?|the two)(?=\\s*(?:[.!?,;]|$)|\\s+(?:${photosNoun}|side by side|at the same scale))`,
  `(?:original and edited|before and after)\\s+${photosNoun}`,
  `${photosNoun}\\s+(?:side by side|beside each other|next to each other)`,
  '(?:look at|see|put|show) (?:these|them) (?:side by side|next to each other)',
].map(pattern => `\\b(?:${pattern})\\b`).join('|'), 'i')
const viewNames = {
  front: /\b(?:front(?:al)? (?:photo|shot|portrait|image|view|angle)|from the front|face[- ]on|head[- ]on|straight[- ]on)\b/i,
  profile: /\b(?:side[- ]profile|side (?:photo|shot|portrait|image|view|angle)|from the side|in profile|profile (?:photo|shot|portrait|image|view|angle))\b/i,
  'three-quarter': /\bthree[- ]quarter(?:s)?(?: view| angle| photo| profile)?\b/i,
}
type PhotoView = keyof typeof viewNames
const photoViews = Object.keys(viewNames) as PhotoView[]
const photoView = (image: GeneratorImage): PhotoView | undefined => {
  if (/(?:^|[-_])(?:profile|side[-_]view)(?:$|[-_])/i.test(image.id)) return 'profile'
  if (/(?:^|[-_])(?:three[-_]quarter|angle)(?:$|[-_])/i.test(image.id)) return 'three-quarter'
  if (/(?:^|[-_])front(?:$|[-_])/i.test(image.id)) return 'front'
  const yaw = image.landmarks?.quality?.yawRadians
  if (yaw === undefined) return
  return Math.abs(yaw) >= .65 ? 'profile' : Math.abs(yaw) >= .22 ? 'three-quarter' : 'front'
}
const originalPortraits = (images: GeneratorImage[]) => images.filter(image =>
  !image.retouch && !image.comparison && image.purpose !== 'reference' &&
  (image.status === 'ready' || image.status === 'warning'))
const spokenViews = (text: string) => photoViews.flatMap(view => {
  const match = viewNames[view].exec(text)
  return match ? [{ view, index: match.index }] : []
}).sort((a, b) => a.index - b.index)
const plainComparison = /\b(?:now |let(?:'|’)s )?compare(?=[.!?]|$)/i
const photographicComparison = /\bcompare\b[^.!?;]{0,100}\b(?:photos|portraits|pictures|images|angles|views|side[- ]profile|in profile|from the side)\b/i
const otherPhoto = /\bcompare\b[^.!?;]{0,85}\b(?:with|to|against) (?:an? |the )?(?:other|second|edited|original|earlier|later) (?:photo|picture|portrait|shot|image)\b/i
const twoViews = /\b(?:from the front|front(?:al)?(?: view| photo)?)\s+(?:and|versus|vs\.?|with)\s+(?:the )?(?:side(?: profile| view)?|profile|three[- ]quarter)\b/i
const returnPair = new RegExp(`\\b(?:(?:back|return) to both(?: of them| ${photosNoun})?|(?:show|see|look at) both(?: of them| ${photosNoun})? again|side by side again)\\b`, 'i')
const editPair = /\b(?:versions?|before and after|original and edited|edited (?:photo|portrait|picture|image))\b/i
const namedPhoto = /\b(?:the )?(first|second|left|right|top|bottom|front|profile|three[- ]quarter) (?:photo|picture|portrait|shot|image|view)\b/gi
const focusPhoto = /\b(?:look\s+(?:at|closer at)|focus\s+on|zoom\s+in\s+on|switch\s+to|back\s+to|in|on|now)\s+(?:the\s+)?(?:photo\s+on\s+the\s+)?(first|second|left|right|top|bottom|original|edited|before|after|front|profile|side|three[- ]quarter)(?=\s*(?:photo|picture|portrait|shot|image|version|view|one|[.,;!?]|$))/gi
const wordAt = (text: string, offset: number) => scriptTokens(text.slice(0, offset)).length

function photoComparisonCue(text: string) {
  return /\b(?:do not|don't|never|can't|cannot)\s+compare\b/i.test(text) ? null
    : photoPair.exec(text) ?? photographicComparison.exec(text) ?? otherPhoto.exec(text) ?? twoViews.exec(text) ?? plainComparison.exec(text)
}

export function narratedPhotoDependencies(cues: VideoScript['cues']) {
  const dependencies = new Map<string, string>()
  let setup: string | undefined
  for (const cue of cues) {
    if (isVideoInvitation(cue) || ['cta', 'product'].includes(cue.section?.role ?? '')) {
      continue
    }
    if (setup && returnPair.test(cue.text)) dependencies.set(cue.sourceId, setup)
    else if (photoComparisonCue(cue.text)) setup = cue.sourceId
    else if (setup && [...cue.text.matchAll(focusPhoto), ...cue.text.matchAll(namedPhoto)]
      .some(match => /^(?:first|second|left|right|top|bottom)$/i.test(match[1]))) dependencies.set(cue.sourceId, setup)
  }
  return dependencies
}

function pairFor(images: GeneratorImage[], scene: VideoScene, text: string, needsEdit: boolean) {
  const available = images.filter(image => image.status === 'ready' || image.status === 'warning')
  const current = available.find(image => image.id === scene.source.imageId)
  const originals = available.filter(image => !image.retouch && image.purpose !== 'reference')
  const requested = scene.featureStudy?.images.map(id => available.find(image => image.id === id))
  const feature = decodeVisualBeat(text).feature
  const before = originals.find(image => image.comparison?.state === 'before' && (image.comparison.feature === feature || feature === 'whole' && image.id === current?.id))
  const after = before && originals.find(image => image.comparison?.state === 'after' && image.comparison.group === before.comparison!.group && image.comparison.feature === before.comparison!.feature)
  if (needsEdit && before && after) return { photos: [before, after], labels: ['Before', 'After'] }

  const unedited = originalPortraits(images)
  const views = spokenViews(text)
  if (views.length < 2 && twoViews.test(text)) {
    views.length = 0
    views.push({ view: 'front', index: 0 }, { view: /three[- ]quarter/i.test(text) ? 'three-quarter' : 'profile', index: 1 })
  }
  const firstView = views.length > 1 ? views[0].view : 'front'
  const first = needsEdit && current && unedited.includes(current) ? current
    : unedited.find(image => photoView(image) === firstView) ?? unedited[0]
  if (!first) return
  if (needsEdit) {
    const edited = available.find(image => image.retouch?.baselineImageId === first.id && (feature === 'whole' || image.retouch.feature === feature))
    if (edited) return { photos: [first, edited], labels: ['Original', 'Edited'] }
    return
  }
  const candidates = unedited.filter(image => image.id !== first.id && image.dataUrl !== first.dataUrl)
  const secondView = views.find(({ view }) => view !== photoView(first))?.view
  const second = secondView ? candidates.find(image => photoView(image) === secondView)
    : requested?.find(image => image && candidates.includes(image)) ??
      candidates.find(image => photoView(image) && photoView(image) !== photoView(first)) ?? candidates[0]
  if (second) {
    const label = (photo: GeneratorImage, fallback: string) => {
      const view = photoView(photo)
      return secondView && view ? { front: 'Front', profile: 'Profile', 'three-quarter': 'Three-quarter' }[view] : fallback
    }
    return { photos: [first, second], labels: [label(first, 'Photo 1'), label(second, 'Photo 2')] }
  }
}

type Pair = NonNullable<ReturnType<typeof pairFor>>
function photoIndex(key: string, pair: Pair) {
  key = key.toLowerCase()
  if (['first', 'left', 'top'].includes(key)) return 0
  if (['second', 'right', 'bottom'].includes(key)) return 1
  const label = pair.labels.findIndex(label => label.toLowerCase() === key)
  if (label >= 0) return label
  if (!/^(?:front|profile|side|three[- ]quarter)$/.test(key)) return -1
  return pair.photos.findIndex(photo => photoView(photo) === (key === 'side' ? 'profile' : key.replace(' ', '-')))
}

export function applyNarratedEvidence(composition: VideoComposition, images: GeneratorImage[], reports: ReportCategory[]): VideoComposition {
  if (composition.recipe === 'sculpture-study') return composition
  const documentary = composition.recipe === 'documentary-studio'
  const qoves = ['feature-study', 'editorial-story'].includes(composition.recipe)
  const portraits = originalPortraits(images)
  let active: { pair: Pair; index: number; focus?: number; cueId: string; layout: NonNullable<FeatureStudy['evidence']>['layout'] } | undefined
  const scenes = composition.scenes.map((scene, index): VideoScene => {
    const cue = composition.script?.cues.find(cue => cue.id === scene.scriptRange?.cueId)
    if ((qoves && index === composition.scenes.length - 1 && scene.source.kind === 'report') || scene.sculpture || scene.documentary?.kind === 'media' || isVideoInvitation(cue) || ['cta', 'product'].includes(cue?.section?.role ?? '')) {
      return scene
    }
    const text = scene.narration
    const scoreEvidence = Boolean(scene.scoreCallouts?.length)
    const returning = !scoreEvidence && active && returnPair.exec(text)
    const paired = returning || scoreEvidence ? null : photoComparisonCue(text)
    // A director-authored archival reveal controls when the viewer first sees the second photo.
    if (scene.featureStudy?.revealWord !== undefined) {
      const [first, second] = scene.featureStudy.images.map(id => images.find(image => image.id === id))
      if (first && second) active = { pair: { photos: [first, second], labels: scene.featureStudy.labels ?? ['Before', 'After'] }, index, cueId: scene.cueId, layout: 'columns' }
      return scene
    }

    const viewCues = spokenViews(text)
    const explicitFocus = [...text.matchAll(focusPhoto)]
    const focus = explicitFocus.length ? explicitFocus : [...text.matchAll(namedPhoto)]
    const next = composition.scenes[index + 1]?.narration ?? ''
    const nextFocus = [...next.matchAll(focusPhoto), ...next.matchAll(namedPhoto)].map(match => match[1]).join(' ')
    const needsEdit = Boolean(paired && (editPair.test(paired[0]) || /\b(?:original|edited|before|after)\b/i.test(nextFocus)))
    const newPair = paired && !scene.featureStudy?.opening
      ? pairFor(images, scene, `${text} ${nextFocus}`, needsEdit) : undefined
    if (paired && !newPair && !scene.featureStudy?.opening && (!needsEdit || !scene.featureStudy?.edit && !scene.photoStudy)) {
      active = undefined
      const source = images.find(image => image.id === scene.source.imageId && !image.retouch)
        ?? images.find(image => !image.retouch && image.purpose !== 'reference')
      if (!source) return scene
      return { ...scene, label: 'Photo evidence · single source', source: { ...scene.source, kind: 'portrait' as const, imageId: source.id, secondaryImageId: null, overlay: 'none' as const },
        presentation: undefined, graphic: undefined, study: undefined, featureStudy: undefined, photoStudy: undefined, profileStudy: undefined, portraitFX: undefined, portraitProgram: undefined,
        framing: 'captioned' as const, layout: 'portrait' as const, focus: 'hero', tracks: scene.tracks.filter(track => track.target === 'text'),
        documentary: documentary ? { kind: 'inspection' as const, label: scene.documentary?.label ?? '' } : undefined,
      }
    }
    const pair = newPair ?? active?.pair
    const named = pair && (focus.length || newPair
      ? focus.map(match => ({ photo: photoIndex(match[1], pair), word: wordAt(text, match.index) }))
      : viewCues.map(({ view, index }) => ({ photo: photoIndex(view, pair), word: wordAt(text, index) })))
      .filter(match => match.photo >= 0)
    const requestedView = viewCues.at(-1)?.view
    const hasUnmatchedView = requestedView && pair && photoIndex(requestedView, pair) < 0
    if (!scoreEvidence && pair && (newPair || returning || named?.length || !paired && !hasUnmatchedView && active?.cueId === scene.cueId && index === active.index + 1)) {
      const spatial = [...focus.map(match => match[1]), nextFocus].join(' ')
      const layouts = /\b(?:top|bottom)\b/i.test(spatial) ? ['stacked'] as const
        : /\b(?:left|right)\b/i.test(spatial) ? qoves ? ['columns', 'offset', 'contact-sheet', 'gate'] as const : ['columns', 'offset'] as const
          : qoves ? narratedEvidenceLayouts : documentary ? ['stacked', 'columns', 'offset'] as const : ['columns', 'offset', 'stacked'] as const
      const layout = newPair ? layouts[(composition.variation + index) % layouts.length] : active!.layout
      const priorFocus = !newPair ? active?.focus : undefined
      const pairWord = paired ? wordAt(text, paired.index) : 0
      const photoEvents = (named ?? []).filter(event => !newPair || event.word > pairWord).slice(0, 3)
      const initial = newPair && pairWord > 0 ? 0 : priorFocus
      const reopenWord = returning ? wordAt(text, returning.index) : newPair && initial === 0 ? pairWord : undefined
      const events = [...(reopenWord === undefined ? [] : [{ photo: null, word: reopenWord }]), ...photoEvents].sort((a, b) => a.word - b.word)
      const last = events.at(-1)
      active = { pair, index, cueId: scene.cueId, focus: last ? last.photo ?? undefined : initial, layout }
      const [first, second] = pair.photos
      return {
        ...scene, source: { ...scene.source, kind: 'portrait' as const, imageId: first.id, secondaryImageId: second.id, overlay: 'none' as const },
        presentation: undefined, graphic: undefined, portraitCrop: undefined, study: undefined, photoStudy: undefined, profileStudy: undefined, portraitFX: undefined, portraitProgram: undefined,
        scoreCallouts: [], framing: 'captioned' as const, layout: 'portrait' as const, focus: 'hero',
        tracks: scene.tracks.filter(track => track.target === 'text'),
        featureStudy: { topic: decodeVisualBeat(text).feature, layout: 'evidence' as const, editMode: 'warp' as const, edit: 0, annotation: '', images: [first.id, second.id], labels: pair.labels, evidence: { layout, initial, events } },
        documentary: documentary ? { kind: 'comparison' as const, label: scene.documentary?.label ?? '' } : undefined,
      }
    }

    // Switch the source only for a real camera view. Leave measurement evidence
    // and timed documentary angle cuts attached to their registered photos.
    const presentationShowsView = scene.presentation?.imageIds.some(id =>
      portraits.some(photo => photo.id === id && photoView(photo) === requestedView))
    if (requestedView && !presentationShowsView && !scene.scoreCallouts?.length &&
      !(scene.source.kind === 'report' && /\b(?:scores?|ratings?|report|app)\b/i.test(text)) &&
      !scene.featureStudy?.opening && !scene.featureStudy?.edit && !scene.photoStudy &&
      !(scene.documentary?.cutWord !== undefined && scene.source.secondaryImageId)) {
      const current = portraits.find(photo => photo.id === scene.source.imageId && photoView(photo) === requestedView)
      const source = current ?? portraits.find(photo => photoView(photo) === requestedView)
      if (source && (source.id !== scene.source.imageId || scene.source.kind !== 'portrait' ||
        (requestedView !== 'front' && scene.profileStudy?.view !== requestedView))) {
        return {
          ...scene, source: { ...scene.source, kind: 'portrait', imageId: source.id, secondaryImageId: null, overlay: 'none' },
          portraitCrop: current ? scene.portraitCrop : undefined,
          presentation: undefined, graphic: undefined, study: undefined, featureStudy: undefined,
          portraitFX: undefined, portraitProgram: undefined,
          profileStudy: requestedView === 'front' ? undefined : {
            view: requestedView, side: 'left', feature: profileFeatureForText(text, scene.source.categoryId),
          },
          scoreCallouts: [], framing: 'captioned', layout: 'portrait', focus: 'hero',
          tracks: scene.tracks.filter(track => track.target === 'text'),
          documentary: documentary ? { kind: 'inspection', label: scene.documentary?.label ?? '' } : undefined,
        }
      }
    }

    const study = scene.featureStudy
    const change = /\b(?:shorten\w*|lengthen\w*|narrow\w*|widen\w*|remov\w*|add(?:ed|ing|s)?|thinn\w*|fuller|adjust\w*|swap\w*|align\w*|edit\w*)\b/i.exec(text)
    const score = spokenScoreRange(text, reports, scene.source.categoryId)
    const scoreAt = /\b(?:scores?|ratings?)\b/i.exec(text)?.index
    const meaning = decodeVisualBeat(change && score && !score.imageIds.length && scoreAt !== undefined && change.index < scoreAt ? text.slice(0, scoreAt) : text)
    let photoStudy = scene.photoStudy
    if (change && photoStudy && photoStudy.startWord === undefined && meaning.intent === 'edit')
      photoStudy = { ...photoStudy, startWord: wordAt(text, change.index), inferred: true }
    if (change && scene.source.imageId && !photoStudy && !study?.edit && !study?.opening && meaning.intent === 'edit'
      && /^(eyes|brows|nose|lips|jaw|cheeks)$/.test(meaning.feature)
      && ['narrow', 'widen', 'shorten', 'lengthen'].includes(meaning.operation)
      && !/\b(?:brow arch|brow position|smile|expression|canthal tilt)\b/i.test(text)) {
      const image = images.find(image => image.id === scene.source.imageId && !image.retouch)
      const feature = meaning.feature as 'eyes' | 'brows' | 'nose' | 'lips' | 'jaw' | 'cheeks'
      try {
        if (image?.landmarks) photoStudyRegions(image.landmarks, feature)
        const axis = ['shorten', 'lengthen'].includes(meaning.operation) || /\b(?:thick\w*|thinn\w*|fuller|height)\b/i.test(text) && !/\bwidth\b/i.test(text) ? 'y' : 'x'
        if (image && ['ready', 'warning'].includes(image.status)) photoStudy = { feature, axis, inferred: true, mode: 'stretch', amount: ['shorten', 'narrow'].includes(meaning.operation) ? -.055 : .055, cursor: false, startWord: wordAt(text, change.index) }
      } catch { /* A morph requires usable registration on the actual portrait. */ }
    }

    if (score && scene.source.imageId && score.imageIds.every(id => images.some(image => image.id === id))) {
      const [before, after] = score.imageIds
      const measurement = before && after ? { topic: meaning.feature, layout: 'evidence' as const, editMode: 'warp' as const, edit: 0, annotation: '', images: [before, after],
        labels: [`${score.callout.from.toFixed(1)} / 10`, `${score.callout.value.toFixed(1)} / 10`],
        evidence: { layout: 'columns' as const, initial: 0, events: [{ photo: 1, word: score.callout.word }] } } : undefined
      return {
        ...scene, source: { ...scene.source, kind: 'portrait' as const, imageId: before ?? scene.source.imageId, secondaryImageId: after ?? null, overlay: 'none' as const },
        graphic: undefined, presentation: undefined, study: undefined, featureStudy: measurement, photoStudy: measurement ? undefined : photoStudy, profileStudy: undefined, portraitProgram: undefined,
        scoreCallouts: [score.callout], framing: 'captioned' as const, layout: 'portrait' as const, focus: 'hero',
        tracks: scene.tracks.filter(track => track.target === 'text'),
        documentary: documentary ? { kind: measurement ? 'comparison' as const : 'inspection' as const, label: scene.documentary?.label ?? '' } : undefined,
      }
    }

    if (photoStudy && photoStudy !== scene.photoStudy) {
      const { feature, startWord, axis, amount } = photoStudy
      const treatment = qoves && photoStudy.mode === 'stretch' && feature !== 'face-width' ? (['blend', 'drop', 'wipe', 'mesh'] as const)[composition.variation % 4] : 'blend'
      const editedStudy: FeatureStudy | undefined = treatment !== 'blend' && feature !== 'face-width'
        ? { topic: feature, layout: 'hero', editMode: 'warp', edit: Math.max(-1, Math.min(1, amount / .055)), annotation: '', images: [], editorial: true, axis, editWord: startWord, comparison: treatment } : undefined
      return { ...scene, source: { ...scene.source, kind: 'portrait' as const, overlay: 'none' as const },
        photoStudy: editedStudy ? undefined : photoStudy, featureStudy: editedStudy, graphic: undefined, presentation: undefined, study: undefined, profileStudy: undefined, portraitFX: undefined, portraitProgram: undefined,
        framing: 'captioned' as const, layout: 'portrait' as const, focus: 'hero',
        tracks: scene.tracks.filter(track => track.target === 'text'),
        documentary: documentary ? { kind: 'inspection' as const, label: scene.documentary?.label ?? '' } : undefined,
      }
    }
    if (study?.edit && !study.opening && study.layout !== 'compare' && study.layout !== 'grid' && study.layout !== 'evidence') {
      if (change) return { ...scene, featureStudy: { ...study, editWord: wordAt(text, change.index), comparison: qoves && study.topic !== 'freckles' && composition.variation % 3 === 1 ? 'drop' as const : study.comparison } }
    }
    return scene
  })
  return { ...composition, scenes }
}
