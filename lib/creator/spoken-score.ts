import { drawMetricTimeline } from './video-timeline'
import { videoSize, videoContent, scorePresentation, smoothMotion } from './video-layout'
import { scriptTokens, sceneSpeechWords } from './video-script'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { VideoScene } from './video-composition'

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
  const words = sceneSpeechWords(scene)
  const last = scene.scoreCallouts?.findLast(cue => localMs >= (words[cue.word]?.startMs ?? Infinity))
  return last ? scene.scoreCallouts!.filter(cue => cue.word === last.word) : []
}
export function activeSpokenScore(scene: VideoScene, localMs: number) {
  return activeSpokenScores(scene, localMs).at(-1)
}


export function drawSpokenScore(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, reduced: boolean, theme: 'light' | 'dark' = 'light') {
  const dark = theme === 'dark';
  const fill = dark ? '#0c1416' : '#ffffff', ink = dark ? '#e9efeb' : '#12171d';
  if (scene.source.kind !== "portrait")
    return;
  const active = activeSpokenScores(scene, localMs);
  const cue = active.at(-1);
  if (!cue)
    return;
  const start = sceneSpeechWords(scene)[cue.word].startMs;
  const amount = reduced ? 1 : smoothMotion((localMs - start) / 360);
  const meter = reduced ? 1 : smoothMotion((localMs - start - 80) / 720);
  const width = videoContent.width, left = videoContent.inset, top = scorePresentation.top;
  ctx.save();
  ctx.globalAlpha *= amount;
  const y = top + (1 - amount) * 12;
  const wash = ctx.createLinearGradient(0, y - 280, 0, y - 40);
  wash.addColorStop(0, fill + "00");
  wash.addColorStop(1, fill);
  ctx.fillStyle = wash;
  ctx.fillRect(0, y - 280, videoSize.width, videoSize.height - y + 280);
  ctx.translate(left, y);
  ctx.scale(scorePresentation.scale, scorePresentation.scale);
  for (const [index, item] of active.entries()) {
    ctx.save();
    ctx.translate(0, index * 190);
    ctx.fillStyle = dark ? "#a6b3ae" : "#535b64";
    ctx.font = "500 48px monospace";
    ctx.textAlign = "left";
    ctx.fillText(item.label.toUpperCase(), 0, 42);
    ctx.fillStyle = ink;
    ctx.font = '500 68px "Mogging Share",Arial,sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`${item.value.toFixed(1)} / 10`, width, 48);
    ctx.translate(0, 74);
    drawMetricTimeline(ctx, { width, height: active.length > 1 ? 100 : 200, position: item.value / 10, progress: meter, variant: 0, ink, muted: dark ? "#b5c3bc" : "#777", line: dark ? "#536461" : "#ddd", accent: dark ? "#e9bc7e" : "#ff9900", labels: true, maximum: 10 });
    ctx.restore();
  }
  ctx.restore();
}
