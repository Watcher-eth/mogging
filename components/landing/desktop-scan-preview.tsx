import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from 'motion/react'
import { ScanImagePanel } from '@/components/analysis/scan-image-panel'
import { ReportImagePanel } from '@/components/analysis/report-image-panel'
import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import { buildLegacyRubricGroups } from '@/lib/analysis-v2/web-report'
import { buildMockOverallCategory } from '@/lib/creator/mock-report-data'
import { mobileOverallPreview, previewLandmarks, previewPortrait } from './overlay'

const category = { ...buildMockOverallCategory('7.4', {}), overlayPreset: mobileOverallPreview }
const groups = buildLegacyRubricGroups(category)

export function DesktopScanPreview() {
  const preview = useRef<HTMLDivElement>(null)
  const visible = useInView(preview, { once: true })
  const reducedMotion = useReducedMotion()
  const [finished, setFinished] = useState(false)
  const showReport = finished || reducedMotion

  useEffect(() => {
    if (!visible || reducedMotion) return
    const timer = window.setTimeout(() => setFinished(true), 3200)
    return () => window.clearTimeout(timer)
  }, [visible, reducedMotion])

  return <LayoutGroup>
    <div ref={preview} className="relative grid h-full min-h-0 w-full max-w-[640px] items-center [container-type:size]" aria-label="Sample desktop evaluation">
      <AnimatePresence initial={false} mode="popLayout">
        {showReport
          ? <motion.div key="report" className="grid h-full min-h-0 grid-cols-[.9fr_1.1fr] items-center gap-4 xl:gap-6">
              <motion.div layoutId="landing-desktop-portrait" className="mx-auto w-full min-w-0" style={{ maxWidth: `calc(100cqh * ${previewPortrait.width / previewPortrait.height})` }} transition={{ duration: .4, ease: [.22, 1, .36, 1] }}>
                <ReportImagePanel category={category} imageSrc={previewPortrait.src} landmarks={previewLandmarks} naturalImage clearPortrait authoredOverlay />
              </motion.div>
              <motion.div className="h-full min-h-0 min-w-0" initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .28, delay: reducedMotion ? 0 : .13 }}>
                <V2ReportDetail category={category} groups={groups} hero />
              </motion.div>
            </motion.div>
          : <motion.div key="scan" className="mx-auto w-full" style={{ maxWidth: `min(270px, calc(100cqh * ${previewPortrait.width / previewPortrait.height}))` }} layoutId="landing-desktop-portrait" transition={{ duration: .4, ease: [.22, 1, .36, 1] }}>
              <ScanImagePanel imageSrc={previewPortrait.src} landmarks={previewLandmarks} />
            </motion.div>}
      </AnimatePresence>
    </div>
  </LayoutGroup>
}
