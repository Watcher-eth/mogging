import { z } from 'zod'
import registry from './rubric-registry.json'
import type { measureLandmarks } from './measurements'

type Geometry = ReturnType<typeof measureLandmarks>
type Rubric = typeof registry.categories[number]['rubrics'][number]
const estimateSchema = z.tuple([z.string(), z.union([z.number().finite(), z.array(z.number().finite().nullable()).min(2).max(5).transform(values => values.some(value => value === null) ? null : values as number[]), z.string().max(180), z.null()]), z.string().min(1).max(220)])
const captureSchema = z.object({
  front: z.boolean().nullable(), side: z.boolean().nullable(), hairline: z.boolean().nullable(),
  neutralEyes: z.boolean().nullable(), neutralMouth: z.boolean().nullable(),
  bothEars: z.boolean().nullable(), evenLight: z.boolean().nullable(), detail: z.boolean().nullable(),
})
type Capture = z.infer<typeof captureSchema>
const allRubrics = registry.categories.flatMap(category => category.rubrics)
export const rubricVectorSizes: Record<string, number> = {
  'eyes.aspect': 2, 'eyes.canthal-tilt': 2, 'eyes.opening': 2, 'eyes.upper-lid': 2,
  'eyes.lower-sclera': 2, 'brows.arch': 2, 'brows.tilt': 2, 'brows.eye-distance': 2, 'brows.length': 2, 'brows.tail': 2,
  'nose.nostril-visibility': 2, 'nose.alar-angle': 2, 'mouth.projection': 2,
  'proportions.fifths': 5, 'proportions.vertical-alignment': 3, 'ears.height': 2, 'ears.width': 2, 'ears.vertical-position': 4,
}
const completionSchema = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string() }) })), usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional() })
export type RubricEstimate = { id: string; value: string | number | number[] | null; evidence: string; source: 'llm-estimate' | 'landmark-geometry' | 'derived'; grade: number | null; positions?: number[] }
export const rubricBatches = [
  ['eyes', 'brows', 'nose', 'ears'],
  ['mouth', 'jaw', 'cheeks', 'face'],
  ['proportions', 'symmetry', 'skin', 'hair'],
].map(ids => registry.categories.filter(category => ids.includes(category.id)).flatMap(category => category.rubrics))

export function parseEstimates(content: string, rubrics: Rubric[]): RubricEstimate[] {
  const parsed = z.object({ entries: z.array(estimateSchema) }).parse(JSON.parse(content))
  const expected = new Map(rubrics.map(rubric => [rubric.id, rubric]))
  const seen = new Set<string>()
  for (const [id, value] of parsed.entries) {
    const rubric = expected.get(id)
    if (!rubric || seen.has(id)) throw new Error('Unexpected or duplicate rubric ID')
    seen.add(id)
    if (value === null) continue
    if (['R', 'A', 'N', 'B', 'O'].includes(rubric.output) && typeof value !== 'number' && !Array.isArray(value)) throw new Error(`Expected numeric output for ${id}`)
    const numbers = typeof value === 'number' ? [value] : Array.isArray(value) ? value : []
    if (!rubricVectorSizes[id] && Array.isArray(value)) throw new Error(`Unexpected vector for ${id}`)
    if (rubricVectorSizes[id] && (!Array.isArray(value) || value.length !== rubricVectorSizes[id])) throw new Error(`Invalid vector for ${id}`)
    if (rubric.output === 'R' && numbers.some(number => number <= 0)) throw new Error(`Invalid ratio for ${id}`)
    if (rubric.output === 'A' && numbers.some(number => Math.abs(number) > 180)) throw new Error(`Invalid angle for ${id}`)
    if (rubric.output === 'B' && (typeof value !== 'number' || value < 0 || value > 200)) throw new Error(`Invalid difference for ${id}`)
    if (rubric.output === 'O' && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 4)) throw new Error(`Invalid ordinal for ${id}`)
    if (['T', 'D'].includes(rubric.output) && typeof value !== 'string') throw new Error(`Expected descriptive output for ${id}`)
  }
  if (seen.size !== expected.size) throw new Error('Incomplete rubric batch')
  return parsed.entries.map(([id, value, evidence]) => ({ id, value, evidence, source: 'llm-estimate', grade: null }))
}

export function geometryEntries(geometry: Geometry | null): RubricEstimate[] {
  if (!geometry || geometry.quality.faceTooSmall || geometry.quality.cropped || geometry.quality.noseOffsetRatio === null || geometry.quality.noseOffsetRatio > .15) return []
  const value = (id: string) => geometry.metrics.find(metric => metric.id === id)?.value ?? null
  const paired = (left: string, right: string) => { const a = value(left), b = value(right); return a === null || b === null ? null : [a, b] }
  const mouthPupil = value('eye-mouth')
  const aspects = paired('eye-aspect-left', 'eye-aspect-right')
  return [
    { id: 'eyes.spacing', value: geometry.quality.pupilSource === 'iris-centers' ? value('pupil-cheek') : null },
    { id: 'mouth.lip-ratio', value: value('central-lip-ratio') },
    { id: 'eyes.inner-gap', value: value('eye-spacing') },
    { id: 'eyes.aspect', value: aspects },
    { id: 'symmetry.eyes-opening', value: aspects && aspects.every(n => n > 0) ? 100 * Math.abs(aspects[0] - aspects[1]) / ((aspects[0] + aspects[1]) / 2) : null },
    { id: 'eyes.canthal-tilt', value: paired('canthal-left', 'canthal-right') },
    { id: 'mouth.pupil-ratio', value: geometry.quality.pupilSource === 'iris-centers' && mouthPupil && mouthPupil > 0 ? 1 / mouthPupil : null },
  ].filter(entry => entry.value !== null).map(entry => ({ ...entry, evidence: 'Approximate pixel-correct contour geometry; inspect capture conditions.', source: 'landmark-geometry', grade: null })) as RubricEstimate[]
}

// All batches inspect the same capture; disagreement means that requirement is not established.
export function reconcileEstimates(entries: RubricEstimate[], captures: Capture[]): { entries: RubricEstimate[]; capture: Capture } {
  if (!captures.length) throw new Error('Missing capture assessment')
  const capture = Object.fromEntries(Object.keys(captures[0]).map(key => [key, captures.every(item => item[key as keyof Capture] === true)])) as Capture
  const accepted = new Map(entries.map(entry => [entry.id, entry]))
  for (const rubric of allRubrics) {
    const entry = accepted.get(rubric.id)
    if (!entry) continue
    let reason: string | null = null
    if (/Front/i.test(rubric.capture) && !capture.front) reason = 'A clear frontal capture is required.'
    if (/Side/i.test(rubric.capture) && !/optional side/i.test(rubric.capture) && !capture.side) reason = 'A side capture is required.'
    if (/hairline/i.test(rubric.capture) && !capture.hairline) reason = 'The complete actual hairline is not established.'
    if (/neutral lids/i.test(rubric.capture) && !capture.neutralEyes) reason = 'Neutral open eyes are not established.'
    if (/neutral mouth|closed relaxed lips|neutral expression/i.test(`${rubric.capture} ${rubric.definition}`) && !capture.neutralMouth) reason = 'A relaxed neutral mouth is required.'
    if (/both ears|whole ear|no hair occlusion/i.test(rubric.capture) && !capture.bothEars) reason = 'Both complete ears must be visible.'
    if (/even light/i.test(rubric.capture) && !capture.evenLight) reason = 'Even lighting is not established.'
    if (/detail|resolution/i.test(rubric.capture) && !capture.detail) reason = 'Capture detail is insufficient or uncertain.'
    if (/style preference|style intent/i.test(rubric.capture)) reason = 'The chosen grooming style has not been supplied.'
    if (rubric.id === 'skin.blemishes' && typeof entry.value === 'number' && entry.value > 0 && /freckle|natural pigmentation/i.test(entry.evidence)) reason = 'Evidence conflates natural pigmentation with blemish appearance.'
    if (entry.source === 'landmark-geometry' && !capture.detail) reason = 'Capture detail does not support interpreting landmark measurements.'
    if (reason) accepted.set(rubric.id, { ...entry, value: null, evidence: reason, grade: null, positions: [] })
  }
  const thirds = ['proportions.upper-third', 'proportions.middle-third', 'proportions.lower-third'].map(id => accepted.get(id))
  if (thirds.every(entry => typeof entry?.value === 'number')) {
    const sum = thirds.reduce((total, entry) => total + (entry!.value as number), 0)
    if (Math.abs(sum - 1) > .05) for (const entry of thirds) accepted.set(entry!.id, { ...entry!, value: null, evidence: 'Estimated thirds do not sum consistently to the whole face.' })
  }
  const aspect = accepted.get('eyes.aspect')
  const eyeBalance = accepted.get('symmetry.eyes-opening')
  if (aspect && Array.isArray(aspect.value) && aspect.value.every(number => number > 0) && eyeBalance && capture.neutralEyes && capture.front) {
    accepted.set(eyeBalance.id, { ...eyeBalance, value: 100 * Math.abs(aspect.value[0] - aspect.value[1]) / ((aspect.value[0] + aspect.value[1]) / 2), evidence: 'Calculated from accepted left/right eye aspect ratios.', source: 'derived' })
  }
  const supported = [...accepted.values()].filter(entry => entry.value !== null)
  const proportions = supported.filter(entry => entry.id.startsWith('proportions.'))
  accepted.set('proportions.summary', { id: 'proportions.summary', value: proportions.length ? `${proportions.length} proportion relationships available; approximate, without a combined grade.` : null, evidence: 'Derived only from accepted proportion entries.', source: 'derived', grade: null })
  const effects = accepted.get('skin.capture-effects')
  accepted.set('skin.priorities', { id: 'skin.priorities', value: !capture.evenLight || !capture.detail ? 'Retake in even light with sufficient facial detail before interpreting skin observations.' : effects?.value ? `Review capture effects: ${effects.value}. Compare observations under consistent lighting.` : null, evidence: 'Capture guidance only; no treatment or diagnosis inferred.', source: 'derived', grade: null })
  return { entries: allRubrics.map(rubric => accepted.get(rubric.id)!), capture }
}

export async function evaluateV2(input: { imageDataUrl: string; geometry: Geometry | null }, options: { fetcher?: (url: string, options: RequestInit) => Promise<Response>; signal?: AbortSignal; graded?: boolean } = {}) {
  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) throw new Error('Moonshot is not configured')
  const model = process.env.KIMI_ANALYSIS_MODEL === 'kimi-k2.5' ? 'kimi-k2.6' : process.env.KIMI_ANALYSIS_MODEL ?? 'kimi-k2.6'
  const calculated = geometryEntries(input.geometry)
  const calculatedIds = new Set(calculated.map(entry => entry.id))
  const batchesToEstimate = rubricBatches.map(batch => batch.filter(rubric => (options.graded || !calculatedIds.has(rubric.id)) && rubric.output !== 'D'))
  const started = performance.now()
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 90_000)
  try {
    // Independent image assessments share the same geometry and run concurrently. No auto-retries or writes.
    const batches = await Promise.all(batchesToEstimate.map(async (rubrics, index) => {
      const batchStarted = performance.now()
      const response = await (options.fetcher ?? fetch)(`${process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1'}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, thinking: { type: 'disabled' }, temperature: .6, max_tokens: options.graded ? 4000 : 2600, response_format: { type: 'json_object' }, messages: [
          { role: 'system', content: 'Analyze visible facial appearance for entertainment. Never infer identity, ethnicity, health diagnoses, biological traits, intelligence or worth. Do not recommend medical treatments. Return JSON only. All estimates are approximate. Return null for obscured or unsupported features, and for side-only measurements from a frontal image. Do not invent physical millimeters or population percentiles.' + (options.graded ? ' Provide subjective cosmetic appearance grades, consistently applying the supplied rubric definitions. Grades are entertainment assessments, not medical or population measurements.' : ' Do not invent grading bands or attractiveness scores.') },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: input.imageDataUrl } },
            { type: 'text', text: `Return {"capture":{"front":true,"side":false,"hairline":null,"neutralEyes":null,"neutralMouth":null,"bothEars":null,"evenLight":null,"detail":null},"entries":[["rubric.id",value,"brief evidence"]]}. Assess every capture flag from the image: true only if clearly established, false if absent, null if uncertain. Hairline means the complete actual boundary, not an estimated forehead. A single frontal image cannot establish a side view. Natural freckles, facial hair and normal pigmentation are not blemishes. Descriptive terms must follow the requested vocabulary; uncertain means null for numeric values. The example capture flags are placeholders, not evidence. Exactly one entry per requested ID. R=ratio, A=degrees, N=numeric value using definition, B=normalized paired difference in %, O=integer appearance level 0–4 using the defined anchors, T=descriptive term, D=short explanation. Null if unavailable. Estimate brows.thickness, nose.nostril-visibility and nose.alar-angle from visible contours when upstream masks are absent. For proportions.angle-coordination estimate only when both referenced contours are visible. Missing detector geometry alone is not a reason to return null. Fully obscured features or missing required views must remain null. Return null for hair.grooming and hair.beard-grooming: style intent is not supplied. Evidence at most 12 words. If any member of a numeric vector is unavailable, return null for the whole rubric; never fill it with zero. For paired outputs use a two-number array [left,right]; other numeric vectors may have 2–5 numbers. B must be a single percentage. Required vector lengths: ${JSON.stringify(rubricVectorSizes)}. Always return exactly the specified vector length. Never add a mean, an average, or a label as another vector member. Do not average paired results. Do not repeat titles, units, recommendations or geometry coordinates. Only reuse a supplied value when its rubric ID and full definition match; never substitute another ratio or an incompatible measurement. Do not treat mesh forehead points as hairline points. Treat calculated upstream measurements as evidence, not universal aesthetic ideals.\n${options.graded ? 'For this web report use five-element tuples [id,value,evidence,grade,positions]. grade is a cosmetic appearance score 0–10: 0–2 markedly weak, 3–4 weak, 5–6 ordinary, 7–8 strong, 9–10 exceptional. For null values grade=null and positions=[]. Text rubrics MUST have grade=null and positions=[]; do not repeat raw measurements in positions. Rail visuals use grade and positions=[grade/10]. Capsule and Orbit visuals describe a two-sided balance interval: 0=markedly low/narrow/negative, .5=balanced reference, 1=markedly high/wide/positive, NOT a population percentile. Estimate a continuous position from the actual value and explain the relationship in evidence; paired values have paired positions. Do not put all values in the middle. For ears.protrusion and proportions.angle-coordination instead use quality positions=[grade/10]. Reuse exact canonical upstream values for matching rubric IDs while grading their visual relationships. Do not invent obscured anatomy. Descriptive evidence should discuss the feature itself, not measurement uncertainty.' : ''}\nRequested definitions: ${JSON.stringify(rubrics.map(({ id, output, definition, capture, visual }) => ({ id, output, definition, capture, ...(options.graded ? { visual } : {}) })))}\nUpstream geometry: ${JSON.stringify({ calculated, capture: input.geometry?.quality ?? null })}` },
          ] },
        ] }),
      })
      const headersMs = Math.round(performance.now() - batchStarted)
      if (!response.ok) throw new Error(`Moonshot batch ${index + 1} returned HTTP ${response.status}`)
      const completion = completionSchema.parse(await response.json())
      const choice = completion.choices[0]
      if (!choice || choice.finish_reason !== 'stop') throw new Error(`Moonshot batch ${index + 1} did not finish its JSON`)
      const capture = captureSchema.parse(JSON.parse(choice.message.content).capture)
      const entries = options.graded ? parseGradedEstimates(choice.message.content, rubrics) : parseEstimates(choice.message.content, rubrics)
      return { entries, capture, timing: { batch: index + 1, rubricCount: entries.length, headersMs, totalMs: Math.round(performance.now() - batchStarted), usage: completion.usage ?? null } }
    }))
    const reconciled = reconcileEstimates(options.graded ? batches.flatMap(batch => batch.entries).map(entry => { const canonical = calculated.find(item => item.id === entry.id); return canonical ? { ...entry, value: canonical.value, source: canonical.source } : entry }) : [...calculated, ...batches.flatMap(batch => batch.entries)], batches.map(batch => batch.capture))
    return { version: 2 as const, status: 'experimental' as const, model, geometry: input.geometry, ...reconciled, timing: { totalMs: Math.round(performance.now() - started), targetMs: 30_000, batches: batches.map(batch => batch.timing) } }
  } catch (error) {
    controller.abort() // Cancel sibling requests rather than leave paid work running after a failure.
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

const gradeSchema = z.number().finite().min(0).max(10)
const positionsSchema = z.array(z.number().finite().min(0).max(1)).max(5)
export function parseGradedEstimates(content: string, rubrics: Rubric[]): RubricEstimate[] {
  const raw = z.object({ entries: z.array(z.array(z.unknown()).min(3).max(5)) }).parse(JSON.parse(content))
  const byId = new Map(rubrics.map(rubric => [rubric.id, rubric]))
  const seen = new Set<string>()
  const values = raw.entries.map(tuple => {
    const id = z.string().parse(tuple[0])
    const rubric = byId.get(id)
    if (!rubric || seen.has(id)) throw new Error('Unexpected or duplicate rubric ID')
    seen.add(id)
    try { return parseEstimates(JSON.stringify({ entries: [tuple.slice(0, 3)] }), [rubric])[0] }
    catch { return { id, value: null, evidence: 'Unsupported observation format.', source: 'llm-estimate' as const, grade: null } }
  })
  if (seen.size !== byId.size) throw new Error('Incomplete rubric batch')
  return values.map((entry, index) => {
    const rubric = rubrics.find(item => item.id === entry.id)!
    if (entry.value === null || rubric.visual === 'Text') return { ...entry, grade: null, positions: [] }
    // Optional presentation data must not discard valid feature observations. Invalid
    // enrichment becomes a normal card; it is never clamped into a made-up grade/position.
    const grade = gradeSchema.safeParse(raw.entries[index][3]).data ?? null
    const positions = positionsSchema.safeParse(raw.entries[index][4]).data ?? []
    return { ...entry, grade, positions: rubric.visual === 'Rail' && grade !== null ? [grade / 10] : positions }
  })
}
