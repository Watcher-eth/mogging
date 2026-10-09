import * as Dialog from '@radix-ui/react-dialog'
import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app/app-header'
import { AnalysisReport, ReportActions, type DesktopReportCategory } from '@/components/analysis/analysis-report'
import { V2ReportDetail } from '@/components/analysis/v2/report-detail'
import type { WebRubric } from '@/lib/analysis-v2/web-report'
import { Button } from '@/components/ui/button'
import { downloadBlob } from '@/lib/creator/export-slides'
import type { GeneratorImage } from '@/lib/creator/content-generator'

export type DesktopMockReportData = {
  id: string
  image: GeneratorImage
  categories: DesktopReportCategory[]
  initialCategoryId: string
  overallScore: number
}

export function DesktopMockReport({ report, open, onClose }: {
  report: DesktopMockReportData
  open: boolean
  onClose: () => void
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  // The mock's publication checkbox is presentation-only and never updates an account.
  const [battleOptOut, setBattleOptOut] = useState(true)

  async function downloadScreenshot() {
    if (!captureRef.current || exporting) return
    setExporting(true)
    try {
      const { toBlob } = await import('html-to-image')
      await document.fonts.ready
      const blob = await toBlob(captureRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        skipFonts: true,
        filter: node => !(node instanceof HTMLElement && node.hasAttribute('data-capture-control')),
      })
      if (!blob) throw new Error('Could not export the desktop report')
      downloadBlob(blob, 'mogging-mock-report-desktop.png')
      toast.success('Desktop report screenshot exported')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the desktop report')
    } finally {
      setExporting(false)
    }
  }

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[90] bg-white" />
      <Dialog.Content data-creator-controls className="fixed inset-0 z-[100] overflow-y-auto bg-white text-black outline-none" onOpenAutoFocus={event => { event.preventDefault(); captureRef.current?.focus() }}>
        <Dialog.Title className="sr-only">Desktop mock report</Dialog.Title>
        <Dialog.Description className="sr-only">Fullscreen analysis report. Choose a category to explore it. Share report downloads a PNG. Press Escape or Back to editor to edit your values.</Dialog.Description>
        <div ref={captureRef} tabIndex={-1} className="min-h-dvh bg-white outline-none" aria-busy={exporting}>
          <AppHeader activePath="/analysis">
            <Button data-capture-control variant="outline" className="h-8 rounded-lg border-zinc-300 bg-white px-2 text-xs shadow-none sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm" onClick={onClose}>
              <ArrowLeft className="size-4" /><span className="hidden sm:inline">Back to editor</span><span className="sm:hidden">Edit</span>
            </Button>
          </AppHeader>
          <AnalysisReport naturalImage categories={report.categories} initialCategoryId={report.initialCategoryId} imageSrc={report.image.dataUrl} landmarks={report.image.landmarks} score={report.overallScore} pslScore={report.overallScore * .8} renderDetails={category => <V2ReportDetail category={category} groups={[{ id: category.id, title: category.title, rubrics: category.features.map((feature, index) => ({ id: `${category.id}.${index}`, visual: 'Text', positions: [], grade: null, ...feature } as WebRubric)) }]} />}>
            <ReportActions score={report.overallScore} battleOptOut={battleOptOut} battleOptOutSaving={false} onBattleOptOutChange={setBattleOptOut} onOpenShare={() => void downloadScreenshot()} onReset={onClose} />
          </AnalysisReport>
        </div>
        <span className="sr-only" role="status">{exporting ? 'Exporting desktop report' : ''}</span>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
