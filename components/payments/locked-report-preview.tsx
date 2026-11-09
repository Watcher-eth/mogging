import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import { LockKeyhole, ArrowRight, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnalysisReport } from '@/components/analysis/analysis-report'
import { reportCategoryDefaults } from '@/components/analysis/report-category-defaults'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import styles from './locked-report-preview.module.css'

// Layout placeholders, not an evaluation. No scores are generated before payment.
const categories = [
  { id: 'overall', title: 'Overall', subtitle: 'Your facial evaluation', scoreLabel: 'Overall', score: 0,
    features: ['PSL score', 'Symmetry', 'Skin', 'Proportions'].map(label => ({ label, value: '—' })) },
  ...reportCategoryDefaults.filter(category => category.id !== 'overall').map(category => ({ ...category, score: 0,
    features: category.features.map(feature => ({ label: feature.label, value: '—' })),
  })),
]

export function LockedReportPreview({ imageSrc, landmarks, onUnlock, onRetake }: {
  imageSrc: string; landmarks: FaceLandmarksPayload | null; onUnlock: () => void; onRetake?: () => void
}) {
  const { t } = useTranslation()
  return <div className={styles.preview}>
    {onRetake && <button type="button" className="scan-retake" aria-label="Retake photo" onClick={onRetake}><RotateCcw size={20} /></button>}
    <AnalysisReport mobileScan={Boolean(onRetake)} portraitLayoutId={onRetake ? "analysis-portrait" : undefined} categories={categories} initialCategoryId="overall" imageSrc={imageSrc} landmarks={landmarks} score={null}
      renderDetails={category => <div className={styles.lockedDetails}>
        <div className={onRetake ? undefined : styles.blurred} aria-hidden={!onRetake || undefined} inert={!onRetake}><V2ReportDetail mobile={Boolean(onRetake)} locked={Boolean(onRetake)} category={category} groups={[{ id: category.id, title: category.title, rubrics: category.features.map((feature, index) => ({ id: `${category.id}.preview-${index}`, label: feature.label, value: '—', visual: 'Orbit', scale: 'quality', positions: [.5], grade: null })) }]} /></div>
        {!onRetake && <div className={styles.lock}><LockKeyhole size={18} strokeWidth={1.5} /><p>{t('membership.privatePreview')}</p><span>{t('membership.previewNote')}</span></div>}
      </div>}>
      <div className={styles.previewDock}>
      <button type="button" onClick={onUnlock} className={styles.unlock}>{onRetake ? t('membership.unlockReport') : 'View plans'}<ArrowRight size={15} /></button>
      <p className={styles.note}>{onRetake ? t('membership.previewNote') : 'Compare report and membership options before you pay.'}</p>
      </div>
    </AnalysisReport>
  </div>
}
