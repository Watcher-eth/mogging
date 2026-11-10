import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import { LockKeyhole, ArrowRight, RotateCcw } from '@/components/ui/mogging-glyphs'
import { useTranslation } from 'react-i18next'
import { AnalysisReport } from '@/components/analysis/analysis-report'
import { buildCheekContextGroups, buildOverallRubricGroups, buildWebRubricGroups, webReportCategories } from '@/lib/analysis-v2/web-report'
import { designIllustrations, designValues } from '@/lib/analysis-v2/preview-fixtures'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import styles from './locked-report-preview.module.css'

// Use the report inventory to reserve the actual tile layouts. Illustrations
// choose chart types only; no fixture values or markers are rendered.
const entries = Object.entries(designValues).map(([id, value]) => ({ id, value }))
const overall = buildOverallRubricGroups()
const categories = [
  { id: 'overall', title: 'Overall', subtitle: '', scoreLabel: 'Overall', score: 0, features: [] },
  ...webReportCategories.map(({ displayId, displayTitle, title }) => ({
    id: displayId, title: displayTitle, subtitle: title, scoreLabel: title, score: 0, features: [],
  })),
]
const groups = Object.fromEntries(categories.map(({ id }) => [id, id === 'overall' ? overall : [
  ...buildWebRubricGroups(id, entries, designIllustrations),
  ...(id === 'cheeks' ? buildCheekContextGroups(entries) : []),
]]))

export function LockedReportPreview({ imageSrc, landmarks, onUnlock, onRetake }: {
  imageSrc: string; landmarks: FaceLandmarksPayload | null; onUnlock: () => void; onRetake?: () => void
}) {
  const { t } = useTranslation()
  return <div className={styles.preview}>
    {onRetake && <button type="button" className="scan-retake" aria-label="Retake photo" onClick={onRetake}><RotateCcw size={20} /></button>}
    <AnalysisReport mobileScan={Boolean(onRetake)} lockedPreview categories={categories} initialCategoryId="overall" imageSrc={imageSrc} landmarks={landmarks} score={null}
      renderDetails={category => onRetake
        ? <V2ReportDetail mobile locked category={category} groups={groups[category.id]} />
        : <div className={styles.lockedDetails}>
          <div className={styles.blurred} aria-hidden="true" inert><V2ReportDetail locked category={category} groups={groups[category.id]} /></div>
          <div className={styles.lock}><LockKeyhole size={18} strokeWidth={1.5} /><p>{t('membership.privatePreview')}</p><span>{t('membership.previewNote')}</span></div>
        </div>}>
      <div className={styles.previewDock}>
      <button type="button" onClick={onUnlock} className={styles.unlock}>{onRetake ? t('membership.unlockReport') : 'View plans'}<ArrowRight size={15} /></button>
      <p className={styles.note}>{onRetake ? t('membership.previewNote') : 'Compare report and membership options before you pay.'}</p>
      </div>
    </AnalysisReport>
  </div>
}
