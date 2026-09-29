export type ReportCategory = {
  id: string;
  title: string;
  subtitle: string;
  scoreLabel: string;
  score: number;
  features: Array<{ label: string; value: string; measurement?: string }>;
  eyeColor?: string;
  explanation: string;
  recommendation: string;
};

export const reportCategories: ReportCategory[] = [
  {
    id: "eyes",
    title: "Eyes",
    subtitle: "Periocular balance and eye-line structure",
    scoreLabel: "Eye area",
    score: 7.4,
    features: [
      { label: "Canthal tilt", value: "Positive" },
      { label: "Eye spacing", value: "balanced width" },
      { label: "Lid support", value: "strong contour" },
      { label: "Eye line tilt", value: "near level" },
    ],
    explanation: "Eye area is estimated from local symmetry, spacing, lid support, and fit inside the full facial frame.",
    recommendation: "Use consistent lighting and a neutral expression before judging the eye area across reports.",
  },
  {
    id: "nose",
    title: "Nose",
    subtitle: "Bridge alignment and central facial axis",
    scoreLabel: "Nasal balance",
    score: 6.9,
    features: [
      { label: "Bridge line", value: "straight contour" },
      { label: "Midline drift", value: "minimal drift" },
      { label: "Nose width", value: "balanced to midface" },
      { label: "Bridge projection", value: "clear contour" },
    ],
    explanation: "Nasal balance weighs central alignment, midface width, bridge continuity, and how much the feature supports harmony.",
    recommendation: "Compare several neutral front images before deciding whether nose balance is the main limiter.",
  },
  {
    id: "mouth",
    title: "Mouth",
    subtitle: "Lip proportion and lower-midface support",
    scoreLabel: "Mouth line",
    score: 7.1,
    features: [
      { label: "Mouth width", value: "balanced to jaw" },
      { label: "Lip volume", value: "moderate fullness" },
      { label: "Cupid bow", value: "clear contour" },
      { label: "Mouth line tilt", value: "near level" },
    ],
    explanation: "Mouth scoring weighs lip proportion, horizontal balance, fullness, and how the mouth sits inside the lower facial frame.",
    recommendation: "Use neutral expression consistency and simple grooming before judging mouth balance.",
  },
  {
    id: "jaw",
    title: "Jaw",
    subtitle: "Mandible definition and chin support",
    scoreLabel: "Jawline",
    score: 7.2,
    features: [
      { label: "Gonial angle", value: "defined angle" },
      { label: "Chin height", value: "strong support" },
      { label: "Mandible", value: "clear edge definition" },
      { label: "Neck transition", value: "clear contour" },
    ],
    explanation: "Jaw scoring weighs mandibular definition, chin support, angularity, and lower-third strength.",
    recommendation: "Track straight-on posture and repeat scans before judging lower-third structure.",
  },
  {
    id: "dimorphism",
    title: "Dimorphism",
    subtitle: "Sex-typical structure and mature feature contrast",
    scoreLabel: "Dimorphism",
    score: 6.7,
    features: [
      { label: "Brow", value: "moderate structure" },
      { label: "Lower third", value: "structured contour" },
      { label: "Angularity", value: "clear contour" },
      { label: "Softness", value: "balanced fullness" },
    ],
    explanation: "Dimorphism is estimated from feature contrast, brow and jaw structure, soft-tissue distribution, and total facial maturity.",
    recommendation: "Use grooming and styling first; align brows, hair, and lower-third presentation before judging contrast.",
  },
  {
    id: "face-shape",
    title: "Face shape",
    subtitle: "Frame, thirds, and silhouette continuity",
    scoreLabel: "Face shape",
    score: 7.5,
    features: [
      { label: "Outline", value: "oval tendency" },
      { label: "Upper third", value: "balanced thirds" },
      { label: "Midface", value: "compact proportion" },
      { label: "Lower third", value: "defined frame" },
    ],
    explanation: "Face shape is scored from visible proportions, local symmetry, and how the feature fits the full facial frame.",
    recommendation: "Improve haircut, framing, and camera posture first because those change the visible outline fastest.",
  },
  {
    id: "skin-age",
    title: "Skin Age",
    subtitle: "Visible age cues",
    scoreLabel: "Age signal",
    score: 7.6,
    features: [
      { label: "Apparent age", value: "24 years" },
      { label: "Texture age cue", value: "on-pace texture" },
      { label: "Under-eye cue", value: "low shadowing" },
      { label: "Skin damage", value: "low visible signal" },
    ],
    explanation: "Skin age is a cosmetic signal derived from visible texture, under-eye presentation, facial fullness, and image clarity.",
    recommendation: "Keep capture conditions consistent so future reports compare visible age cues fairly.",
  },
  {
    id: "symmetry",
    title: "Symmetry",
    subtitle: "Central axis and paired feature alignment",
    scoreLabel: "Symmetry",
    score: 7.6,
    features: [
      { label: "Eye line tilt", value: "near level" },
      { label: "Nose midline", value: "minimal drift" },
      { label: "Mouth line tilt", value: "near level" },
      { label: "Jaw points", value: "minor drift" },
    ],
    explanation: "Symmetry combines central axis consistency, paired landmark alignment, and visible proportional drift across the face.",
    recommendation: "Use straight-on, level framing before judging whether the asymmetry is persistent.",
  },
  {
    id: "sun-damage",
    title: "UV context",
    subtitle: "UV context and visible tone",
    scoreLabel: "UV context",
    score: 3.2,
    features: [
      { label: "Location UV", value: "moderate context" },
      { label: "Pigmentation", value: "low visible pigment" },
      { label: "Redness", value: "mild redness" },
      { label: "Priority", value: "Consistent context" },
    ],
    explanation: "UV context combines rough location context with visible uneven tone, redness, and texture cues for cosmetic reporting only.",
    recommendation: "Use consistent outdoor context and neutral lighting so visible tone and texture comparisons stay fair.",
  },
  {
    id: "facial-fat",
    title: "Facial definition",
    subtitle: "Cheek and lower-face clarity",
    scoreLabel: "Definition score",
    score: 7.0,
    features: [
      { label: "Cheeks", value: "balanced fullness" },
      { label: "Jaw blur", value: "low blur" },
      { label: "Under-chin", value: "lean contour" },
      { label: "Fullness cue", value: "low visible fullness" },
    ],
    explanation: "Soft-tissue signal is an apparent visual estimate from cheek fullness, jaw clarity, and under-chin softness.",
    recommendation: "Use the same lighting, posture, and distance before judging soft-tissue fullness.",
  },
  {
    id: "overall",
    title: "Overall",
    subtitle: "Final calibrated facial assessment",
    scoreLabel: "Overall score",
    score: 8.5,
    features: [
      { label: "Eye area", value: "7.4/10" },
      { label: "Jaw & chin", value: "7.2/10" },
      { label: "Cheekbone structure", value: "7.1/10" },
      { label: "PSL score", value: "6.8/8" },
      { label: "Symmetry", value: "7.6/10" },
      { label: "Skin quality", value: "7.4/10" },
    ],
    explanation: "The overall score is shown on a 0 to 10 scale and balances harmony, proportion, dimorphism, and presentation. PSL calibration remains a secondary comparison signal.",
    recommendation: "Improve the lowest-scoring category first; one focused change beats scattered glow-up advice.",
  },
];
