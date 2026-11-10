import { LockKeyholeOpen } from '@/components/ui/mogging-glyphs'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AnalysisReport, type DesktopReportCategory } from './analysis-report'
import { V2ReportDetail } from './v2/report-detail'
import { basicCategories, lockedReportMetrics, type BasicReport } from '@/lib/analysis-v2/basic-preview'
import { measureLandmarks } from '@/lib/analysis-v2/measurements'
import type { WebRubric } from '@/lib/analysis-v2/web-report'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import type { AnalysisDraftImage } from '@/lib/client/analysisDraft'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'

const overall = { id: 'overall', title: 'Overall', subtitle: '', scoreLabel: '', score: 0, features: [] }
const categories: DesktopReportCategory[] = [overall, ...basicCategories.map(category => ({
  id: category.id, title: category.title, subtitle: '', scoreLabel: '', score: 0, features: [],
}))]

export function DesktopAssessmentPreview({ imageSrc, landmarks, front, side, basicValues, onUnlock }: {
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  front?: AnalysisDraftImage
  side?: AnalysisDraftImage
  basicValues?: BasicReport['values']
  onUnlock: () => void
}) {
  const reduce = useReducedMotion()
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  useEffect(() => {
    if (landmarks || !front) return
    let active = true
    void getReportImageLandmarks(imageSrc, imageSrc).then(value => { if (active) setDetected(value) })
    return () => { active = false }
  }, [imageSrc, landmarks, front])
  const measured = landmarks ?? detected
  const metrics = previewMeasurements(measured, front)
  return <motion.div className="desktop-locked-report" initial={false}
    animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : .4 }}>
    <AnalysisReport categories={categories} imageSrc={imageSrc} landmarks={measured} score={null} portraitLayoutId="analysis-portrait"
      portraits={side ? [{ src: side.dataUrl, landmarks: side.landmarks ?? null, side: true, label: 'Side profile' }] : undefined}
      renderDetails={category => {
        const rubric = basicCategories.find(item => item.id === category.id)
        const realValue = rubric && basicValues?.[rubric.metric.id]
        const observation = rubric && realValue ? [rubric.metric.name, realValue] : metrics[category.id]
        const labels = lockedReportMetrics(category.id)
        const metricId = rubric?.metric.id ?? 'overall.preview'
        const tiles: WebRubric[] = [
          previewTile(metricId, observation?.[0] ?? rubric?.metric.name ?? 'Portrait proportions', observation?.[1] ?? 'Available in Basic'),
          ...labels.map((label, index) => previewTile(`${category.id}.locked-${index}`, label, '')),
        ]
        return <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : .42, ease: [.22, 1, .36, 1] }}>
          <V2ReportDetail category={category} preview={{ visibleId: metricId, onUnlock }}
            groups={[{ id: category.id, title: category.title, rubrics: tiles }]} />
        </motion.div>
      }}>
      <button type="button" className="assessment-primary" onClick={onUnlock}><LockKeyholeOpen size={16} aria-hidden="true" /> Unlock report</button>
    </AnalysisReport>
  </motion.div>
}

function previewTile(id: string, label: string, value: string): WebRubric {
  return { id, label, value, visual: 'Text', positions: [], grade: null }
}

function previewMeasurements(landmarks: FaceLandmarksPayload | null, front?: AnalysisDraftImage) {
  const values: Record<string, [string, string]> = {}
  if (!landmarks || landmarks.confidence < .58 || Math.abs(landmarks.quality?.yawRadians ?? 0) > .35) return values
  const mesh = front?.mesh
  const { anchors: a, contours, image } = landmarks
  const span = (first?: NormalizedPoint, second?: NormalizedPoint) => first && second
    ? Math.hypot((first.x - second.x) * image.width, (first.y - second.y) * image.height) : 0
  const ratio = (id: string, label: string, num: number, den: number) => {
    if (num > 0 && den > 0) values[id] = [label, `${(num / den).toFixed(2)}×`]
  }
  const cheek = span(a.leftCheek, a.rightCheek), height = span(a.forehead, a.chin)
  const eye = (span(a.leftEyeInner, a.leftEyeOuter) + span(a.rightEyeInner, a.rightEyeOuter)) / 2
  const noseBase = contours?.noseBase
  const subnasale = mesh?.points[2] ?? noseBase?.[3]
  const points = mesh ? measureLandmarks(mesh).metrics : []
  const lip = points.find(metric => metric.id === 'central-lip-ratio')?.value
  const nose = noseBase?.length ? Math.max(...noseBase.map(point => point.x)) - Math.min(...noseBase.map(point => point.x)) : 0
  const pupils = span(a.leftPupil, a.rightPupil)
  ratio('overall', 'Visible face width / height', cheek, height)
  ratio('eyes', 'Inner-eye gap / eye width', span(a.leftEyeInner, a.rightEyeInner), eye)
  ratio('brows', 'Brow-to-pupil distance / eye width', span(a.leftBrow, a.leftPupil), eye)
  ratio('nose', 'Nose-base width / cheek width', nose * image.width, cheek)
  if (lip != null) ratio('mouth', 'Lower / upper lip height', lip, 1)
  else ratio('mouth', 'Mouth width / pupil span', span(a.mouthLeft, a.mouthRight), pupils)
  ratio('jaw', 'Chin / lower-face height', span(a.lowerLip, a.chin), span(subnasale, a.chin))
  ratio('cheeks', 'Cheek width / eye span', cheek, span(a.leftEyeOuter, a.rightEyeOuter))
  if (front?.hairColor && front.hairColor !== 'other') values.hair = ['Visible hair color', front.hairColor]
  if (cheek > 0) values.skin = ['Photo detail across cheeks', `${Math.round(cheek)} px`]
  ratio('face', 'Jaw width / cheek width', span(a.jawLeft, a.jawRight), cheek)
  ratio('proportions', 'Lower-third partition', span(subnasale, a.mouthCenter), span(subnasale, a.chin))
  const eyeWidthDifference = points.find(metric => metric.id === 'eye-width-difference')?.value
  const eyeWidths = [span(a.leftEyeInner, a.leftEyeOuter), span(a.rightEyeInner, a.rightEyeOuter)]
  const difference = eyeWidthDifference ?? (eyeWidths.every(Boolean) ? 100 * Math.abs(eyeWidths[0] - eyeWidths[1]) / eye : null)
  if (difference != null) values.symmetry = ['Visible eye-width difference', `${difference.toFixed(1)}%`]
  return values
}
