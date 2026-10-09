import Head from 'next/head'
import { createOverallFeatureGrid } from '@/lib/analysis/report'
import { previewHairOverlay, previewEarOverlay } from '@/lib/analysis-v2/preview-overlays'
import type { WebRubricGroup } from '@/lib/analysis-v2/web-report'
import { useState } from 'react'
import { AnalysisReport, type DesktopReportCategory } from '@/components/analysis/analysis-report'
import registry from '@/lib/analysis-v2/rubric-registry.json'
import styles from '@/components/analysis/v2/rubrics.module.css'
import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import { buildWebRubricGroups } from '@/lib/analysis-v2/web-report'
import sampleEntries from '@/lib/analysis-v2/sample-entries.json'
import { designValues } from '@/lib/analysis-v2/preview-fixtures'
import type { RubricEstimate } from '@/lib/analysis-v2/evaluator'

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
const designIllustrations = Object.fromEntries(registry.categories.flatMap(category => category.rubrics.filter(rubric => rubric.visual !== 'Text').map(rubric => [rubric.id, illustrations[rubric.id] ?? (rubric.visual === 'Rail' ? { positions: [], grade: 7.4 } : { positions: [.5] })])))
const entries = (sampleEntries as RubricEstimate[]).map(entry => entry.id === 'brows.arch' && typeof entry.value === 'string' ? { ...entry, value: null } : entry)
const descriptions: Record<string, string> = {
  eyes: 'Almond-shaped contours and a visible lid crease define the eye area. The outer corners rise above the inner corners, with similar opening and tilt on both sides.',
  brows: 'The brows have a soft arch and an upward baseline. Their starts and tails align with the eye frame, with similar length and spacing on both sides.',
  nose: 'The visible nasal width and bridge sit within the central facial frame. Nose-wing spacing is considered alongside the inner-eye gap and cheek width.',
  mouth: 'The lower lip is slightly fuller than the upper lip. Mouth width, lip contour and the Cupid’s bow shape the balance of the lower midface.',
  jaw: 'Chin height and the visible jaw outline shape the lower face. The chin contour and its relationship to the mouth are considered together.',
  cheeks: 'Cheek width, midface proportions and the transition into the lower face define the cheek area. Visible fullness contributes to the contour of the face.',
  face: 'The facial outline is read through its cheek width, temple width and taper toward the jaw. These relationships describe the overall silhouette.',
  proportions: 'Facial proportions compare the spacing and width of features within the whole face. The lower-face partition and eye-to-mouth relationship describe how the features fit together.',
  symmetry: 'Eye openings are closely matched. Small differences in eye-corner, brow and mouth height are considered alongside the nose and chin midlines.',
  skin: 'Visible surface detail is assessed across the forehead, nose, cheeks and chin. Texture, local tone variation and under-eye contrast describe the presentation of the skin.',
  hair: 'Hair volume frames the upper face and controls forehead exposure. The visible silhouette and facial-hair style are considered as part of the overall presentation.',
  ears: 'Ear placement is considered in relation to the brow, nose and facial width. The visible contour describes ear shape and how it sits beside the face.',
}
const labels: Record<string, string> = { eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', jaw: 'Jaw', cheeks: 'Cheeks', face: 'Face shape', proportions: 'Proportions', symmetry: 'Symmetry', skin: 'Skin', hair: 'Hair', ears: 'Ears' }
const categories: DesktopReportCategory[] = registry.categories.map(category => ({ id: category.id === 'face' ? 'face-shape' : category.id, title: labels[category.id], subtitle: category.title, scoreLabel: category.title, score: 7.4, features: [], explanation: descriptions[category.id], ...(category.id === 'eyes' ? { eyeColor: 'blue' } : category.id === 'hair' ? { hairColor: 'brown', overlayPreset: previewHairOverlay } : category.id === 'ears' ? { overlayPreset: previewEarOverlay } : category.id === 'skin' ? { overlayPreset: null, faceMapPointCount: 60 } : {}) }))
const overallFeatures = createOverallFeatureGrid(() => 7.4, 7.4)
categories.push({ id: 'overall', title: 'Overall', subtitle: 'Facial harmony, structure and balance', scoreLabel: 'Mogging Score', score: 7.4, features: overallFeatures, explanation: 'Eye area, jaw and chin, cheekbones, facial thirds, symmetry and skin quality contribute to the complete assessment. PSL is shown separately on its eight-point scale.' })
const overallGroups: WebRubricGroup[] = [{
  id: 'overall', title: 'Overall', rubrics: [
    { id: 'overall.psl', label: 'PSL score', value: '5.9 / 8', visual: 'Orbit', scale: 'quality', positions: [5.9 / 8], grade: null },
    ...overallFeatures.map(feature => ({ id: `overall.${feature.label}`, label: feature.label, value: feature.value, visual: feature.label === 'Symmetry' ? 'Orbit' : 'Text', scale: 'quality' as const, positions: feature.label === 'Symmetry' ? [.74] : [], grade: null })),
  ],
}]


export default function ReportPreview() {
  const [mode, setMode] = useState<'design' | 'sample' | 'limited'>('design')
  const designEntries = entries.map(entry => ({ id: entry.id, value: designValues[entry.id] ?? entry.value }))
  const visibleEntries = mode === 'design' ? designEntries : mode === 'limited' ? entries.map(entry => entry.id.startsWith('skin.') || entry.id.startsWith('eyes.') ? { ...entry, value: null, evidence: 'Insufficient capture detail; retake in even light.' } : entry) : entries
  return <>
    <Head><title>Mogging · Web report v2 preview</title><meta name="robots" content="noindex,nofollow" /></Head>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3 sm:px-10">
      <div><p className="text-sm font-medium">Web report v2 · Local preview</p><p className="mt-1 text-xs text-zinc-500">{mode === 'design' ? 'Illustrative scales and header scores. These are design fixtures, not calibrated analysis.' : 'Ungraded sample observations. Header scores are layout fixtures.'}</p></div>
      <div className="flex rounded-full bg-zinc-100 p-1" aria-label="Preview data">
        {([['design', 'Design'], ['sample', 'Sample results'], ['limited', 'Limited capture']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-full px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00A8EF] ${mode === value ? 'bg-white text-black shadow-sm' : 'text-zinc-500'}`}>{label}</button>)}
      </div>
    </div>
    <div className={styles.previewShell}><AnalysisReport categories={categories} imageSrc="/model.png" landmarks={null} score={7.4} pslScore={5.9} renderDetails={category => <V2ReportDetail key={`${category.id}-${mode}`} category={category} groups={category.id === 'overall' ? overallGroups : buildWebRubricGroups(category.id, visibleEntries, mode === 'design' ? designIllustrations : {})} />}>
      <div className="mt-8 border border-dashed p-4 text-xs leading-5 text-zinc-500">Development preview only.<br />No report saved or customer credits used.</div>
    </AnalysisReport></div>
  </>
}

export function getServerSideProps() {
  return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
}
