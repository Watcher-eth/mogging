import type { SemanticBeat } from './video-semantics'

export const documentaryEditions = [
  {
    name: 'Survey',
    layouts: ['survey-plane', 'survey-plot', 'relief-map', 'route-atlas'],
    motion: 'crane',
    cut: 'contour',
    splitAfter: 1900,
    light: ['#d1e7dd', '#e9e8d8', '#5b695e', '#9a6134'],
    dark: ['#34463d', '#2f3427', '#9cb2a6', '#edbc81'],
  },
  {
    name: 'Reconstruction',
    layouts: ['rim-stage', 'interview', 'optical-bench', 'light-vault'],
    motion: 'dolly',
    cut: 'foreground',
    splitAfter: 2500,
    light: ['#dde8e6', '#f1ddc8', '#756353', '#855132'],
    dark: ['#3d2d24', '#322820', '#c5ada0', '#f1b885'],
  },
  {
    name: 'Archive',
    layouts: ['graphite', 'archive-desk', 'contact-print', 'survey-markers'],
    motion: 'rostrum',
    cut: 'paper',
    splitAfter: 2000,
    light: ['#e1eae3', '#f0dfce', '#716652', '#795230'],
    dark: ['#403930', '#353026', '#c6bba5', '#ebbe85'],
  },
  {
    name: 'Screen investigation',
    layouts: ['signal-profile', 'signal-mosaic', 'routing-board', 'control-room'],
    motion: 'snap-pan',
    cut: 'panel',
    splitAfter: 1550,
    light: ['#d7e6ed', '#dcebe3', '#535e61', '#365b58'],
    dark: ['#354148', '#28383b', '#b1c1c6', '#a0d4c7'],
  },
] as const

export const documentaryLayouts = {
  'survey-plane': 'Survey projection',
  'survey-plot': 'Landmark plot',
  'relief-map': 'Contour relief',
  'route-atlas': 'Route atlas',
  'rim-stage': 'Rim-lit reconstruction',
  interview: 'Interview framing',
  'optical-bench': 'Optical bench',
  'light-vault': 'Practical light vault',
  graphite: 'Graphite plate',
  'archive-desk': 'Archive desk',
  'contact-print': 'Contact print',
  'survey-markers': 'Numbered survey',
  'signal-profile': 'Digital evidence profile',
  'signal-mosaic': 'Evidence mosaic',
  'routing-board': 'Evidence routing',
  'control-room': 'Control room display',
} as const
export type DocumentaryLayout = keyof typeof documentaryLayouts
export const documentaryLayoutIds = Object.keys(documentaryLayouts) as [DocumentaryLayout, ...DocumentaryLayout[]]
export type DocumentaryEdition = typeof documentaryEditions[number]

export function supportsDocumentaryLayout(kind: string) {
  return !['anatomy', 'specimen', 'comparison', 'conclusion', 'media'].includes(kind)
}

export function editionForLayout(layout: DocumentaryLayout) {
  return documentaryEditions.find(edition => edition.layouts.some(candidate => candidate === layout))!
}

const analysisCoverage = ['relief-map', 'route-atlas', 'survey-plot', 'routing-board', 'control-room', 'survey-markers', 'signal-mosaic', 'optical-bench', 'contact-print'] as const
const portraitCoverage = ['optical-bench', 'light-vault', 'contact-print', 'interview', 'routing-board', 'archive-desk', 'survey-markers', 'relief-map'] as const

export function documentaryLayout(beat: SemanticBeat, variation: number, index: number): DocumentaryLayout {
  const edition = documentaryEditions[variation % documentaryEditions.length]
  const phase = Math.floor(variation / documentaryEditions.length)
  if (index === 0) return edition.layouts[phase % edition.layouts.length]
  if (beat.intent === 'views') return (['contact-print', 'survey-plane', 'rim-stage', 'signal-mosaic', 'light-vault', 'survey-markers'] as const)[(variation + index + phase) % 6]
  if (beat.intent === 'lighting') return (['light-vault', 'rim-stage', 'optical-bench', 'control-room'] as const)[(variation + index + phase) % 4]
  if (beat.intent === 'context' || beat.feature === 'whole') return edition.layouts[(index + phase) % 2]
  const analytical = beat.intent === 'measure' || beat.intent === 'report'
  const coverage = analytical ? analysisCoverage : portraitCoverage
  return coverage[(variation + index * 2 + phase) % coverage.length]
}
