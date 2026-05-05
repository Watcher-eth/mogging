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
