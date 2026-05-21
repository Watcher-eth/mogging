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
- Do not include a report object.
- Landmark coordinates must be normalized 0-1 within the visible source image.
- Landmark image dimensions should match the visible source image proportions.
- If a face is detected but landmarks are uncertain, return best estimates with confidence 0.5-0.8.`
}
