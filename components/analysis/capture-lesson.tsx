import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Info } from 'lucide-react'
import { StudioGuide } from './studio-guide'

export function CaptureLesson({ side }: { side: boolean }) {
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="desktop-capture-info" aria-label={side ? 'Side profile instructions' : 'Front photo instructions'}>
        <Info size={21} aria-hidden="true" />
      </button>
    </DialogTrigger>
    <DialogContent className="desktop-lesson-dialog" overlayClassName="bg-black/25 backdrop-blur-[3px]" aria-describedby={undefined}>
      <DialogTitle className="sr-only">{side ? 'Take a side profile' : 'Take a front photo'}</DialogTitle>
      <StudioGuide kind={side ? 'side' : 'front'} />
    </DialogContent>
  </Dialog>
}
