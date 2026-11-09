import { useSyncExternalStore } from 'react'
import { phoneViewportQuery } from '@/lib/analysis/phone-layout'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(phoneViewportQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function isPhoneViewport() {
  return window.matchMedia(phoneViewportQuery).matches
}

export function usePhoneLayout(phoneEntry: boolean) {
  return useSyncExternalStore(subscribe, isPhoneViewport, () => phoneEntry)
}
