import type { ReactNode } from 'react'
import { AnalysisReport, type DesktopReportCategory } from '../analysis-report'
import { V2ReportDetail } from './report-detail'
import { buildWebRubricGroups, type WebRubricGroup } from '@/lib/analysis-v2/web-report'
import type { WebReport } from '@/lib/analysis-v2/report-schema'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import registry from '@/lib/analysis-v2/rubric-registry.json'
import styles from './rubrics.module.css'

const titles: Record<string, string> = { eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', jaw: 'Jaw', cheeks: 'Cheeks', face: 'Face shape', proportions: 'Proportions', symmetry: 'Symmetry', skin: 'Skin', hair: 'Hair', ears: 'Ears' }
function contourOverlay(id: 'hair' | 'ears', report: WebReport): OverlayPreset {
  return { id: `web-v2-${id}`, footer: `[ ${id.toUpperCase()} ]`, primitives: report.contours[id].map((points, index) => ({
    id: `${id}-${index}`, kind: 'polyline', points: points.map(point => ({ point })), strokeWidth: .32, opacity: .8,
    animation: { delay: index * 180, duration: 1200, entrance: 'draw' },
  })) }
}

export function WebAnalysisReport({ report, imageSrc, landmarks, pslScore, children }: { report: WebReport; imageSrc: string; landmarks: FaceLandmarksPayload | null; pslScore: number; children?: ReactNode }) {
  const categories: DesktopReportCategory[] = registry.categories.filter(definition => definition.rubrics.some(rubric => rubric.output !== 'D' && report.entries.some(entry => entry.id === rubric.id && entry.value !== null))).map(definition => {
    const category = report.categories.find(item => item.id === definition.id)!
    return { id: definition.id === 'face' ? 'face-shape' : definition.id, title: titles[definition.id], subtitle: definition.title, scoreLabel: definition.title, score: category.score, features: [], explanation: category.explanation,
      ...(definition.id === 'eyes' ? { eyeColor: report.eyeColor ?? undefined } : {}),
      ...(definition.id === 'hair' ? { hairColor: report.hairColor ?? undefined, overlayPreset: contourOverlay('hair', report) } : {}),
      ...(definition.id === 'ears' ? { overlayPreset: contourOverlay('ears', report) } : {}),
      ...(definition.id === 'skin' ? { overlayPreset: null, faceMapPointCount: 60 } : {}),
    }
  })
  const getScore = (id: string) => report.categories.find(category => category.id === id)!.score
  const overallFeatures = [
    ['Eye area', getScore('eyes')], ['Jaw & chin', getScore('jaw')], ['Cheekbone structure', getScore('cheeks')],
    ['Facial thirds', getScore('proportions')], ['Symmetry', getScore('symmetry')], ['Skin quality', getScore('skin')],
  ] as const
  categories.push({ id: 'overall', title: 'Overall', subtitle: 'Facial harmony, structure and balance', scoreLabel: 'Mogging Score', score: report.overallScore, features: [], explanation: report.summary })
  const overallGroups: WebRubricGroup[] = [{ id: 'overall', title: 'Overall', rubrics: [
    { id: 'overall.psl', label: 'PSL score', value: `${pslScore.toFixed(1)} / 8`, visual: 'Orbit', scale: 'quality', positions: [pslScore / 8], grade: null },
    ...overallFeatures.map(([label, score]) => ({ id: `overall.${label}`, label, value: `${score.toFixed(1)} / 10`, visual: label === 'Symmetry' ? 'Orbit' : 'Text', scale: 'quality' as const, positions: label === 'Symmetry' ? [score / 10] : [], grade: null })),
  ] }]
  return <div className={styles.reportShell}><AnalysisReport naturalImage categories={categories} imageSrc={imageSrc} landmarks={landmarks} score={report.overallScore} pslScore={pslScore} renderDetails={category => <V2ReportDetail category={category} groups={category.id === 'overall' ? overallGroups : buildWebRubricGroups(category.id, report.entries)} />}>{children}</AnalysisReport></div>
}
