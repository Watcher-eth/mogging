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

export const navSound: SoundDefinition = {
  layers: [
    {
      source: { type: 'sine', frequency: { start: 660, end: 880 } },
      envelope: { attack: 0.004, decay: 0.075 },
      gain: 0.09,
    },
    {
      source: { type: 'sine', frequency: 1320 },
      envelope: { attack: 0.002, decay: 0.045 },
      gain: 0.035,
      delay: 0.018,
    },
  ],
}
