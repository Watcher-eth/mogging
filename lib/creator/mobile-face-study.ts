import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { createMotionTrack, parseComposition, type VideoScene } from './video-composition'
import { scriptTokens } from './video-script'
import { videoSize } from './video-layout'

export const studyImageId = 'private-portrait'

export type StudyScriptContext = {
  goals: string[]
  returning: boolean
  protocolTaskKeys?: string[]
  checkIn?: { change: 'improving' | 'same' | 'worse'; effort: 'manageable' | 'too-much' }
  previousFace?: FaceLandmarksPayload
}

const goalLabels = new Map([
  ['eyes', 'the frame around your eyes'], ['eyebrows', 'brow definition'], ['jaw', 'your jawline'],
  ['skin-age', 'how your skin looks'], ['symmetry', 'paired feature proportions'], ['hair', 'how your hair frames your face'],
  ['nose', 'how your nose fits the rest of your face'], ['lips', 'your lip shape'], ['cheekbones', 'cheek definition'],
  ['facial-fat', 'your lower-face outline'], ['overall', 'relationships between facial landmarks'],
  ['mouth', 'your lip shape'], ['skin-quality', 'how your skin looks'], ['face-shape', 'your face shape'],
])

const checkInBeats = {
  improving: 'Last check-in, you said things were improving. Keep track of what felt worth doing.',
  same: 'Last check-in, you said things felt about the same. Give one step your attention so you can tell whether it helps.',
  worse: 'Last check-in, you said things felt worse. This is a good time to keep the routine simple and revisit what felt off.',
}

const protocolBeats: Record<string, string> = {
  'brow-set': 'Start with the spoolie step in your Protocol. Brush the inner hairs up and the tails out. You’re giving the eyes a cleaner frame with the brow you already have.',
  'grooming-edges': 'Start with your Protocol’s beard neckline step. Clear only the stray hairs below your existing line. The aim is a cleaner edge, so leave the shape itself alone.',
  'beard-taper': 'Try the beard blend in your Protocol. Keep the chin length and start with a longer guard at the sides. That lets you adjust where the beard carries its weight.',
  'gentle-cleanser': 'Keep the gentle cleanser step in your Protocol simple. Use your fingertips and skip the scrub. Give that routine time before deciding what else to change.',
  'skin-barrier': 'Start with the moisturizer step in your Protocol if you already tolerate the product. Keep the rest of your routine steady so you can tell how your skin responds.',
}

function lowerFaceProportion({ anchors: a, image: { width, height } }: FaceLandmarksPayload) {
  if (!a.noseTip || !a.forehead || !a.chin) return
  const faceHeight = Math.hypot((a.forehead.x - a.chin.x) * width, (a.forehead.y - a.chin.y) * height)
  if (!faceHeight) return
  return Math.round(100 * Math.hypot((a.noseTip.x - a.chin.x) * width, (a.noseTip.y - a.chin.y) * height) / faceHeight)
}

export function compileMobileFaceStudy(face: FaceLandmarksPayload, seed: string, context?: StudyScriptContext) {
  const a = face.anchors
  const { width, height } = face.image
  const distance = (p?: NormalizedPoint, q?: NormalizedPoint) =>
    p && q ? Math.hypot((p.x - q.x) * width, (p.y - q.y) * height) : undefined
  const span = distance(a.leftPupil, a.rightPupil)
  const ratio = (numerator?: number, denominator?: number) =>
    numerator !== undefined && denominator && denominator > 0 ? Math.round(100 * numerator / denominator) : undefined
  const tilt = span && a.leftPupil && a.rightPupil
    ? Math.round(Math.asin(Math.min(1, Math.abs(a.leftPupil.y - a.rightPupil.y) * height / span)) * 180 / Math.PI)
    : undefined
  const pixels = (p?: NormalizedPoint, q?: NormalizedPoint) => {
    const length = distance(p, q)
    return length === undefined ? undefined : Math.round(length)
  }
  // Project the nose tip onto the pupil line so in-plane head roll does not inflate the offset.
  const eyeMidlineOffset = span && a.leftPupil && a.rightPupil && a.noseTip
    ? Math.round(Math.abs(
      (a.noseTip.x - (a.leftPupil.x + a.rightPupil.x) / 2) * (a.rightPupil.x - a.leftPupil.x) * width ** 2
      + (a.noseTip.y - (a.leftPupil.y + a.rightPupil.y) / 2) * (a.rightPupil.y - a.leftPupil.y) * height ** 2
    ) / span)
    : undefined
  const jawBend = (() => {
    if (!a.leftCheek || !a.jawLeft || !a.chin) return
    const upper = Math.atan2((a.leftCheek.y - a.jawLeft.y) * height, (a.leftCheek.x - a.jawLeft.x) * width)
    const lower = Math.atan2((a.chin.y - a.jawLeft.y) * height, (a.chin.x - a.jawLeft.x) * width)
    if (!distance(a.leftCheek, a.jawLeft) || !distance(a.chin, a.jawLeft)) return
    const difference = Math.abs(upper - lower)
    return Math.round(Math.min(difference, 2 * Math.PI - difference) * 180 / Math.PI)
  })()
  const leftEyeWidth = distance(a.leftEyeInner, a.leftEyeOuter)
  const rightEyeWidth = distance(a.rightEyeInner, a.rightEyeOuter)
  const lowerFaceShare = lowerFaceProportion(face)
  const browRatio = ratio(distance(a.leftBrow, a.leftPupil), span)
  const mouthRatio = ratio(distance(a.mouthLeft, a.mouthRight), span)
  const eyeWidthRatio = leftEyeWidth !== undefined && rightEyeWidth !== undefined
    ? ratio(Math.min(leftEyeWidth, rightEyeWidth), Math.max(leftEyeWidth, rightEyeWidth)) : undefined
  const shots = [
    { feature: 'whole', guide: 'face:outline', category: 'overall', label: 'Nasal tip offset', value: eyeMidlineOffset, unit: 'px', reference: 'nose offset from eye midpoint', text: 'The interpupillary axis runs through the pupil centers. Project the nasal tip onto that line, then compare it with the midpoint. This isolates sideways offset from vertical spacing.' },
    { feature: 'eyes', guide: 'study:pupil-axis', category: 'eyes', label: 'Interpupillary axis tilt', value: tilt, unit: '°', reference: 'from horizontal', text: 'Interpupillary axis tilt tells you how the pupil line sits relative to horizontal. Use it as a reference for orientation. Compare each eye between its own corners to assess its shape.' },
    { feature: 'brows', guide: 'study:brow-spacing', category: 'brows', label: 'Brow-to-pupil span', value: browRatio, unit: '%', reference: 'of pupil spacing', text: browRatio === undefined ? 'The periocular frame is the area around the eye. Compare the brow-to-pupil span with interpupillary distance to put both on the same scale.' : `Your brow-to-pupil span is ${browRatio} percent of your interpupillary distance on this side. This describes the vertical spacing between those landmarks relative to the pupil span.` },
    { feature: 'nose', guide: 'study:nose-axis', category: 'nose', label: 'Bridge-to-tip span', value: pixels(a.noseBridge, a.noseTip), unit: 'px', reference: 'bridge to tip in this photo', text: 'The nasal dorsum runs along the bridge toward the pronasale, the landmark at the tip. This span describes their relationship in the image. Forward tip projection needs a side view.' },
    { feature: 'lips', guide: 'study:mouth-width', category: 'mouth', label: 'Intercommissural width', value: mouthRatio, unit: '%', reference: 'of pupil spacing', text: mouthRatio === undefined ? 'Cheilion is the corner of the mouth. The distance between the two cheilions gives mouth width. The vermilion border defines the shape inside that span.' : `Your intercommissural width, from one mouth corner to the other, is ${mouthRatio} percent of your pupil spacing. That puts mouth width in proportion to your own features. The vermilion border shows how the lips fill that span.` },
    { feature: 'philtrum', guide: 'study:philtrum', category: 'mouth', label: 'Nose to upper lip', value: pixels(a.noseTip, a.upperLip), unit: 'px', reference: 'nose tip to upper lip', text: 'The upper vermilion border is where the colored part of the lip begins. Our line runs from the nasal tip to that border. The anatomical philtrum starts lower, at the base of the nose.' },
    { feature: 'jaw', guide: 'study:jaw-bend', category: 'jaw', label: 'Frontal jaw contour angle', value: jawBend, unit: '°', reference: 'left jaw bend in this photo', text: jawBend === undefined ? 'Follow the lateral jaw contour into the chin. The bend in that outline describes the frontal silhouette. The skeletal gonial angle uses the mandibular ramus and body on a radiograph.' : `Your frontal jaw contour has an included angle of about ${jawBend} degrees. An angle closer to a straight line makes the transition into the chin more gradual. The skeletal gonial angle uses the mandibular ramus and body on a radiograph.` },
    { feature: 'whole', guide: 'study:skin-light', category: 'skin', label: 'Skin texture', text: 'Texture describes visible surface details, including pores and fine lines. The mapped regions help identify where an observation comes from. You can choose a specific detail to follow in later evaluations.' },
    { feature: 'whole', guide: 'study:skin-color', category: 'skin', label: 'Skin tone variation', text: 'Skin tone variation describes differences in visible color across the mapped regions. The cheek and forehead regions provide a consistent way to locate observations. These observations describe visible detail and do not diagnose a skin condition.' },
    { feature: 'eyes', guide: 'study:paired-eyes', category: 'symmetry', label: 'Palpebral fissure width ratio', value: eyeWidthRatio, unit: '%', reference: 'narrower opening as a share of the wider one', text: eyeWidthRatio === undefined ? 'Palpebral fissure width measures from the inner to the outer canthus, the two corners of the eye opening. Compare those spans to isolate width from eyelid height.' : `The smaller palpebral fissure measurement, or eye-opening width, is ${eyeWidthRatio} percent of the larger one here. We measure from inner to outer canthus on each side. That isolates width from eyelid height.` },
    { feature: 'whole', guide: 'study:face-proportions', category: 'proportions', label: 'Nasal tip-to-chin proportion', value: lowerFaceShare, unit: '%', reference: 'nose-to-chin span relative to forehead-to-chin span', text: lowerFaceShare === undefined ? 'Compare the nasal tip-to-chin span with the forehead-to-chin span. That expresses the lower portion in relation to the whole measured span.' : `Your nasal tip-to-chin span is ${lowerFaceShare} percent of the forehead-to-chin span. That gives you a reference for how much of the measured face span sits below the nasal tip.` },
    { feature: 'whole', guide: 'face:outline', category: 'face-shape', label: 'Your next step', text: 'Choose the relationship you most want to work on. Use the matching step in your Protocol and judge it against that specific goal. Brow grooming changes the visible frame around the eye, while your skin routine targets surface concerns.' },
  ] as const
  const script = new Map<number, string>()
  if (context) {
    const goals = [...new Set(context.goals.flatMap(goal => goalLabels.get(goal) ?? []))].slice(0, 2)
    const focus = goals.join(' and ') || 'relationships between facial landmarks'
    const opening = context.returning ? 'Let’s pick up where we left off.' : 'Let’s start with what matters to you.'
    script.set(0, `${opening} You’re here to understand ${focus}. Start with the axis through the centers of your pupils. We’ll use landmark measurements to explain how those features relate.`)

    const actions = (context.protocolTaskKeys ?? []).flatMap(key =>
      Object.prototype.hasOwnProperty.call(protocolBeats, key) ? [protocolBeats[key]] : [])
    const checkIn = context.checkIn
    const keepItSmall = checkIn?.effort === 'too-much' || checkIn?.change === 'worse'
    const progress = checkIn && (checkIn.effort === 'too-much'
      ? 'You said the routine was starting to feel like too much. Let’s keep the next step small.'
      : checkInBeats[checkIn.change])
    const nextSteps = actions.slice(0, keepItSmall ? 1 : 2)
    if (progress || nextSteps.length) {
      script.set(11, [progress, ...(nextSteps.length ? nextSteps : ['Pick one step from your Protocol that feels manageable this week.'])].filter(Boolean).join(' '))
    }

    // Compare the same normalized measurement only when both photos support it.
    const previousShare = context.previousFace && lowerFaceProportion(context.previousFace)
    if (context.returning && previousShare !== undefined && lowerFaceShare !== undefined
      && previousShare > 0 && previousShare < 100 && lowerFaceShare > 0 && lowerFaceShare < 100
      && context.previousFace?.source === face.source) {
      const delta = Math.abs(previousShare - lowerFaceShare)
      script.set(10, delta < 3
        ? `The lower-face proportion reads much the same as your last study. It’s about ${lowerFaceShare} percent here. That gives you a consistent reference for how the mouth and chin sit together.`
        : `Your nose-to-chin span reads ${lowerFaceShare} percent here, compared with ${previousShare} percent last time. Treat that as a difference between portraits. Chin position can shift the reading.`)
    }
  }
  const variation = Array.from(seed).reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 0) % 10000
  const notes = [
    'Pupil midpoint vs. nose tip', 'Pupil axis vs. horizontal', 'Brow to pupil', 'Bridge to tip',
    'Mouth corners', 'Nose tip to upper lip', 'Projected jaw corner', '', '', 'Inner to outer corners', 'Nose to chin', 'Your Protocol',
  ]
  const readouts = [
    'Use your pupil midpoint as a reference', 'Separate axis tilt from eye shape', 'Normalize the brow span to pupil spacing',
    'Follow the bridge to the tip', 'Read mouth width relative to pupil spacing', 'Read the nasal tip-to-upper-lip span',
    'Follow the cheek-to-chin turn', 'Look at surface detail across the cheek', 'Distinguish tone from texture',
    'Compare inner-to-outer canthus spans', 'See how your lower face fits the whole', 'Choose the observations you want to follow',
  ]
  const revealWords = [
    /pupils|midpoint|center/, /pupils|line/, /brow|brows/, /bridge/, /corners/, /lip/,
    /turns|contour|edge/, /light|highlight/, /cheek|forehead/, /eyes|eye/, /chin|lengths/, /distance|partings/,
  ]
  const treatments = ['note', 'arrow', 'bracket', 'landmarks', 'bracket', 'arrow', 'callout', 'note', 'note', 'bracket', 'arrow', 'scribble'] as const
  let startMs = 0
  const scenes = shots.map((shot, index): VideoScene => {
    const closing = index === shots.length - 1
    const durationMs = closing ? 9000 : index === 0 ? 8000 : 8500
    const text = script.get(index) ?? shot.text
    const words = scriptTokens(text)
    const labelWord = Math.max(0, words.findIndex(word => revealWords[index].test(word.text.toLowerCase())))
    const scene: VideoScene = {
      id: `study-${index}`, label: shot.label, startMs, durationMs,
      source: { kind: 'portrait', imageId: studyImageId, categoryId: shot.category, overlay: 'none', hideScores: true, hidePotential: true, currentScore: 0, potentialScore: 0, metricScore: 0 },
      delivery: { direction: index === 0 ? 'Open with curiosity and land on the visual clue.' : 'Sound warm and conversational while explaining a measured observation. Be curious, direct and conversational. Give the observation room to land.', emphasis: [], pauseAfterMs: 500 },
      studyReadout: closing ? 'Choose one step from your Protocol' : readouts[index],
      text, subtitle: '',
      studyMeasurement: 'value' in shot && shot.value !== undefined ? { name: shot.label, value: shot.value, unit: shot.unit, reference: shot.reference } : undefined, narration: text, cueId: '', focus: 'hero',
      framing: 'captioned', layout: 'portrait', studyCutout: index === 6 || undefined, editorial: index === 0 || closing ? 'context' : 'detail',
      portraitProgram: {
        wordCount: words.length,
        actions: [{ word: 0, labelWord, feature: shot.feature, guide: shot.guide, label: notes[index], treatment: treatments[index] }],
      },
      tracks: [
        { ...createMotionTrack(index === 0 ? 'hard-cut' : 'crossfade', 'content', durationMs), durationMs: index === 0 ? 1 : 920 },
        { ...createMotionTrack('caption-swish', 'text', durationMs), durationMs },
      ],
    }
    startMs += durationMs
    return scene
  })
  return parseComposition({ version: 1, privateStudy: true, title: 'Your portrait study', ...videoSize, fps: 30,
    style: 'creator', theme: 'light', recipe: 'portrait-audit', variation, durationMs: startMs, scenes })
}
