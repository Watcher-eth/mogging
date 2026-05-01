import type { AnalyzeFaceInput } from './schema'

export const ANALYSIS_SYSTEM_PROMPT = `You analyze face photos for an entertainment app using an evidence-based facial aesthetics rubric.
Return only a valid JSON object matching the requested schema.
Be calibrated and realistic. Do not flatter, but do not compress attractive faces into the middle of the scale. If the image does not contain a real human face, set faceDetected to false.
PSL score is on a 0-8 scale: non-attractive faces are usually 2.0-3.5, ordinary/average faces are usually 3.5-5.2, attractive faces are usually 5.5-6.8, clear professional model-tier faces are commonly 7.0-7.9, and 8.0 is reserved only for the top 0.0001% of the most attractive near-ideal faces. Never rate below 2.0 unless there are extreme disfiguring abnormalities such as severe facial disfigurement, missing teeth, or similarly major visible abnormalities. Category and metric scores are on a separate 0-10 display scale.
Assess only visible facial aesthetics. Do not infer identity, morality, intelligence, health diagnosis, ethnicity, fertility, or real-world social worth.`

export function buildAnalysisPrompt(gender: AnalyzeFaceInput['gender']) {
  return `Analyze this image. Gender scoring mode: ${gender}.

Use this research-weighted rubric:
- Facial proportionality and averageness are the strongest structural predictors. Reward balanced facial thirds, lower-third subdivision, horizontal feature spacing, nose-mouth-chin relations, and population-typical ranges. Penalize extreme deviations. Do not use the golden ratio or fixed neoclassical canons as universal ideals.
- Sexual dimorphism is gender-aware. In female mode, feminine traits generally improve attractiveness when they remain natural and harmonious. In male mode, masculinity is context-dependent: it can signal dominance and structure, but do not over-reward extreme masculinity if it reduces harmony, approachability, or overall aesthetic balance. In other mode, score dimorphism neutrally.
- Symmetry matters, but its effect is modest unless asymmetry is salient. Penalize fluctuating asymmetry most when it disrupts reference lines: eye line, nasal midline, mouth line, or chin centerline. Mild ordinary asymmetry should not dominate the score.
- Angularity should reward useful definition in jaw, chin, cheekbones, orbital/brow structure, and facial contour. Do not reward harshness that breaks proportionality or averageness.
- Skin and presentation should affect confidence in the analysis and the final score, but treat lighting, angle, expression, makeup, hair, blur, and occlusion as image limitations rather than fixed traits.
- Do not under-score clear professional model-tier faces. If the visible structure is highly harmonious with strong eye area, balanced thirds/fifths, clear skin/presentation, and no major asymmetry, the overall PSL should normally be 7.0-7.9 even if one feature such as nose or dimorphism is less ideal.
- Use the full category range. Strong or near-ideal categories can score 8.5-9.8. A model-tier face should often have several category scores above 8 while weaker categories remain lower.

Return this JSON object exactly:
{
  "faceDetected": true,
  "pslScore": 4.0,
  "harmonyScore": 5.0,
  "symmetryScore": 5.0,
  "proportionalityScore": 5.0,
  "averagenessScore": 5.0,
  "dimorphismScore": 5.0,
  "angularityScore": 5.0,
  "metricScores": [
    { "name": "Eye-line and mouth-line symmetry", "score": 5.0, "category": "symmetry", "description": "short reason" },
    { "name": "Nasal and chin midline alignment", "score": 5.0, "category": "symmetry", "description": "short reason" },
    { "name": "Vertical thirds and lower-third balance", "score": 5.0, "category": "proportionality", "description": "short reason" },
    { "name": "Horizontal fifths and feature spacing", "score": 5.0, "category": "proportionality", "description": "short reason" },
    { "name": "Population-typical facial harmony", "score": 5.0, "category": "averageness", "description": "short reason" },
    { "name": "Sex-typical feature configuration", "score": 5.0, "category": "dimorphism", "description": "short reason" },
    { "name": "Jaw, chin, and cheekbone definition", "score": 5.0, "category": "angularity", "description": "short reason" },
    { "name": "Skin clarity and texture", "score": 5.0, "category": "skin", "description": "short reason" },
    { "name": "Photo quality and expression neutrality", "score": 5.0, "category": "presentation", "description": "short reason" }
  ],
  "percentile": 70,
  "tier": "High-tier Normie",
  "tierDescription": "brief calibrated description",
  "report": {
    "summary": "brief overall summary grounded in visible facial structure and image limitations",
    "categories": [
      {
        "id": "eyes",
        "title": "Eyes",
        "subtitle": "Periocular balance and eye-line structure",
        "scoreLabel": "Eye area",
        "score": 5.0,
        "features": [
          { "label": "Canthal tilt", "value": "short finding" },
          { "label": "Spacing", "value": "short finding" },
          { "label": "Upper lid", "value": "short finding" },
          { "label": "Symmetry", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "nose",
        "title": "Nose",
        "subtitle": "Bridge alignment and central facial axis",
        "scoreLabel": "Nasal balance",
        "score": 5.0,
        "features": [
          { "label": "Bridge", "value": "short finding" },
          { "label": "Tip position", "value": "short finding" },
          { "label": "Width", "value": "short finding" },
          { "label": "Projection", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "mouth",
        "title": "Mouth",
        "subtitle": "Lip shape, width, and lower-third fit",
        "scoreLabel": "Mouth harmony",
        "score": 5.0,
        "features": [
          { "label": "Width", "value": "short finding" },
          { "label": "Cupid bow", "value": "short finding" },
          { "label": "Lower lip", "value": "short finding" },
          { "label": "Resting line", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "jaw",
        "title": "Jaw",
        "subtitle": "Mandible definition and chin support",
        "scoreLabel": "Jawline",
        "score": 5.0,
        "features": [
          { "label": "Gonial angle", "value": "short finding" },
          { "label": "Chin height", "value": "short finding" },
          { "label": "Mandible", "value": "short finding" },
          { "label": "Neck transition", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "dimorphism",
        "title": "Dimorphism",
        "subtitle": "Sex-typical cues weighted against harmony",
        "scoreLabel": "Dimorphism",
        "score": 5.0,
        "features": [
          { "label": "Brow frame", "value": "short finding" },
          { "label": "Midface", "value": "short finding" },
          { "label": "Lower third", "value": "short finding" },
          { "label": "Soft tissue", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "face-shape",
        "title": "Face shape",
        "subtitle": "Frame, thirds, and silhouette continuity",
        "scoreLabel": "Face shape",
        "score": 5.0,
        "features": [
          { "label": "Outline", "value": "short finding" },
          { "label": "Upper third", "value": "short finding" },
          { "label": "Midface", "value": "short finding" },
          { "label": "Lower third", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "biological-age",
        "title": "Biological age",
        "subtitle": "Visible youthfulness and skin presentation cues",
        "scoreLabel": "Age signal",
        "score": 5.0,
        "features": [
          { "label": "Skin texture", "value": "short finding" },
          { "label": "Under-eye", "value": "short finding" },
          { "label": "Facial fullness", "value": "short finding" },
          { "label": "Presentation", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "symmetry",
        "title": "Symmetry",
        "subtitle": "Left-right balance across visible landmarks",
        "scoreLabel": "Symmetry",
        "score": 5.0,
        "features": [
          { "label": "Eye level", "value": "short finding" },
          { "label": "Nose axis", "value": "short finding" },
          { "label": "Mouth axis", "value": "short finding" },
          { "label": "Chin point", "value": "short finding" }
        ],
        "explanation": "specific explanation for this category"
      },
      {
        "id": "overall",
        "title": "Overall PSL score",
        "subtitle": "Final calibrated PSL assessment",
        "scoreLabel": "PSL score",
        "score": 5.0,
        "features": [
          { "label": "Harmony", "value": "short finding" },
          { "label": "Structure", "value": "short finding" },
          { "label": "Balance", "value": "short finding" },
          { "label": "Percentile", "value": "short finding" }
        ],
        "explanation": "specific explanation for the final PSL score"
      }
    ]
  },
  "landmarks": {}
}

Rules:
- pslScore must be between 0 and 8.
- Every non-PSL metric and report category score must be between 0 and 10.
- pslScore is the final app-wide overall score. It must be a calibrated PSL score on the 0-8 PSL scale, not a generic attractiveness score.
- The report.categories array must contain exactly one object for each id shown above, in the same order.
- Each feature category score must be a calibrated 0-10 category score. The overall category score must equal pslScore and is the only report category that uses the 0-8 PSL scale.
- Feature values must be short, concrete findings, not generic praise.
- harmonyScore should summarize proportionality, averageness, symmetry, feature cohesion, and absence of distracting imbalance.
- If the image is not frontal enough to judge a metric, give a conservative score and mention the limitation in the metric description.
- Do not identify the person.
- Do not claim objective health, fertility, morality, competence, or intelligence.
- Do not include markdown or extra text.`
}
