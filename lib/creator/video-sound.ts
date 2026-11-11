import { renderToBuffer, type Layer, type SoundDefinition } from '@web-kits/audio'
import { editorialCursorTiming } from './editorial-cursor'
import { sharesEditorialCue } from './editorial-scenes'
import { sculptureSample, sculptureSceneClock, sculptureWithRecordedGuides } from './cephra-study'
import { editorialCueTiming, sceneWordStart } from './video-script'
import type { VideoComposition, VideoScene } from './video-composition'

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

function sceneSound(composition: VideoComposition, scene: VideoScene, index: number): SoundCue | undefined {
  const previous = composition.scenes[index - 1]
  const at = (sound: VideoSound, offset = 0): SoundCue | undefined =>
    offset < scene.durationMs ? { sound, timeMs: scene.startMs + offset } : undefined
  const study = scene.featureStudy
  if (study?.revealWord !== undefined) return at('sweep', sceneWordStart(scene, study.revealWord))
  if (study?.editWord !== undefined && study.comparison === 'drop')
    return at('tap', Math.max(200, sceneWordStart(scene, study.editWord)))
  if (study?.editWord !== undefined && study.comparison === 'wipe')
    return at('sweep', sceneWordStart(scene, study.editWord))
  if (study?.comparison === 'wipe' && !sharesEditorialCue(scene, previous, 'featureStudy')) {
    return at('sweep', Math.min(330, scene.durationMs * .16))
  }

  if (scene.source.kind === 'report' && ['scores', 'category-score'].includes(scene.focus) &&
      (previous?.source.kind !== 'report' || previous.source.categoryId !== scene.source.categoryId)) return at('ratchet', 100)

  const presentation = scene.presentation
  if (presentation && !sharesEditorialCue(scene, previous)) {
    const { clock, events } = editorialCueTiming(composition.scenes, scene, 0)
    const event = events[0]
    const cursor = ['cursor-tour', 'feature-tray', 'feature-aperture', 'paired-detail', 'tile-expand'].includes(presentation.kind)
    if (cursor && (event || presentation.kind === 'tile-expand')) {
      const click = editorialCursorTiming(event?.atMs ?? 1800, presentation.variant, presentation.interaction)
      if (click.clickAtMs < clock.duration) return { sound: 'click', timeMs: scene.startMs + click.clickAtMs }
    }
    if (['ink-pan', 'dash-timeline', 'face-window', 'glass-phone', 'tool-sweep', 'reference-flip'].includes(presentation.kind)) {
      const offset = event?.atMs ?? 0
      if (offset < clock.duration) return { sound: 'sweep', timeMs: scene.startMs + offset }
    }
  }
  if (scene.sculpture && scene.sculpture.showGuides) {
    const clock = sculptureSceneClock(composition.scenes, scene, 0)
    if (clock.startIndex === index) {
      const sculpture = sculptureWithRecordedGuides(composition.scenes, index, clock.duration)
      const { clickAt } = sculptureSample(sculpture, 0, clock.duration)
      const { clickAtMs } = editorialCursorTiming(clickAt, scene.sculpture.variant, 'click')
      if (clickAtMs < clock.duration) return { sound: 'tap', timeMs: scene.startMs + clickAtMs }
    }
  }
  if (!previous || (previous.scriptRange?.cueId ?? previous.cueId) === (scene.scriptRange?.cueId ?? scene.cueId)) return
  const transition = scene.tracks.find(track => track.target === 'content' &&
    ['wipe-left', 'wipe-right', 'wipe-up', 'screen-push', 'card-reveal'].includes(track.primitive))
  if (transition) return at('sweep', transition.startMs)
  if (scene.documentary && scene.documentary.kind !== previous.documentary?.kind &&
      ['contact', 'media', 'registration'].includes(scene.documentary.kind)) return at('tap', 90)
  if (scene.source.imageId && previous.source.imageId !== scene.source.imageId) {
    return at(composition.recipe === 'measurement-explainer' ? 'click' : 'sweep')
  }
}

export function suggestVideoSounds(composition: VideoComposition): SoundCue[] {
  const candidates = composition.scenes.flatMap((scene, index) => sceneSound(composition, scene, index) ?? [])
  const cues: SoundCue[] = []
  for (const cue of candidates.sort((a, b) => a.timeMs - b.timeMs)) {
    if (cue.timeMs < composition.durationMs - 150 && cue.timeMs - (cues.at(-1)?.timeMs ?? -Infinity) >= 1800) cues.push(cue)
  }
  return cues
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
