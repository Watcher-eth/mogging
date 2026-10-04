import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { useReducedMotion } from 'motion/react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MINIMUM_SUBMISSION_VIEWS } from '@/lib/creator/validation'

function ViewsGoal({ start }: { start: number }) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(start)
  useEffect(() => {
    const timer = setTimeout(() => setValue(MINIMUM_SUBMISSION_VIEWS), 450)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-center gap-3 rounded-2xl bg-sky-50 px-4 py-7 text-[#00A8EF]"
    >
      <Eye className="size-5" />
      <NumberFlow
        value={reduced ? MINIMUM_SUBMISSION_VIEWS : value}
        locales="en-US"
        animated={!reduced}
        spinTiming={{ duration: 2200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        transformTiming={{ duration: 2200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        className="text-5xl font-semibold tracking-tight sm:text-6xl"
      />
      <span className="text-xs font-medium uppercase tracking-widest">Views to qualify</span>
    </div>
  )
}

export function MinimumViewsDialog({ views, onClose }: {
  views: number | null
  onClose: () => void
}) {
  return (
    <Dialog open={views !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="creator-dialog max-w-md gap-5 p-6 text-center [&>button:last-child]:flex [&>button:last-child]:size-10 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:bg-transparent [&>button:last-child]:p-0 [&>button:last-child]:text-zinc-500 [&>button:last-child]:backdrop-blur-none [&>button:last-child]:hover:bg-sky-100 [&>button:last-child]:hover:text-zinc-900">
        <ViewsGoal key={views} start={views ?? 0} />
        <div className="space-y-2">
          <DialogTitle>Your post hasn’t reached the minimum views yet</DialogTitle>
          <DialogDescription>
            Your post currently has {views?.toLocaleString('en-US')} views. Please wait until your video or slideshow gets at least 20,000 views, then resubmit.
          </DialogDescription>
        </div>
        <Button type="button" className="h-11 w-full rounded-[20px]" onClick={onClose}>
          Back to submission
        </Button>
      </DialogContent>
    </Dialog>
  )
}
