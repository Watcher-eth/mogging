export const processingOverlaySteps = [
  { categoryId: 'eyes', label: 'Tracing eye contours' },
  { categoryId: 'symmetry', label: 'Mapping bilateral alignment' },
  { categoryId: 'jaw', label: 'Tracing the lower frame' },
  { categoryId: 'nose', label: 'Mapping nasal contours' },
  { categoryId: 'proportions', label: 'Comparing reference planes' },
  { categoryId: 'overall', label: 'Mapping the complete face' },
] as const
