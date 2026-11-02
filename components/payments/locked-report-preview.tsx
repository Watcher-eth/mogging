import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import { useEffect, useRef } from 'react'
import { LockKeyhole, ArrowRight } from 'lucide-react'
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

export function LockedReportPreview({ imageSrc, landmarks, onUnlock }: {
  imageSrc: string; landmarks: FaceLandmarksPayload | null; onUnlock: () => void
}) {
  const { t } = useTranslation()
  const offered = useRef(false)
  useEffect(() => {
    if (offered.current) return
    const timer = setTimeout(() => { offered.current = true; onUnlock() }, 1200)
    return () => clearTimeout(timer)
  }, [onUnlock])

  return <div className={styles.preview}>
    <AnalysisReport categories={categories} initialCategoryId="overall" imageSrc={imageSrc} landmarks={landmarks} score={null}
      renderDetails={category => <div className={styles.lockedDetails}>
        <div className={styles.blurred} aria-hidden="true" inert><V2ReportDetail category={category} groups={[{ id: category.id, title: category.title, rubrics: category.features.map((feature, index) => ({ id: `${category.id}.preview-${index}`, label: feature.label, value: '—', visual: 'Orbit', scale: 'quality', positions: [.5], grade: null })) }]} /></div>
        <div className={styles.lock}><LockKeyhole size={18} strokeWidth={1.5} /><p>{t('membership.privatePreview')}</p><span>{t('membership.previewNote')}</span></div>
      </div>}>
      <button type="button" onClick={onUnlock} className={styles.unlock}>{t('membership.unlockReport')}<ArrowRight size={15} /></button>
      <p className={styles.note}>{t('membership.previewNote')}</p>
    </AnalysisReport>
  </div>
}
