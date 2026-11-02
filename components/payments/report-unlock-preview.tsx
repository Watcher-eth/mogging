import dynamic from 'next/dynamic'
import { LockKeyhole } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import styles from './report-unlock-preview.module.css'
const ScanImagePanel = dynamic(() => import('@/components/analysis/scan-image-panel').then(module => module.ScanImagePanel))

export function ReportUnlockPreview({ imageSrc, landmarks, variant = 'personal' }: { imageSrc: string | null; landmarks: FaceLandmarksPayload | null; variant?: 'personal' | 'example' }) {
  const { t } = useTranslation()
  return <div className={styles.preview}>
    <div className={styles.photo}><ScanImagePanel imageSrc={imageSrc} landmarks={landmarks} variant="paywall" fit="cover" /><div className={styles.fade} /></div>
    <div className={styles.report} aria-hidden="true"><div className={styles.score}><span /><span /></div><div className={styles.grid}>{['Symmetry', 'Skin', 'Proportions', 'Features'].map(label => <div key={label}><span>{label}</span><div className={styles.chart} /><div className={styles.line} /></div>)}</div></div>
    <div className={styles.caption}><span><LockKeyhole size={12} />{t(variant === 'example' ? 'membership.examplePreview' : 'membership.privatePreview')}</span><p>{t(variant === 'example' ? 'membership.exampleNote' : 'membership.previewNote')}</p></div>
  </div>
}
