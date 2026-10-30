import { z } from 'zod'

// Meaning is independent of a recipe, an image ID or the randomisation seed.
export const visualFeatures = ['whole', 'philtrum', 'freckles', 'facial-hair', 'ears', 'symmetry', 'dimorphism', 'eyes', 'brows', 'nose', 'lips', 'jaw', 'cheeks'] as const
export const visualIntents = ['observe', 'measure', 'edit', 'compare', 'lighting', 'views', 'context', 'report'] as const
export const visualOperations = ['none', 'add', 'remove', 'shorten', 'lengthen', 'widen', 'narrow', 'align', 'replace'] as const
export const semanticBeatSchema = z.object({
  quote: z.string().min(1).max(1200), feature: z.enum(visualFeatures), intent: z.enum(visualIntents),
  operation: z.enum(visualOperations), view: z.enum(['front', 'three-quarter', 'profile']),
  confidence: z.number().min(0).max(1), rationale: z.string().min(1).max(250),
}).strict()
export const semanticSectionSchema = z.object({ sourceText: z.string().min(1).max(1200), decoder: z.enum(['rules-v1', 'model-v1']), beats: z.array(semanticBeatSchema).min(1).max(6) }).strict()
export type SemanticBeat = z.infer<typeof semanticBeatSchema>
export type SemanticSection = z.infer<typeof semanticSectionSchema>
const featurePatterns: Array<[SemanticBeat['feature'], RegExp]> = [
  ['philtrum', /\b(?:philtrum|between the nose and upper lip|below the nose|above the upper lip|mouth position)\b/i],
  ['freckles', /\b(?:freckl\w*|skin pattern|distribution|skin texture)\b/i], ['facial-hair', /\b(?:beard|moustache|mustache|facial hair|grooming)\b/i],
  ['ears', /\bears?\b/i], ['symmetry', /\b(?:symmetr\w*|asymmetr\w*|paired|alignment)\b/i],
  ['dimorphism', /\b(?:dimorph\w*|masculin\w*|feminin\w*|brow and lower face)/i],
  ['brows', /\b(?:brows?|eyebrows?)\b/i], ['eyes', /\b(?:eyes?|eyelids?|pupils?|canthal|intercanthal|sclera)\b/i],
  ['nose', /\b(?:nose|nasal)\b/i], ['lips', /\b(?:lips?|mouth|vermilion|cupid)\b/i], ['jaw', /\b(?:jaw|chin|lower face|gonial|mandibular|mandible)\b/i], ['cheeks', /\b(?:cheek\w*|zygomatic)\b/i], ['whole', /\b(?:whole face|whole portrait|entire face|full portrait)\b/i],
]
export const mentionsVisualFeature = (text: string, feature: SemanticBeat['feature']) => featurePatterns.find(([name]) => name === feature)?.[1].test(text) ?? false
const operationPatterns: Array<[SemanticBeat['operation'], RegExp]> = [
  ['remove', /\b(?:remove[sd]?|removing|without|erase[sd]?|shave[sd]?)\b/i],
  ['add', /\b(?:add(?:s|ed|ing)?|grow|apply)\b/i], ['shorten', /\b(?:shorten\w*|shorter|raise|moves? up)\b/i],
  ['lengthen', /\b(?:lengthen\w*|longer|lower(?:ing|ed)? (?:the )?(?:mouth|lip|brow)|moves? down)\b/i], ['narrow', /\b(?:narrow\w*|slimmer|reduce\w*|smaller)\b/i],
  ['widen', /\b(?:widen\w*|broader|bigger|enlarge\w*)\b/i], ['align', /\b(?:align\w*|level|average height)\b/i], ['replace', /\b(?:replace\w*|switch out|swap\w*)\b/i],
]
export function decodeVisualBeat(quote: string, fallback: SemanticBeat['feature'] = 'whole'): SemanticBeat {
  // Explicitly negated changes and explanatory caveats never author an edit.
  const caveat = /\b(?:cannot|does not|doesn't|not a |not the |without assuming|illustrative|prediction|diagnosis|hormones|personality|health)\b/i.test(quote)
  const negated = /\b(?:not|never|don't|do not|doesn't|cannot|can't|no need to)\b[^.!?;]{0,35}\b(?:add|remove|shorten|lengthen|change|edit|align|widen|narrow|replace|swap)\w*/i.test(quote)
  const operation = operationPatterns.find(([, pattern]) => pattern.test(quote))?.[0] ?? 'none'
  // Prefer the feature nearest the action, not the first face part named anywhere in a section.
  const action = operationPatterns.find(([name]) => name === operation)?.[1].exec(quote)
  const candidates = featurePatterns.flatMap(([feature, pattern]) => { const match = pattern.exec(quote); return match ? [{ feature, distance: action ? Math.abs(match.index - action.index) : match.index }] : [] })
  const attention = quote.match(/\b(?:focus on|watch(?:ing)?|look at|follow|attention on)\s+(.+)/i)?.[1]
  const attended = attention ? featurePatterns.find(([, pattern]) => pattern.test(attention))?.[0] : undefined
  const feature = attended ?? candidates.toSorted((a, b) => a.distance - b.distance)[0]?.feature ?? fallback
  const view = /\b(?:profile|side view|from the side)\b/i.test(quote) ? 'profile' : /\b(?:three-quarter|another angle|different angle)\b/i.test(quote) ? 'three-quarter' : 'front'
  const comparison = /\b(?:compare|comparison|before and after|versions|side by side|beside each other|together|same scale)\b/i.test(quote)
  const actionRequested = /\b(?:add(?:s|ed|ing)?|remov\w*|eras\w*|shav\w*|shorten\w*|lengthen\w*|widen\w*|narrow\w*|align\w*|replace\w*|adjust\w*|edit\w*|moves?|make|turn|apply|swap\w*|switch out)\b/i.test(quote)
  const edit = !negated && !caveat && (operation !== 'none' && actionRequested || /\b(?:edit|edited version|shape edit|mouth position moves|local edit|reversible)\b/i.test(quote))
  const consistent = /\b(?:keep|use)\b[^.!?]{0,100}\b(?:consistent|similar|unchanged|fixed)\b/i.test(quote) && !edit && !comparison
  const intent: SemanticBeat['intent'] = /\b(?:report|score|app)\b|\bMogging(?:\.com)?\s+(?:shows?|separates?|compares?|explains?)\b/i.test(quote) ? 'report'
    : caveat || negated || consistent ? 'context' : /\b(?:light(?:ing)?|shadows?|illuminat\w*)\b/i.test(quote) && !edit && !comparison ? 'lighting'
    : comparison ? 'compare' : edit ? 'edit' : view !== 'front' ? 'views'
    : /\b(?:measure\w*|ratio|spacing|width|height|distance|proportion\w*)\b/i.test(quote) ? 'measure' : 'observe'
  return { quote, feature, intent, operation: negated || caveat || !['edit', 'compare'].includes(intent) ? 'none' : operation, view, confidence: candidates.length ? .86 : .62,
    rationale: negated || caveat ? 'Explain the limitation without inventing a transformation.' : `Show ${feature === 'whole' ? 'the whole portrait' : feature} to support this ${intent} beat.` }
}
export function decodeVisualSection(text: string, fallback: SemanticBeat['feature'] = 'whole'): SemanticSection {
  const sentences = text.split(/(?<=[.!?;])\s+|\s+(?=(?:while|but|whereas)\s+(?:a |the |this |that |softer |soft |three-quarter|frontal))/iu).map(part => part.trim()).filter(Boolean)
  const chunks: string[] = []
  for (const sentence of sentences) {
    if (chunks.length && (sentence.split(/\s+/).length < 6 || chunks.at(-1)!.split(/\s+/).length < 6)) chunks[chunks.length - 1] += ` ${sentence}`
    else chunks.push(sentence)
  }
  if (chunks.length > 1 && chunks.at(-1)!.split(/\s+/).length < 6) chunks[chunks.length - 2] += ` ${chunks.pop()}`
  let feature = fallback
  const beats = (chunks.length <= 6 ? chunks : [text]).map(quote => { const beat = decodeVisualBeat(quote, feature); feature = beat.feature; return beat })
  return { sourceText: text, decoder: 'rules-v1', beats }
}
export function validateSemanticSection(value: unknown, text: string): SemanticSection {
  const section = semanticSectionSchema.parse(value)
  if (section.sourceText !== text || section.beats.map(beat => beat.quote).join(' ') !== text) throw new Error('Visual beats must cover the exact narration once, in order, without rewriting it.')
  for (const beat of section.beats) {
    const guarded = decodeVisualBeat(beat.quote, beat.feature)
    if (guarded.intent === 'context' && ['edit', 'compare'].includes(beat.intent)) throw new Error('A negated change or limitation cannot be directed as a face edit.')
    if (beat.intent !== 'edit' && beat.intent !== 'compare' && beat.operation !== 'none') throw new Error('Only an explicit edit or comparison may request a transformation.')
  }
  return section
}
