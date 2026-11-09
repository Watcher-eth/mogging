import type { ComponentProps, ReactNode } from 'react'
import { AnalysisReport, type DesktopReportCategory } from '../analysis-report'
import { V2ReportDetail } from './report-detail'
import { overallScoreFields, buildCheekContextGroups, buildLegacyRubricGroups, buildWebRubricGroups, type WebRubricGroup } from '@/lib/analysis-v2/web-report'
import type { WebReport } from '@/lib/analysis-v2/report-schema'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import registry from '@/lib/analysis-v2/rubric-registry.json'
import styles from './rubrics.module.css'

const titles: Record<string, string> = { eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', jaw: 'Jaw', cheeks: 'Cheeks', face: 'Face shape', proportions: 'Proportions', symmetry: 'Symmetry', skin: 'Skin', hair: 'Hair', ears: 'Ears' }

export function LegacyAnalysisReport(props: Omit<ComponentProps<typeof AnalysisReport>, 'renderDetails'>) {
  return <div className={styles.reportShell}><AnalysisReport {...props} naturalImage renderDetails={category => <V2ReportDetail animateValues={Boolean(props.heading)} mobile={props.mobileScan} category={category} groups={buildLegacyRubricGroups(category)} />} /></div>
}

function contourOverlay(id: 'hair' | 'ears', report: WebReport): OverlayPreset {
  return { id: `web-v2-${id}`, footer: `[ ${id.toUpperCase()} ]`, primitives: report.contours[id].map((points, index) => ({
    id: `${id}-${index}`, kind: 'polyline', points: points.map(point => ({ point })), strokeWidth: .32, opacity: .8,
    animation: { delay: index * 180, duration: 1200, entrance: 'draw' },
  })) }
}

export function WebAnalysisReport({ report, imageSrc, landmarks, pslScore, children, embedded = false, portraits, portraitLayoutId, initialCategoryId, mobileScan, potentialScore, heading }: { report: WebReport; imageSrc: string; landmarks: FaceLandmarksPayload | null; pslScore: number; children?: ReactNode; embedded?: boolean; portraits?: ComponentProps<typeof AnalysisReport>['portraits']; portraitLayoutId?: string; initialCategoryId?: string; mobileScan?: boolean; potentialScore?: number | null; heading?: ComponentProps<typeof AnalysisReport>['heading'] }) {
  const categories: DesktopReportCategory[] = registry.categories.filter(definition => definition.rubrics.some(rubric => rubric.output !== 'D' && report.entries.some(entry => entry.id === rubric.id && entry.value !== null))).map(definition => {
    const category = report.categories.find(item => item.id === definition.id)!
    return { id: definition.id === 'face' ? 'face-shape' : definition.id, title: titles[definition.id], subtitle: definition.title, scoreLabel: definition.title, score: category.score, features: [], explanation: category.explanation,
      ...(definition.id === 'eyes' ? { eyeColor: report.eyeColor ?? undefined } : {}),
      ...(definition.id === 'hair' ? { hairColor: report.hairColor ?? undefined, overlayPreset: contourOverlay('hair', report) } : {}),
      ...(definition.id === 'ears' ? { overlayPreset: contourOverlay('ears', report) } : {}),
    }
  })
  const getScore = (id: string) => report.categories.find(category => category.id === id)!.score
  categories.push({ id: 'overall', title: 'Overall', subtitle: 'Facial harmony, structure and balance', scoreLabel: heading ? 'Your Score' : 'Mogging Score', score: report.overallScore, features: [], explanation: report.summary })
  const overallGroups: WebRubricGroup[] = [{ id: 'overall', title: 'Overall', rubrics: overallScoreFields.map(([id, label, max]) => {
    const score = id === 'psl' ? pslScore : getScore(id)
    return { id: `overall.${id}`, label, value: `${score.toFixed(1)} / ${max}`, visual: 'Orbit', scale: 'quality', positions: [score / max], grade: null }
  }) }]
  const categoryScores = categories.filter(category => category.id !== 'overall').map(category => category.score)
  const content = <AnalysisReport naturalImage heading={heading} mobileScan={mobileScan} potentialScore={potentialScore} embedded={embedded} portraits={portraits} portraitLayoutId={portraitLayoutId} initialCategoryId={embedded ? "overall" : initialCategoryId} categories={categories} imageSrc={imageSrc} landmarks={landmarks} score={report.overallScore} pslScore={pslScore} renderDetails={category => <V2ReportDetail animateValues={Boolean(heading)} mobile={mobileScan} embedded={embedded} category={category} categoryScores={categoryScores} groups={category.id === 'overall' ? overallGroups : [...buildWebRubricGroups(category.id, report.entries), ...(category.id === 'cheeks' ? buildCheekContextGroups(report.entries) : [])]} />}>{children}</AnalysisReport>
  return embedded ? content : <div className={styles.reportShell}>{content}</div>
}
