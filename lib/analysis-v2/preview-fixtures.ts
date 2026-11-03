import registry from './rubric-registry.json'

// Complete design inventory only. These values are not observations of the sample photo.
export const designValues: Record<string, string | number | number[]> = {
  "eyes.spacing": 0.42,
  "eyes.inner-gap": 0.85,
  "eyes.aspect": [
    1.6,
    1.6
  ],
  "eyes.canthal-tilt": [
    5,
    5
  ],
  "eyes.opening": [
    0.55,
    0.55
  ],
  "eyes.shape": "almond",
  "eyes.upper-lid": [
    0.15,
    0.15
  ],
  "eyes.lower-sclera": [
    0.05,
    0.05
  ],
  "eyes.crease": "partly visible",
  "eyes.orbital-contour": "flatter",
  "eyes.under-eye-fullness": "slight",
  "eyes.lashes": "moderate",
  "brows.tilt": [
    8,
    8
  ],
  "brows.eye-distance": [
    0.6,
    0.6
  ],
  "brows.length": [
    0.9,
    0.9
  ],
  "brows.density": "moderate",
  "brows.arch": [
    154,
    152
  ],
  "brows.tail": [
    -5,
    -5
  ],
  "brows.position": "aligned",
  "nose.width": 0.22,
  "nose.eye-gap-ratio": 1.1,
  "nose.length": 0.45,
  "nose.bridge-width": 0.6,
  "mouth.lip-ratio": 1.1,
  "mouth.corner-position": -2,
  "mouth.pupil-ratio": 1.35,
  "mouth.fullness": "moderate",
  "mouth.cupid-bow": "defined",
  "mouth.bow-depth": 0.08,
  "mouth.contour": "even",
  "jaw.height": 0.55,
  "jaw.chin-width": 0.75,
  "jaw.chin-shape": "tapered",
  "jaw.jaw-shape": "tapered",
  "cheeks.width": 1.15,
  "cheeks.contour": "fuller-looking",
  "cheeks.malar-transition": "smooth",
  "cheeks.nasolabial-fold": "slight",
  "face.shape": "oval",
  "proportions.lower-partition": 0.45,
  "proportions.vertical-alignment": [
    0.02,
    -0.01,
    0.01
  ],
  "proportions.width-hierarchy": "temple > cheek > jaw",
  "proportions.eye-mouth-height": 0.85,
  "proportions.nose-lower-third": 0.75,
  "proportions.summary": "5 proportion relationships available; approximate, without a combined grade.",
  "symmetry.eyes-height": 1.5,
  "symmetry.eyes-opening": 2,
  "symmetry.brows-height": 1,
  "symmetry.nose-wings": 2,
  "symmetry.nose-axis": 1,
  "symmetry.mouth-height": 1.5,
  "symmetry.chin-axis": 0.5,
  "skin.texture": 1,
  "skin.tone": 1,
  "skin.under-eye-contrast": 1,
  "skin.blemishes": 0,
  "skin.pores": "fine",
  "skin.shine": "localized",
  "skin.fine-lines": "not apparent",
  "skin.marks": "localized",
  "skin.under-eye-color": "slight warm tone",
  "skin.surface-pattern": "nose cheeks forehead chin",
  "skin.capture-effects": "makeup possible smoothing",
  "skin.priorities": "Review capture effects: makeup possible smoothing. Compare observations under consistent lighting.",
  "hair.hairline-visibility": "partial",
  "hair.coverage": "dense lateral coverage with central part",
  "hair.frame": "forehead partially exposed lateral volume softens jaw",
  "hair.volume": 1.4,
  "hair.beard-style": "clean-shaven",
  "brows.thickness": 0.12,
  "nose.bridge": "Straight",
  "nose.tip-shape": "Rounded",
  "nose.rotation": 101,
  "nose.projection": 0.56,
  "nose.nostril-visibility": [
    0.12,
    0.14
  ],
  "nose.alar-angle": [
    92,
    94
  ],
  "mouth.width": 0.38,
  "mouth.philtrum": 0.23,
  "mouth.projection": [
    0.08,
    0.12
  ],
  "jaw.width": 0.79,
  "jaw.angle": 126,
  "jaw.projection": 0.91,
  "jaw.definition": "Defined",
  "jaw.under-chin": "Smooth transition",
  "jaw.chin-philtrum": 2.4,
  "cheeks.height": 0.76,
  "cheeks.midface": 1.04,
  "cheeks.prominence": "Moderate prominence",
  "cheeks.paranasal": "Soft contour",
  "face.frame": 1.36,
  "face.forehead-height": 0.32,
  "face.forehead-slope": 12,
  "face.temple-width": 0.84,
  "face.forehead-width": 0.81,
  "face.taper": 0.82,
  "face.forehead-contour": "Softly curved",
  "proportions.upper-third": 0.32,
  "proportions.middle-third": 0.34,
  "proportions.lower-third": 0.34,
  "proportions.fifths": [
    0.19,
    0.2,
    0.21,
    0.2,
    0.2
  ],
  "proportions.convexity": 168,
  "proportions.angle-coordination": 2.5,
  "symmetry.brows-shape": 3.4,
  "symmetry.lip-contour": 2.1,
  "symmetry.jaw-outline": 3.8,
  "symmetry.cheek-outline": 2.5,
  "symmetry.ears-position": 2.2,
  "hair.hairline-shape": "Rounded",
  "hair.grooming": 3,
  "hair.beard-grooming": 3,
  "ears.height": [
    0.28,
    0.29
  ],
  "ears.width": [
    0.12,
    0.12
  ],
  "ears.protrusion": 1,
  "ears.vertical-position": [
    0.18,
    0.19,
    0.42,
    0.43
  ],
  "ears.shape": "Rounded",
  "ears.attachment": "Attached"
}

// These markers/scores are deliberately illustrative, not calibrated measurements or model grades.
const illustrations: Record<string, { positions: number[]; grade?: number }> = {
  'eyes.spacing': { positions: [.46] }, 'eyes.aspect': { positions: [.45, .53] },
  'eyes.canthal-tilt': { positions: [.57, .61] }, 'eyes.opening': { positions: [.42, .48] },
  'brows.tilt': { positions: [.61, .64] }, 'brows.eye-distance': { positions: [.44] }, 'brows.length': { positions: [.56] },
  'nose.width': { positions: [.58] }, 'mouth.width': { positions: [.53] }, 'mouth.lip-ratio': { positions: [.63] }, 'mouth.corner-position': { positions: [.48] },
  'jaw.width': { positions: [.51] }, 'jaw.height': { positions: [.65] },
  'cheeks.height': { positions: [.61] }, 'cheeks.width': { positions: [.43] }, 'cheeks.midface': { positions: [.56] },
  'face.frame': { positions: [.58] }, 'proportions.lower-partition': { positions: [], grade: 8.2 },
  'symmetry.eyes-height': { positions: [], grade: 8.5 }, 'symmetry.brows-height': { positions: [], grade: 7.3 },
  'symmetry.mouth-height': { positions: [], grade: 8.1 }, 'symmetry.chin-axis': { positions: [], grade: 8.9 },
  'skin.texture': { positions: [], grade: 7.5 }, 'skin.tone': { positions: [], grade: 8 },
  'skin.under-eye-contrast': { positions: [], grade: 6.5 }, 'skin.blemishes': { positions: [], grade: 7.5 },
}
export const designIllustrations = Object.fromEntries(registry.categories.flatMap(category => category.rubrics.filter(rubric => rubric.visual !== 'Text').map(rubric => [rubric.id, illustrations[rubric.id] ?? (rubric.visual === 'Rail' ? { positions: [], grade: 7.4 } : { positions: [.5] })])))
