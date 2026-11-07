import { useWebHaptics } from 'web-haptics/react'
import { expandCue, useQuietCue } from '@/lib/audio/sounds'

export function useScanFeedback() {
  const play = useQuietCue(expandCue)
  const { trigger, isSupported } = useWebHaptics()

  return (kind: 'light' | 'selection' = 'light') => {
    play()
    if (isSupported) void trigger(kind, { intensity: .35 })?.catch(() => {})
  }
}
