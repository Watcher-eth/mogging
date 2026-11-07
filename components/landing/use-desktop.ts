import { useSyncExternalStore } from 'react'

const query = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function desktop() {
  return window.matchMedia(query).matches
    && navigator.maxTouchPoints < 2
    && !/Android|iPad|iPhone|Mobile|Tablet/i.test(navigator.userAgent)
}

export function useDesktop() {
  return useSyncExternalStore(subscribe, desktop, () => false)
}
