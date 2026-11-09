import type { GeneratorImage } from './content-generator'
import type { VideoDirection } from './video-composition'
import { scriptTokens, type VideoScript } from './video-script'
import { decodeVisualBeat } from './video-semantics'

const nose = /\b(?:nose|nasal|nostrils?|alar)\b/i
const widthChange = /\b(?:less width|narrow(?:er|ed|ing)?|thinn(?:er|ed|ing)|slimmer|reduc(?:e[sd]?|ing) (?:the )?width)\b/i
const noseChange = /\b(?:chang\w*|before and after|new nose|rhinoplasty)\b/i
export type NoseChangeImage = Pick<GeneratorImage, 'id'> & Partial<Pick<GeneratorImage, 'comparison' | 'retouch' | 'landmarks'>>

export function narratedNoseChange(images: NoseChangeImage[], cue: VideoScript['cues'][number], quote: string): VideoDirection | undefined {
  if (['product', 'cta', 'takeaway'].includes(cue.section?.role ?? '')) return
  const meaning = decodeVisualBeat(quote)
  if (meaning.intent === 'report' || meaning.intent === 'context' || meaning.view !== 'front') return
  const before = images.find(image => image.comparison?.state === 'before' && image.comparison.feature === 'nose' && !image.retouch)
  const after = before && images.find(image => image.comparison?.state === 'after' && image.comparison.feature === 'nose' && image.comparison.group === before.comparison!.group && !image.retouch)
  if (!before || !after) return
  const wordAt = (offset: number) => scriptTokens(quote).filter(token => token.offset < offset).length

  const revealPhrase = cue.section?.visuals.find(visual => visual.categoryId === 'nose' && visual.match)?.match
    ?? quote.match(/\b(?:now look|here(?:['’]s| is) what changed|before and after)\b/i)?.[0]
  if (nose.test(cue.text) && noseChange.test(cue.text) && revealPhrase) {
    const offset = quote.toLowerCase().indexOf(revealPhrase.toLowerCase())
    if (offset >= 0) return {
      kind: 'portrait', categoryId: 'nose', imageId: before.id, editorial: 'context', overlay: 'none', focus: 'hero',
      featureStudy: {
        topic: 'nose', layout: 'evidence', images: [before.id, after.id], edit: 0, editMode: 'warp',
        labels: ['Before', 'After'], annotation: '', revealWord: wordAt(offset),
      },
    }
    if (cue.text.toLowerCase().includes(revealPhrase.toLowerCase()) && nose.test(quote) && noseChange.test(quote)) {
      return { kind: 'portrait', categoryId: 'nose', imageId: before.id, editorial: 'context', overlay: 'none', focus: 'hero' }
    }
  }

  const change = widthChange.exec(quote)
  if (!change || !nose.test(quote) || /\b(?:not|never|no|without)\s+(?:(?:any|become|look|make|making|got|get)\s+)*$/i.test(quote.slice(0, change.index))) return
  const source = [before, after].find(image => {
    const landmarks = image.landmarks
    return landmarks && landmarks.confidence >= .58 &&
      Math.abs(landmarks.quality?.yawRadians ?? 0) <= .3 &&
      landmarks.anchors.noseTip && landmarks.anchors.leftPupil && landmarks.anchors.rightPupil &&
      Math.abs(landmarks.anchors.leftPupil.x - landmarks.anchors.rightPupil.x) >= .03
  })
  if (!source) return
  return {
    kind: 'portrait', categoryId: 'nose', imageId: source.id, editorial: 'detail', overlay: 'none', focus: 'hero',
    photoStudy: { feature: 'nose', mode: 'pinch', axis: 'x', amount: .18, startWord: wordAt(change.index) },
  }
}
