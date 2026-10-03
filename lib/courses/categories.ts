export const courseCategoryIds = ['looksmaxxing', 'face-improvements', 'dating', 'fitness'] as const

const labels: Record<string, string> = {
  looksmaxxing: 'Looksmaxxing',
  'face-improvements': 'Face Improvements',
  dating: 'Dating',
  fitness: 'Fitness',
  grooming: 'Grooming',
  style: 'Style',
  skincare: 'Skincare',
  general: 'General',
}

export const courseCategoryLabel = (category: string) => labels[category] ?? category
