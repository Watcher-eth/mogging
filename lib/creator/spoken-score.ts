import { scriptTokens } from './video-script'
import { sceneSpeechWords } from './video-voiceover'
import { drawMetricTimeline } from './video-timeline'
import { videoSize, videoContent, smoothMotion } from './video-layout'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { VideoScene } from './video-composition'

const numbers: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }
const names: Record<string, RegExp> = { overall:/^overall$/, eyes:/^eyes?$/, brows:/^(?:brows?|eyebrows?)$/, jaw:/^(?:jaw|jawline|chin)$/, mouth:/^(?:mouth|lips?)$/, cheeks:/^(?:cheeks?|cheekbones?)$/, symmetry:/^symmetry$/, nose:/^nose$/ }

// Only show numbers actually spoken and supported by the saved photo assessment.
export function spokenScoreCallouts(text: string, reports: ReportCategory[], fallback: string): VideoScene['scoreCallouts'] {
  const tokens = scriptTokens(text).map(token => token.text.toLowerCase())
  const result: NonNullable<VideoScene['scoreCallouts']> = []
  for (const [word, token] of tokens.entries()) {
    const value = numbers[token] ?? (/^\d+(?:\.\d+)?$/.test(token) ? Number(token) : NaN)
    if (!Number.isFinite(value) || value > 10) continue
    const before = tokens.slice(Math.max(0, word - 9), word).join(' ')
    const context = tokens.slice(Math.max(0, word - 9), word + 5).join(' ')
    if (!/\b(score|scores|scoring|gets?|overall|another|at|in|is|gives|report)\b/.test(context)) continue
    if (/\bpsl\b/.test(before)) continue
    if (/\b(points?|years?|categories|things)\b/.test(tokens[word + 1] ?? '') || tokens[word - 1] === 'of') continue
    const mentions = reports.flatMap(report => {
      const pattern = names[report.id]
      if (!pattern) return []
      let index = -1
      for (let i = Math.max(0, word - 9); i <= Math.min(tokens.length - 1, word + 2); i++) if (pattern.test(tokens[i])) index = i
      return index < 0 ? [] : [{ report, distance: Math.abs(word - index) }]
    }).sort((a, b) => a.distance - b.distance)
    const report = mentions[0]?.report ?? reports.find(report => report.id === fallback)
    if (!report || report.score !== value) continue
    result.push({ label: report.title, value, word })
  }
  return result.length ? result.slice(0, 6) : undefined
}

export function activeSpokenScore(scene: VideoScene, localMs: number) {
  const words = sceneSpeechWords(scene)
  return scene.scoreCallouts?.findLast(cue => localMs >= (words[cue.word]?.startMs ?? Infinity))
}

export function drawSpokenScore(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, reduced: boolean) {
  if (scene.source.kind !== 'portrait') return
  const cue = activeSpokenScore(scene, localMs)
  if (!cue) return
  const start = sceneSpeechWords(scene)[cue.word].startMs
  const amount = reduced ? 1 : smoothMotion((localMs - start) / 360)
  const meter = reduced ? 1 : smoothMotion((localMs - start - 80) / 720)
  const width = videoContent.width, left = videoContent.inset, top = videoSize.height - 470
  ctx.save(); ctx.globalAlpha *= amount; ctx.translate(left, top + (1 - amount) * 12)
  const wash = ctx.createLinearGradient(0, -80, 0, videoSize.height - top)
  wash.addColorStop(0, '#ffffff00'); wash.addColorStop(.25, '#ffffffed'); wash.addColorStop(1, '#ffffff')
  ctx.fillStyle = wash; ctx.fillRect(-left, -80, videoSize.width, videoSize.height - top + 80)
  ctx.fillStyle = '#747b83'; ctx.font = '400 28px monospace'; ctx.textAlign = 'left'; ctx.fillText(cue.label.toUpperCase(), 0, 42)
  ctx.fillStyle = '#12171d'; ctx.font = '500 68px "Mogging Share",Arial,sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${cue.value.toFixed(1)} / 10`, width, 48)
  ctx.translate(0, 74)
  drawMetricTimeline(ctx, { width, height: 200, position: cue.value / 10, progress: meter, variant: 0, ink:'#12171d', muted:'#777', line:'#ddd', accent:'#ff9900', labels:true, maximum:10 })
  ctx.restore()
}
