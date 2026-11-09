import { useEffect, useState } from 'react'
import { TextMorph } from 'torph/react'
import { formatRenderRemaining } from '@/lib/creator/export-progress'

export function RenderTimeRemaining({ seconds }: { seconds: number | null }) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    setRemaining(seconds)
    if (seconds === null || seconds <= 0) return
    const deadline = Date.now() + seconds * 1000
    const timer = window.setInterval(() => setRemaining(Math.max(-1, (deadline - Date.now()) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [seconds])
  return <p aria-label="Estimated rendering time remaining" className="text-center text-xs text-zinc-500"><TextMorph>{remaining!==null && remaining<0?'Updating time estimate…':formatRenderRemaining(remaining)}</TextMorph></p>
}
