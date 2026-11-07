import { useEffect, useRef } from 'react'
import { trackWebEvent } from '@/lib/analytics/client'

export function useWebStep(step: string, enabled: boolean) {
  const clock = useRef({ elapsed: 0, visibleAt: null as number | null })
  const duration = () => Math.min(1800000, clock.current.elapsed + (clock.current.visibleAt === null ? 0 : Date.now() - clock.current.visibleAt))
  useEffect(() => {
    if (!enabled) return
    clock.current = { elapsed: 0, visibleAt: document.hidden ? null : Date.now() }
    const visibility = () => {
      clock.current.elapsed = duration()
      clock.current.visibleAt = document.hidden ? null : Date.now()
    }
    document.addEventListener('visibilitychange', visibility)
    trackWebEvent('onboarding_step_viewed', { surface: 'web_analysis', step })
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      trackWebEvent('onboarding_step_exited', { surface: 'web_analysis', step, duration_ms: duration() })
    }
  }, [enabled, step])
  return () => {
    if (enabled) trackWebEvent('onboarding_step_completed', { surface: 'web_analysis', step, duration_ms: duration() })
  }
}
