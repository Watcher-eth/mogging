import type { AnalyzeFaceInput } from './schema'

const CATEGORY_IDS = [
  'eyes',
  'nose',
  'mouth',
  'jaw',
  'dimorphism',
  'face-shape',
  'facial-fat',
  'biological-age',
  'symmetry',
  'sun-damage',
  'overall',
] as const

const LANDMARK_ANCHORS = [
  'leftEyeOuter',
  'leftEyeInner',
  'rightEyeInner',
  'rightEyeOuter',
  'leftPupil',
  'rightPupil',
  'leftBrow',
  'rightBrow',
  'noseBridge',
  'noseTip',
  'mouthLeft',
  'mouthRight',
  'mouthCenter',
  'upperLip',
  'lowerLip',
  'leftCheek',
  'rightCheek',
  'chin',
  'jawLeft',
  'jawRight',
  'forehead',
] as const

export const ANALYSIS_SYSTEM_PROMPT = `You analyze face photos for an entertainment app.
Return only valid JSON. No markdown. No prose outside JSON.
Assess visible facial aesthetics only. Do not infer identity, ethnicity, morality, intelligence, health diagnosis, fertility, or real-world worth.
Do not claim objective health, fertility, morality, competence, intelligence, or medical status from appearance.
PSL is 0-8: ordinary faces 3.5-5.2, attractive 5.5-6.8, model-tier 7.0-7.9, 8.0 only near-ideal. Other scores are 0-10.
If no real human face is visible, set faceDetected=false, use empty metricScores/categories, and return empty landmarks.`

export function buildAnalysisPrompt(
  gender: AnalyzeFaceInput['gender'],
  options: { compact?: boolean } = {}
) {
  const explanationLength = options.compact ? '8-14 words' : '12-22 words'
  const summaryLength = options.compact ? 'one sentence' : 'two short sentences'

  return `Analyze this frontal face image. Gender scoring mode: ${gender}.

Return one complete JSON object matching this schema:
{
  "faceDetected": boolean,
  "pslScore": number|null,
  "harmonyScore": number,
  "symmetryScore": number,
  "proportionalityScore": number,
  "averagenessScore": number,
  "dimorphismScore": number,
  "angularityScore": number,
  "metricScores": [{"name": string, "score": number, "category": "symmetry"|"proportionality"|"averageness"|"dimorphism"|"angularity"|"skin"|"presentation"|"harmony"|"misc", "description": string}],
  "percentile": number,
  "tier": string,
  "tierDescription": string,
  "report": {
    "summary": string,
    "categories": [{"id": string, "title": string, "subtitle": string, "scoreLabel": string, "score": number, "features": [{"label": string, "value": string}], "explanation": string, "recommendation": string}]
  },
  "landmarks": {"version": 1, "source": "kimi-vision-estimate", "confidence": number, "image": {"width": number, "height": number}, "anchors": {"anchorName": {"x": number, "y": number}}}
}

Hard requirements:
- Include a report object with exactly the 11 listed category ids.
- Category id literals must include "id": "facial-fat", "id": "biological-age", and "id": "sun-damage".
- report.categories must contain exactly these 11 ids, in this order: ${CATEGORY_IDS.join(', ')}.
- Every category must have exactly 3 features.
- Every subtitle must be under 10 words.
- Every explanation must be personalized to the visible face in this exact image and ${explanationLength}.
- Every recommendation must be the single highest-leverage next move for that category, personalized and concrete. Keep recommendations cosmetic and non-medical. They may mention grooming, hairstyle, lighting, posture, expression, photo consistency, styling, and general non-treatment routine habits. Do not recommend procedures, medications, supplements, diagnoses, SPF, retinoids, fillers, surgery, orthodontics, dermatology care, or medical/health interventions.
- For biological-age, title it "Human age", subtitle must be "Visible age cues", scoreLabel must be "Human age", score must be a real apparent age in years from 18-80, and the three features must be Human age, Texture age cue, and Texture cue.
- report.summary must be personalized and ${summaryLength}.
- metricScores must contain 6 concise items.
- landmarks.anchors should include these normalized 0-1 points when visible: ${LANDMARK_ANCHORS.join(', ')}.
- Landmark coordinates are normalized inside the source image, not the displayed crop.
- Scores must be calibrated, not inflated.
- Do not use the golden ratio, claim objective worth, or make a medical diagnosis; never classify or imply an apparent age below 18.
- For facial-fat, title it "Soft tissue", scoreLabel must be "Soft tissue", and never show a body-fat percentage. The category is a cosmetic soft-tissue fullness estimate only.
- Finish the JSON. Prefer terse values over long text.`
}
