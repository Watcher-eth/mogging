import type { AnalyzeFaceInput } from './schema'

export const ANALYSIS_SYSTEM_PROMPT = `You analyze face photos for an entertainment app.
Return only valid JSON. Do not include markdown.
Assess visible facial aesthetics only. Do not infer identity, ethnicity, morality, intelligence, health diagnosis, fertility, or real-world worth.
PSL is 0-8: ordinary faces 3.5-5.2, attractive 5.5-6.8, model-tier 7.0-7.9, 8.0 only near-ideal. Other scores are 0-10.
If no real human face is visible, set faceDetected=false and return empty landmarks.`

export function buildAnalysisPrompt(gender: AnalyzeFaceInput['gender']) {
  return `Analyze this frontal face image. Gender scoring mode: ${gender}.

Return this compact JSON shape:
{
  "faceDetected": true,
  "pslScore": 5.0,
  "harmonyScore": 5.0,
  "symmetryScore": 5.0,
  "proportionalityScore": 5.0,
  "averagenessScore": 5.0,
  "dimorphismScore": 5.0,
  "angularityScore": 5.0,
  "metricScores": [
    { "name": "Eye symmetry", "score": 5.0, "category": "symmetry", "description": "short" },
    { "name": "Facial thirds", "score": 5.0, "category": "proportionality", "description": "short" },
    { "name": "Feature harmony", "score": 5.0, "category": "averageness", "description": "short" },
    { "name": "Dimorphism", "score": 5.0, "category": "dimorphism", "description": "short" },
    { "name": "Jaw and cheek definition", "score": 5.0, "category": "angularity", "description": "short" },
    { "name": "Skin and presentation", "score": 5.0, "category": "presentation", "description": "short" }
  ],
  "percentile": 70,
  "tier": "brief tier",
  "tierDescription": "brief calibrated description",
  "report": {
    "summary": "2-4 sentence personalized assessment based on this specific face image",
    "categories": [
      {
        "id": "eyes",
        "title": "Eyes",
        "subtitle": "personalized short assessment of the eye area",
        "scoreLabel": "Eye area",
        "score": 5.0,
        "features": [
          { "label": "Eye line", "value": "Balanced" },
          { "label": "Lid support", "value": "Defined" }
        ],
        "explanation": "Specific assessment of this person's visible eye spacing, tilt, lid support, and symmetry."
      },
      {
        "id": "nose",
        "title": "Nose",
        "subtitle": "personalized short assessment of the nose and central axis",
        "scoreLabel": "Nasal balance",
        "score": 5.0,
        "features": [
          { "label": "Bridge", "value": "Straight" },
          { "label": "Tip", "value": "Centered" }
        ],
        "explanation": "Specific assessment of this person's visible bridge, width, projection, and alignment with the facial center."
      },
      {
        "id": "mouth",
        "title": "Mouth",
        "subtitle": "personalized short assessment of lip proportion",
        "scoreLabel": "Mouth line",
        "score": 5.0,
        "features": [
          { "label": "Width", "value": "Balanced" },
          { "label": "Fullness", "value": "Moderate" }
        ],
        "explanation": "Specific assessment of this person's lip width, fullness, symmetry, and lower-midface fit."
      },
      {
        "id": "jaw",
        "title": "Jaw",
        "subtitle": "personalized short assessment of jaw and chin structure",
        "scoreLabel": "Jawline",
        "score": 5.0,
        "features": [
          { "label": "Mandible", "value": "Defined" },
          { "label": "Chin", "value": "Supported" }
        ],
        "explanation": "Specific assessment of this person's visible mandibular definition, chin support, and lower-third angularity."
      },
      {
        "id": "dimorphism",
        "title": "Dimorphism",
        "subtitle": "personalized short assessment of feature contrast",
        "scoreLabel": "Dimorphism",
        "score": 5.0,
        "features": [
          { "label": "Brow", "value": "Moderate" },
          { "label": "Angularity", "value": "Balanced" }
        ],
        "explanation": "Specific assessment of visible sex-typical structure, maturity, angularity, and soft-tissue contrast for the selected scoring mode."
      },
      {
        "id": "face-shape",
        "title": "Face shape",
        "subtitle": "personalized short assessment of facial frame",
        "scoreLabel": "Face shape",
        "score": 5.0,
        "features": [
          { "label": "Outline", "value": "Oval" },
          { "label": "Thirds", "value": "Balanced" }
        ],
        "explanation": "Specific assessment of this person's visible outline, cheekbone width, lower third, and silhouette continuity."
      },
      {
        "id": "facial-fat",
        "title": "Facial fat",
        "subtitle": "personalized short visual estimate of leanness",
        "scoreLabel": "Facial fat %",
        "score": 5.0,
        "features": [
          { "label": "Cheeks", "value": "Balanced" },
          { "label": "Jaw blur", "value": "Low" }
        ],
        "explanation": "Specific cosmetic visual estimate from this person's cheek fullness, under-chin area, and jaw clarity. Do not frame it as medical body-fat measurement."
      },
      {
        "id": "biological-age",
        "title": "Biological age",
        "subtitle": "personalized short visible youthfulness signal",
        "scoreLabel": "Age signal",
        "score": 5.0,
        "features": [
          { "label": "Texture", "value": "Clear" },
          { "label": "Under-eye", "value": "Stable" }
        ],
        "explanation": "Specific cosmetic assessment of visible texture, under-eye presentation, facial fullness, and image clarity. Do not classify or imply an apparent age below 18."
      },
      {
        "id": "symmetry",
        "title": "Symmetry",
        "subtitle": "personalized short assessment of facial alignment",
        "scoreLabel": "Symmetry",
        "score": 5.0,
        "features": [
          { "label": "Eye line", "value": "Even" },
          { "label": "Nose axis", "value": "Centered" }
        ],
        "explanation": "Specific assessment of this person's central axis, paired feature alignment, and visible left-right drift."
      },
      {
        "id": "sun-damage",
        "title": "Sun damage",
        "subtitle": "personalized short cosmetic UV signal",
        "scoreLabel": "Damage risk",
        "score": 5.0,
        "features": [
          { "label": "Pigmentation", "value": "Low" },
          { "label": "Texture", "value": "Stable" }
        ],
        "explanation": "Specific cosmetic assessment of this person's visible uneven tone, redness, pigmentation, and texture. Do not frame it as a medical diagnosis."
      },
      {
        "id": "overall",
        "title": "Overall score",
        "subtitle": "personalized final facial assessment",
        "scoreLabel": "PSL score",
        "score": 5.0,
        "features": [
          { "label": "Harmony", "value": "5.0" },
          { "label": "Percentile", "value": "70%" }
        ],
        "explanation": "Specific overall assessment tying this person's strongest visible features, limiting factors, and PSL calibration together."
      }
    ]
  },
  "landmarks": {
    "version": 1,
    "source": "kimi-vision-estimate",
    "confidence": 0.75,
    "image": { "width": 720, "height": 1280 },
    "anchors": {
      "leftEyeOuter": { "x": 0.34, "y": 0.39 },
      "leftEyeInner": { "x": 0.46, "y": 0.39 },
      "rightEyeInner": { "x": 0.54, "y": 0.39 },
      "rightEyeOuter": { "x": 0.66, "y": 0.39 },
      "leftPupil": { "x": 0.40, "y": 0.39 },
      "rightPupil": { "x": 0.60, "y": 0.39 },
      "leftBrow": { "x": 0.40, "y": 0.34 },
      "rightBrow": { "x": 0.60, "y": 0.34 },
      "noseBridge": { "x": 0.50, "y": 0.44 },
      "noseTip": { "x": 0.50, "y": 0.51 },
      "mouthLeft": { "x": 0.43, "y": 0.61 },
      "mouthRight": { "x": 0.57, "y": 0.61 },
      "mouthCenter": { "x": 0.50, "y": 0.61 },
      "upperLip": { "x": 0.50, "y": 0.59 },
      "lowerLip": { "x": 0.50, "y": 0.64 },
      "leftCheek": { "x": 0.34, "y": 0.52 },
      "rightCheek": { "x": 0.66, "y": 0.52 },
      "chin": { "x": 0.50, "y": 0.77 },
      "jawLeft": { "x": 0.36, "y": 0.70 },
      "jawRight": { "x": 0.64, "y": 0.70 },
      "forehead": { "x": 0.50, "y": 0.25 }
    }
  }
}

Rules:
- Include a report object with exactly the 11 listed category ids: eyes, nose, mouth, jaw, dimorphism, face-shape, facial-fat, biological-age, symmetry, sun-damage, overall.
- Report explanations must be personalized to the visible face in this exact image. Do not use generic rubric explanations.
- Report features must be concrete observed signals or concise score values, not placeholders.
- Do not claim objective health, fertility, morality, competence, intelligence, or real-world social worth.
- Do not use the golden ratio or claim mathematical perfection.
- Facial-fat percentage must be framed as an apparent visual estimate only.
- Never classify or imply an apparent age below 18.
- Landmark coordinates must be normalized 0-1 within the visible source image.
- Landmark image dimensions should match the visible source image proportions.
- If a face is detected but landmarks are uncertain, return best estimates with confidence 0.5-0.8.`
}
