import registry from './rubric-registry.json'

// One deliberately narrow observation per category, shared by the server and preview layout.
const previewIds = new Set([
  'eyes.inner-gap', 'brows.eye-distance', 'nose.width', 'mouth.lip-ratio', 'jaw.height', 'cheeks.width',
  'face.shape', 'proportions.lower-partition', 'symmetry.brows-height', 'skin.pores',
  'hair.volume', 'ears.width',
])

export const basicCategories = registry.categories.map(category => ({
  id: category.id,
  title: category.title,
  metric: category.rubrics.find(rubric => previewIds.has(rubric.id))!,
  locked: category.rubrics.filter(rubric => !previewIds.has(rubric.id) && rubric.output !== 'D').slice(0, 3).map(rubric => rubric.name),
}))

export const basicPreviewRubrics: ReadonlySet<string> = previewIds
export type BasicReport = { values: Record<string, string> }

const relatedCategories: Record<string, string[]> = {
  brows: ['eyes', 'symmetry'],
  cheeks: ['face', 'jaw'],
  face: ['proportions', 'jaw'],
  hair: ['face', 'proportions'],
  ears: ['face', 'symmetry'],
}

export function lockedReportMetrics(categoryId: string) {
  if (categoryId === 'overall') {
    return ['Mogging score', 'Facial harmony', 'Profile analysis', ...registry.categories.map(category => `${category.title} overview`)].slice(0, 9)
  }
  const category = registry.categories.find(item => item.id === categoryId)
  const labels = (category?.rubrics ?? []).filter(rubric => rubric.output !== 'D' && !previewIds.has(rubric.id)).map(rubric => rubric.name)
  for (const relatedId of relatedCategories[categoryId] ?? []) {
    const related = registry.categories.find(item => item.id === relatedId)
    for (const rubric of related?.rubrics ?? []) {
      if (labels.length >= 9) break
      if (rubric.output !== 'D' && !labels.includes(rubric.name)) labels.push(rubric.name)
    }
  }
  return labels.slice(0, 9)
}
