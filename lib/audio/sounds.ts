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
