import { renderToBuffer, type Layer, type SoundDefinition } from '@web-kits/audio'
import type { VideoComposition } from './video-composition'

export const videoSounds = {
  click: 'Precision click',
  tap: 'Soft tap',
  ratchet: 'Mechanical timeline',
  sweep: 'Air sweep',
  timer: 'Battle timer',
} as const
export type VideoSound = keyof typeof videoSounds
export type SoundCue = { sound: VideoSound; timeMs: number; durationMs?: number }

const impact = (start: number, end: number, decay: number, gain: number, delay = 0): Layer => ({
  source: { type: 'sine', frequency: { start, end } },
  envelope: { attack: .001, decay },
  gain, delay,
})
const sounds = {
  click: { layers: [impact(1250, 475, .019, .52), impact(390, 180, .029, .18)] },
  tap: { layers: [impact(365, 135, .064, .48), impact(1050, 490, .025, .12)] },
  ratchet: { layers: [0, .043, .09, .145, .21].map((delay, index) => impact(1020 + index * 100, 540, .018, .33 + index * .025, delay)) },
  sweep: {
    source: { type: 'noise', color: 'pink' },
    filter: { type: 'bandpass', frequency: 950 },
    envelope: { attack: .09, decay: .23 },
    gain: .58,
  },
} satisfies Record<Exclude<VideoSound, 'timer'>, SoundDefinition>

const sampleRate = 48000
const buffers = new Map<VideoSound, Promise<AudioBuffer>>()
function sample(sound: VideoSound) {
  const cached = buffers.get(sound)
  if (cached) return cached
  const pending = sound === 'timer'
    ? fetch('/sounds/ticking.mp3').then(response => {
      if (!response.ok) throw new Error('Could not load the Battle timer.')
      return response.arrayBuffer()
    }).then(bytes => new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes))
    : renderToBuffer(sounds[sound], { duration: .42, sampleRate, numberOfChannels: 1 })
  buffers.set(sound, pending)
  void pending.catch(() => buffers.delete(sound))
  return pending
}

export function suggestVideoSounds(composition: VideoComposition): SoundCue[] {
  const cues: SoundCue[] = []
  for (const [index, scene] of composition.scenes.entries()) {
    const previous = composition.scenes[index - 1]
    const study = scene.featureStudy
    const reveal = study?.phase === 'reveal' && previous?.featureStudy?.phase !== 'reveal'
    const wipe = study?.comparison === 'wipe' && previous?.featureStudy?.comparison !== 'wipe'
    const scoreReport = scene.source.kind === 'report' && scene.focus === 'scores'
      && (previous?.source.kind !== 'report' || previous.source.categoryId !== scene.source.categoryId)
    const authoredBoundary = previous && (previous.scriptRange?.cueId ?? previous.cueId) !== (scene.scriptRange?.cueId ?? scene.cueId)
    const transition = authoredBoundary && scene.tracks.find(track => track.target === 'content')
    const newPhoto = authoredBoundary && Boolean(scene.source.imageId) && previous.source.imageId !== scene.source.imageId
    const recipe = composition.recipe
    const sound = reveal || wipe ? 'sweep'
      : scoreReport ? 'ratchet'
      : transition && ['wipe-left', 'wipe-right', 'wipe-up', 'screen-push', 'card-reveal'].includes(transition.primitive) ? 'sweep'
      : newPhoto && recipe === 'measurement-explainer' ? 'click'
      : newPhoto && recipe === 'feature-study' ? 'tap'
      : !index && study?.opening === 'jaw-choice' ? 'click' : undefined
    const offset = reveal ? 0 : wipe ? Math.min(330, scene.durationMs * .16) : scoreReport ? 100 : transition ? transition.startMs : 0
    const timeMs = scene.startMs + offset
    if (sound && timeMs < composition.durationMs - 150 && timeMs - (cues.at(-1)?.timeMs ?? -Infinity) >= 1800) cues.push({ sound, timeMs })
  }
  const opening = composition.scenes.findIndex(({ featureStudy }) => (featureStudy?.opening === 'smile-choice' || featureStudy?.opening === 'jaw-width-choice') && featureStudy.phase === 'hold')
  if (opening >= 0) {
    const { startMs: start, featureStudy } = composition.scenes[opening]
    const reveal = composition.scenes.slice(opening + 1).find(scene => scene.featureStudy?.opening !== featureStudy?.opening || scene.featureStudy?.phase === 'reveal')
    const durationMs = (reveal?.startMs ?? composition.durationMs) - start
    if (durationMs > 300) cues.push({ sound: 'timer', timeMs: start, durationMs })
  }
  return cues.sort((a, b) => a.timeMs - b.timeMs)
}

/** Mix once so the player and MP4 encoder share the same clock and waveform. */
export async function mixVideoSounds(durationMs: number, voice: AudioBuffer | undefined, cues: readonly SoundCue[], level: number) {
  const audible = cues.filter(cue => cue.timeMs >= 0 && cue.timeMs < durationMs)
  if (!audible.length || level <= 0) return voice
  const context = new OfflineAudioContext(1, Math.ceil(durationMs * sampleRate / 1000), sampleRate)
  function schedule(buffer: AudioBuffer, seconds: number, volume: number, length?: number) {
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    source.connect(gain).connect(context.destination)
    if (length !== undefined) {
      const duration = Math.min(length, buffer.duration)
      const fade = Math.min(.12, duration / 3)
      gain.gain.setValueAtTime(0, seconds)
      gain.gain.linearRampToValueAtTime(volume, seconds + fade)
      gain.gain.setValueAtTime(volume, seconds + duration - fade)
      gain.gain.linearRampToValueAtTime(0, seconds + duration)
      source.start(seconds, 0, duration)
    } else {
      gain.gain.value = volume
      source.start(seconds)
    }
  }
  if (voice) schedule(voice, 0, .88)
  await Promise.all(audible.map(async cue => schedule(await sample(cue.sound), cue.timeMs / 1000, level * (cue.sound === 'timer' ? .10 : voice ? .23 : .38), cue.sound === 'timer' ? (cue.durationMs ?? 2000) / 1000 : undefined)))
  const mix = await context.startRendering()
  const channel = mix.getChannelData(0)
  const peak = channel.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  if (peak > .98) {
    const gain = .98 / peak
    for (let index = 0; index < channel.length; index++) channel[index] *= gain
  }
  return mix
}
