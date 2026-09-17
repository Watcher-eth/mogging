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
PSL is internally calibrated on 0-8: ordinary faces 3.5-5.2, attractive 5.5-6.8, model-tier 7.0-7.9, 8.0 only near-ideal. All report category "score" values, including overall, must be 0-10 display scores.
If no real human face is visible, set faceDetected=false, use empty metricScores/categories, and return empty landmarks.`

export function buildAnalysisPrompt(
  gender: AnalyzeFaceInput['gender'],
  options: { compact?: boolean } = {}
) {
  const explanationLength = options.compact ? '8-14 words' : '12-22 words'
  const summaryLength = options.compact ? 'one sentence' : 'two short sentences'
  const featureCount = options.compact ? 'exactly 4' : 'at least 4 and at most 6'
  const compactRequirements = options.compact
    ? `
- Keep every feature label under 4 words and every feature value under 7 words.
- Keep every recommendation under 220 characters, preserving the finding and concrete action. Keep every metric description under 10 words.
- Use no whitespace outside JSON string values.`
    : ''

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
    "potential": {"score": number, "label": string, "summary": string, "focusAreas": [string]},
    "categories": [{"id": string, "title": string, "subtitle": string, "scoreLabel": string, "score": number, "features": [{"label": string, "value": string}], "explanation": string, "recommendation": string}]
  },
  "landmarks": {"version": 1, "source": "kimi-vision-estimate", "confidence": number, "image": {"width": number, "height": number}, "anchors": {"anchorName": {"x": number, "y": number}}}
}

Hard requirements:
- Include a report object with exactly the 11 listed category ids.
- Category id literals must include "id": "facial-fat", "id": "biological-age", and "id": "sun-damage".
- report.categories must contain exactly these 11 ids, in this order: ${CATEGORY_IDS.join(', ')}.
- Every category must have ${featureCount} features.
- Every category "score" must be a 0-10 number. Do not use apparent age in years, percentages, or PSL /8 as a category score.
- Feature labels and values must be approachable but precise. Prefer values like "7.2/10", "mild right drift", "slight downward tilt", "balanced width", or "low visible texture" over vague values like "aligned", "centered", "clean", "high", "measured", or "good".
- The overall category features must be exactly these six scored facial qualities, in this order: Eye area, Jaw & chin, Cheekbone structure, Facial thirds, Symmetry, Skin quality. Every value must be a 0-10 score formatted like "7.2/10". Never include market fit, approachability, distinctiveness, versatility, casting, archetypes, social impressions, percentile, or potential in overall features.
- Eye feature values should explain eye-line level, spacing, and lid support in plain terms.
- Eye features should cover canthal tilt, eye spacing, upper-eyelid exposure or hooding, and under-eye support when visible.
- Nose feature values should explain bridge straightness, midline drift, and width relative to the midface in plain terms.
- Jaw features should cover gonial angle, chin projection, mandibular width, and neck transition when visible.
- Face-shape features should cover facial thirds, facial width-to-height balance, cheekbone width or projection, and chin taper when visible.
- Mouth features should cover mouth width, upper-to-lower lip balance, philtrum or lower-third fit, and resting-line symmetry when visible.
- Symmetry feature values should quantify or describe drift direction and severity, not just say centered/aligned.
- report.potential must estimate the user's realistic PSL potential after improving the 1-4 highest-leverage visible/cosmetic areas. Keep the score on the 0-8 PSL scale and never more than 1.2 points above pslScore.
- Every subtitle must be under 10 words.
- Every explanation must be personalized to the visible face in this exact image and ${explanationLength}.
- Every recommendation must name a specific feature or finding from that category in this image and give one or two concrete actions suited to it. Stay under 220 characters. Say what to do and how or when; never merely repeat the explanation or tell everyone to retake photos.
- Tailor the action to BOTH the category score and its feature findings. At 8-10, maintain the strength or prevent deterioration; at 6-7.9, suggest a modest refinement of the named concern; below 6, prioritize the most actionable visible concern. A low score never justifies aggressive treatment or implies disease. Different findings must produce different advice even at identical scores.
- Category-specific recommendation boundaries:
  * eyes: address the observed brow shape, lid presentation, or under-eye contrast using gentle grooming or optional cosmetics. Do not promise to change canthal tilt, eye spacing, or orbital anatomy with exercises or diet.
  * nose: optional cosmetic styling for the observed bridge/width/contrast. No nasal slimming, decongestion, water/sodium advice, or claims that grooming changes cartilage.
  * mouth: lip balm for visible dryness, optional lip definition for observed proportions, or preserving an already balanced presentation. Do not recommend changing teeth or jaw anatomy.
  * jaw: grooming or hairstyle framing for the observed lower-face outline; distinguish presentation from fixed bone structure. No jaw trainers, chewing exercises, chin tucks, supplements, or guaranteed bone changes.
  * dimorphism: optional styling matched to the requested gender presentation and visible feature contrast. Do not assume everyone wants facial hair; no hormones or biological claims.
  * face-shape: specify where to add or reduce hair volume based on this face's width, length, thirds, or taper. Never give opposite haircut advice to the same shape. No generic debloating routine.
  * facial-fat: address only observed fullness or definition with reversible grooming/presentation choices; do not infer body-fat percentage, fluid retention, diet, or a need to lose weight from a photo. No potassium, supplements, dehydration, or weight-loss prescriptions.
  * biological-age: title Skin Age. Prioritize broad-spectrum, water-resistant SPF 50+ sunscreen and gentle moisturizer where appropriate to the visible texture/dryness findings. For high scores emphasize maintenance/prevention; for visible dryness suggest moisturizer after gentle washing; for under-eye contrast use optional gentle cosmetic coverage. Never infer skin type or prescribe actives from an image. No debloating, water/potassium, hairstyle, or bone advice.
  * sun-damage: prioritize broad-spectrum, water-resistant SPF 50+, shade, a broad-brimmed hat, and UV-protective clothing. If sunscreen is the action, specify reapplication every two hours outdoors and after swimming/sweating per label. Do not diagnose UV damage or promise to reverse pigmentation from a photo. Protection still matters at high scores.
  * symmetry: name the observed feature and use reversible brow/hair/cosmetic balancing where appropriate; do not claim exercises or chewing fix skeletal asymmetry. If the finding is uncertain, say no structural action is supported.
  * overall: prioritize the lowest-scoring actionable category and reuse its finding-specific next step, not a generic glow-up checklist.
- Sunscreen and gentle moisturizer are allowed general skin-care recommendations. Do not recommend procedures, medications, supplements, retinoids, fillers, surgery, orthodontics, diagnoses, or medical treatment. Do not invent allergies, skin type, skincare history, habits, or symptoms. If a feature is not visible, state that no specific action is supported rather than inventing a concern.
- For biological-age, title it "Skin Age", subtitle must be "Visible age cues", scoreLabel must be "Age signal", score must be a 0-10 visible-age-presentation score, and features must include Apparent age, Texture age cue, Under-eye cue, and Skin damage. Put the apparent age in years only in the Apparent age feature value.
- report.summary must be personalized and ${summaryLength}.
- metricScores must contain 6 concise items.
- landmarks.anchors should include these normalized 0-1 points when visible: ${LANDMARK_ANCHORS.join(', ')}.
- Landmark coordinates are normalized inside the source image, not the displayed crop.
- Scores must be calibrated, not inflated.
- Do not use the golden ratio, claim objective worth, or make a medical diagnosis; never classify or imply an apparent age below 18.
- For facial-fat, title it "Facial definition", scoreLabel must be "Definition score", and never show a body-fat percentage. Higher scores mean clearer cheek and lower-face definition; the category is a cosmetic visual estimate only.
- Finish the JSON. Prefer terse values over long text.${compactRequirements}`
}
