import { useWebHaptics } from 'web-haptics/react'
import { mutedTapCue, useQuietCue } from '@/lib/audio/sounds'

export function useScanFeedback() {
  const play = useQuietCue(mutedTapCue)
  const { trigger, isSupported } = useWebHaptics()

  return (kind: 'light' | 'selection' | 'action' = 'light') => {
    if (kind === 'action') play()
    if (isSupported) void trigger(kind === 'selection' ? 'selection' : 'light', { intensity: .35 })?.catch(() => {})
  }
}
