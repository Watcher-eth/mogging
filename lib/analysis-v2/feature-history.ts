export const featureMeasurements = {
  skin: { id: 'skin.texture', label: 'Texture level', unit: ' / 4', decimals: 0 },
  jaw: { id: 'jaw.height', label: 'Chin / lower-face height', unit: '×', decimals: 2 },
  eyes: { id: 'eyes.spacing', label: 'Pupil span / cheek width', unit: '×', decimals: 2 },
  cheeks: { id: 'cheeks.width', label: 'Cheek width / outer-eye span', unit: '×', decimals: 2 },
  face: { id: 'face.frame', label: 'Face width / height', unit: '×', decimals: 2 },
  symmetry: { id: 'symmetry.eyes-height', label: 'Eye height difference', unit: '%', decimals: 1 },
  proportions: { id: 'proportions.lower-partition', label: 'Lower-face partition', unit: '×', decimals: 2 },
  brows: { id: 'brows.tilt', label: 'Left brow tilt', unit: '°', decimals: 1 },
  nose: { id: 'nose.width', label: 'Nose width ratio', unit: '×', decimals: 2 },
  mouth: { id: 'mouth.lip-ratio', label: 'Lip ratio', unit: '×', decimals: 2 },
  hair: { id: 'hair.volume', label: 'Hair volume ratio', unit: '×', decimals: 2 },
  ears: { id: 'ears.height', label: 'Ear height ratio', unit: '×', decimals: 2 },
} as const

const trackedIds = new Set<string>(Object.values(featureMeasurements).map(metric => metric.id))

export function readFeatureMeasurements(entries: unknown) {
  if (!Array.isArray(entries)) return undefined
  const values: Record<string, number> = {}
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !trackedIds.has(entry.id)) continue
    // Paired measurements retain the same side across scans.
    const value: unknown = Array.isArray(entry.value) && entry.value.length === 2 ? entry.value[0] : entry.value
    if (typeof value === 'number' && Number.isFinite(value)) values[entry.id] = value
  }
  return Object.keys(values).length ? values : undefined
}

export type FeatureArea = keyof typeof featureMeasurements

export function formatFeatureMeasurement(area: FeatureArea, value: number) {
  const { decimals, unit } = featureMeasurements[area]
  return `${value.toFixed(decimals)}${unit}`
}
