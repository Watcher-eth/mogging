import { useSound } from '@web-kits/audio/react'
import type { SoundDefinition } from '@web-kits/audio'

export const selectSound: SoundDefinition = {
  source: { type: 'sample', url: '/sounds/select.mp3' },
  gain: 0.42,
}

export const filterSound: SoundDefinition = {
  source: { type: 'sample', url: '/sounds/filter.mp3' },
  gain: 0.38,
}

export const voteSound: SoundDefinition = {
  source: { type: 'sample', url: '/sounds/vote.mp3' },
  gain: 0.48,
}

export const tickingSound: SoundDefinition = {
  source: { type: 'sample', url: '/sounds/ticking.mp3', loop: true },
  envelope: { attack: 0, decay: 60, sustain: 1 },
  gain: 0.28,
}

// Minimal presets by Raphael Salaja (MIT).
// https://github.com/raphaelsalaja/audio/blob/d8c04c77eff93e4ff8355b96dfa806f9a8c79b69/.web-kits/minimal.ts
export const expandCue: SoundDefinition = {
  source: { type: "sine", frequency: { start: 800, end: 1000 } },
  envelope: { attack: 0, decay: 0.04, sustain: 0, release: 0.012 },
  gain: 0.06,
}

export const copyCue: SoundDefinition = {
  layers: [
    { source: { type: "sine", frequency: 1000 }, envelope: { attack: 0, decay: 0.012, sustain: 0, release: 0.004 }, gain: 0.08 },
    { source: { type: "sine", frequency: 1200 }, envelope: { attack: 0, decay: 0.012, sustain: 0, release: 0.004 }, delay: 0.035, gain: 0.07 },
  ],
}

export const downloadCue: SoundDefinition = {
  source: { type: 'sine', frequency: { start: 800, end: 1100 } },
  envelope: { attack: 0.003, decay: 0.035, sustain: 0, release: 0.012 },
  gain: 0.05,
}

export const successCue: SoundDefinition = {
  layers: [
    { source: { type: 'sine', frequency: 523 }, envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.015 }, gain: 0.1 },
    { source: { type: 'sine', frequency: 784 }, envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.015 }, delay: 0.06, gain: 0.08 },
  ],
}

export function useQuietCue(sound: SoundDefinition) {
  const play = useSound(sound, { volume: 0.35 })
  return () => {
    if (document.hidden || typeof AudioContext === 'undefined') return
    try {
      play()
    } catch {
      // Audio feedback is optional.
    }
  }
}
