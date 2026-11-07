import { drawMetricTimeline, metricTimelineVariant } from './video-timeline'
import { videoContent, scorePresentation, smoothMotion } from './video-layout'
import { scriptTokens, sceneSpeechWords } from './video-script'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { VideoRecipe, VideoScene } from './video-composition'

const scoreEntrance = { duration: 380, rise: 28, textDelay: 65, textDuration: 235, meterDelay: 120, meterDuration: 620 } as const

const numbers: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }
const names: Record<string, RegExp> = { overall:/^overall$/, eyes:/^eyes?$/, brows:/^(?:brows?|eyebrows?)$/, jaw:/^(?:jaw|jawline|chin)$/, mouth:/^(?:mouth|lips?)$/, cheeks:/^(?:cheeks?|cheekbones?)$/, symmetry:/^symmetry$/, nose:/^nose$/ }

// Only show numbers actually spoken and supported by the saved photo assessment.
export function spokenScoreCallouts(text: string, reports: ReportCategory[], fallback: string): VideoScene['scoreCallouts'] {
  const tokens = scriptTokens(text).map(token => token.text.toLowerCase())
  const result: NonNullable<VideoScene['scoreCallouts']> = []
  for (const [word, token] of tokens.entries()) {
    if (tokens[word - 1] === 'point') continue
    let value = numbers[token] ?? (/^\d+(?:\.\d+)?$/.test(token) ? Number(token) : NaN)
    const decimal = tokens[word + 1] === 'point' ? numbers[tokens[word + 2]] : undefined
    if (decimal !== undefined) value += decimal / 10
    if (!Number.isFinite(value) || value > 10) continue
    const before = tokens.slice(Math.max(0, word - 9), word).join(' ')
    const context = tokens.slice(Math.max(0, word - 9), word + 5).join(' ')
    if (!/\b(score|scores|scoring|gets?|overall|another|at|in|is|gives|report)\b/.test(context) && !/^out of (?:ten|10)\b/.test(tokens.slice(word + 1, word + 5).join(' '))) continue
    if (/\bpsl\b/.test(before) || tokens[word - 1] === 'of') continue
    if (decimal === undefined && /^(?:points?|years?|categories|things)$/.test(tokens[word + 1] ?? '')) continue
    const mentions = reports.flatMap(report => {
      const pattern = names[report.id]
      if (!pattern) return []
      let index = -1
      for (let i = Math.max(0, word - 9); i <= Math.min(tokens.length - 1, word + 2); i++) if (pattern.test(tokens[i])) index = i
      return index < 0 ? [] : [{ report, distance: Math.abs(word - index) }]
    }).sort((a, b) => a.distance - b.distance)
    const shared = /\b(?:each|both)\b/.test(before)
    const matched = shared ? mentions.map(item => item.report) : [mentions[0]?.report ?? reports.find(report => report.id === fallback)]
    for (const report of matched) {
      if (!report || report.score !== value) continue
      result.push({ label: report.title, value, word: decimal === undefined ? word : word + 2 })
    }
  }
  return result.length ? result.slice(0, 6) : undefined
}

export function activeSpokenScores(scene: VideoScene, localMs: number) {
  const cues = scene.scoreCallouts
  if (!cues?.length) return []
  const words = sceneSpeechWords(scene)
  const last = cues.findLast(cue => localMs >= (words[cue.word]?.startMs ?? Infinity))
  return last ? cues.filter(cue => cue.word === last.word) : []
}
export function activeSpokenScore(scene: VideoScene, localMs: number) {
  return activeSpokenScores(scene, localMs).at(-1)
}


export function drawSpokenScore(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, reduced: boolean, recipe: VideoRecipe, variation: number) {
  if (scene.source.kind !== 'portrait') return
  const active = activeSpokenScores(scene, localMs)
  const cue = active.at(-1)
  if (!cue) return
  const start = sceneSpeechWords(scene)[cue.word].startMs
  const elapsed = localMs - start
  const { duration, rise, textDelay, textDuration, meterDelay, meterDuration } = scoreEntrance
  const enter = reduced ? 1 : 1 - (1 - Math.min(1, elapsed / duration)) ** 3
  const text = reduced ? 1 : smoothMotion((elapsed - textDelay) / textDuration)
  const meter = reduced ? 1 : smoothMotion((elapsed - meterDelay) / meterDuration)
  const { top, width, rowHeight } = scorePresentation
  const compact = recipe === 'portrait-audit' || recipe === 'hybrid-story' || active.length > 2
  ctx.save()
  ctx.globalAlpha *= enter
  ctx.translate(videoContent.inset, top - Math.max(0, active.length - 3) * 58 + (1 - enter) * rise)
  ctx.fillStyle = '#fffffff0'
  ctx.beginPath()
  ctx.roundRect(0, 0, width, compact ? 28 + active.length * 58 : 38 + active.length * rowHeight, 24)
  ctx.fill()
  for (const [index, item] of active.entries()) {
    ctx.save()
    ctx.translate(25, 16 + index * (compact ? 58 : rowHeight))
    const innerWidth = width - 50
    ctx.globalAlpha *= text
    ctx.fillStyle = '#48515b'
    ctx.font = recipe === 'measurement-explainer' ? '500 31px monospace' : '500 34px "Mogging Share", Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(item.label, 0, 39, innerWidth - 182)
    ctx.fillStyle = '#12171d'
    ctx.font = '500 42px "Mogging Share", Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${item.value.toFixed(1)} / 10`, innerWidth, 39)
    if (!compact) {
      ctx.translate(0, 41)
      const variant = recipe === 'measurement-explainer' ? 0 : metricTimelineVariant(item.label, item.label, variation)
      drawMetricTimeline(ctx, { width: innerWidth, height: 57, position: item.value / 10, progress: meter, variant, ink: '#12171d', muted: '#75808a', line: '#dde2e6', accent: '#a76a22', labels: false })
    }
    ctx.restore()
  }
  ctx.restore()
}
