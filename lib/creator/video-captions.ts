import type { VideoScene } from './video-composition'
import { captionWordCues } from './video-voiceover'
import { sampleAppearance } from './motion-presets'

import { captionDesign } from './video-layout'
export { captionDesign } from './video-layout'

export function captionLines(scene: VideoScene, measure: (text: string) => number) {
  const lines: ReturnType<typeof captionWordCues>[] = []
  for (const cue of captionWordCues(scene, scene.text)) {
    const line = lines.at(-1)
    if (!line || measure([...line.map(word => word.text), cue.text].join(' ')) > captionDesign.width) lines.push([cue])
    else line.push(cue)
  }
  return lines
}

export type CaptionHandoff = { previous: VideoScene; progress: number }

// Accumulate each line's movement so a fast next cue cannot snap an unfinished roll.
export function captionScroll(lines: ReturnType<typeof captionLines>, time: number, reduced = false) {
  return lines.slice(2).reduce((scroll, line) => {
    const elapsed = time - line[0].startMs
    return scroll + (elapsed < 0 ? 0 : sampleAppearance('text-slide', elapsed / captionDesign.focusMs, reduced).opacity)
  }, 0)
}

export function captionStyle(scene: VideoScene) {
  const report = ['report', 'screen'].includes(scene.source.kind)
  const imageCaption = report || scene.source.kind === 'portrait' && scene.source.overlay === 'face-map' || scene.graphic?.layout === 'story'
  const size = report ? 68 : imageCaption ? 72 : scene.source.kind === 'explainer' ? 76 : 68
  return { report, imageCaption, size, height: size * captionDesign.lineHeight * (scene.source.kind === 'explainer' ? 4 : 2) }
}

export function drawLyricsCaption(ctx: CanvasRenderingContext2D, scene: VideoScene, time: number, reduced: boolean, ink: string, handoff?: CaptionHandoff) {
  if (!reduced && handoff && handoff.previous.text !== scene.text) {
    const amount = Math.max(0, Math.min(1, handoff.progress))
    const distance = Math.max(captionStyle(scene).height, captionStyle(handoff.previous).height)
    if (amount < 1) drawCaption(ctx, handoff.previous, handoff.previous.durationMs - 1, false, ink, -distance * amount, true)
    if (amount > 0) drawCaption(ctx, scene, time, false, ink, distance * (1 - amount), true)
  } else drawCaption(ctx, scene, time, reduced, ink)
}

function drawCaption(ctx: CanvasRenderingContext2D, scene: VideoScene, time: number, reduced: boolean, ink: string, offsetY = 0, rolling = false) {
  const { report, imageCaption, size, height } = captionStyle(scene)
  ctx.save(); ctx.font = `${captionDesign.weight} ${size}px "Mogging Share", Arial, sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink
  if (ink === '#fff') {
    const glass = ctx.createLinearGradient(0, 0, 0, size * 2.4)
    glass.addColorStop(0, '#fff'); glass.addColorStop(.5, '#fffffff5'); glass.addColorStop(1, '#ffffffdc')
    ctx.fillStyle = glass; ctx.shadowColor = '#000000a6'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 2
  }
  const lines = captionLines(scene, text => ctx.measureText(text).width)
  const active = Math.max(0, lines.findLastIndex(line => time >= line[0].startMs))
  const focus = sampleAppearance('text-scale', Math.max(0, time - (lines[active]?.[0].startMs ?? 0)) / captionDesign.focusMs, reduced).opacity
  const scroll = captionScroll(lines, time, reduced)
  const entrance = sampleAppearance('text-slide', time / captionDesign.focusMs, reduced)
  ctx.beginPath(); ctx.rect(captionDesign.inset - 8, 0, captionDesign.width + 16, height); ctx.clip(); ctx.beginPath()
  ctx.translate(0, offsetY)
  lines.forEach((line, index) => {
    const focused = active === index, previous = active - 1 === index
    const baseline = size + (index - scroll) * size * captionDesign.lineHeight
    const attention = focused ? focus : previous ? 1 - focus : 0
    let offset = captionDesign.inset
    for (const word of line) {
      const width = ctx.measureText(word.text).width
      const fill = reduced ? 1 : Math.max(0, Math.min(1, (time - word.startMs) / Math.max(1, word.endMs - word.startMs)))
      const inactiveOpacity = report ? .82 : imageCaption || ink === '#fff' ? .72 : captionDesign.inactiveOpacity
      ctx.save(); ctx.globalAlpha *= reduced ? 1 : inactiveOpacity + (1 - inactiveOpacity) * attention
      ctx.translate(0, (reduced || rolling ? 0 : entrance.y / 100 * size) - (reduced ? 0 : 3 * attention))
      ctx.filter = reduced ? 'none' : `blur(${captionDesign.inactiveBlur * (1 - attention)}px)`
      ctx.save(); ctx.globalAlpha *= reduced ? 1 : report ? .68 : imageCaption ? .72 : ink === '#fff' ? .62 : .32; ctx.fillText(word.text, offset, baseline); ctx.restore()
      if (fill > 0) {
        ctx.beginPath(); ctx.rect(offset - 1, baseline - size, (width + 2) * fill, size * 1.3); ctx.clip(); ctx.beginPath()
        ctx.fillText(word.text, offset, baseline)
      }
      ctx.restore(); offset += ctx.measureText(`${word.text} `).width
    }
  })
  ctx.restore()
}
