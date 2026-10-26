import type { AnalysisPostPlan, AnalysisPostScene } from './analysis-post'

export function scriptToPlan(script: string, wordsPerMinute = 165): AnalysisPostPlan {
  const text = script.trim()
  if (!text || text.length > 12000) throw new Error('Enter a script between 1 and 12,000 characters')
  const sentences = text.split(/\n+|(?<=[.!?])\s+/).map(line => line.trim()).filter(Boolean)
  let cursor = 0
  const scenes: AnalysisPostScene[] = sentences.map((narration, index) => {
    const duration = Math.max(1.7, narration.split(/\s+/).length / Math.max(100, Math.min(230, wordsPerMinute)) * 60 + .18)
    const start = cursor; cursor += duration
    const closing = index === sentences.length - 1 && /link in|profile|mogging\.com|with Mogging|get your|complete report|download|try the app|find your|build your plan/i.test(narration)
    return { id: `script-${index}`, start, end: cursor, label: closing ? 'Closing' : `Script ${index + 1}`, purpose: 'Follow the spoken subject with a matching app view.', visual: 'Script-directed app sequence', onScreen: shortHeading(narration), narration, pace: 'fast' }
  })
  if (cursor > 180) throw new Error('Keep the script under three minutes or increase the reading pace')
  return { title: 'Mogging · Script edit', duration: cursor, formatLabel: 'Custom script', strategy: 'Script-directed report navigation, section emphasis and short editorial shots.', scenes, caption: '' }
}

export type ScriptShot = { narration: string; startMs: number; durationMs: number; beat: AnalysisPostScene; first: boolean; last: boolean }

export function planScriptShots(plan: AnalysisPostPlan, shotLengthMs = 2900): ScriptShot[] {
  const shots: ScriptShot[] = []
  for (const beat of plan.scenes) {
    const words = beat.narration.trim().split(/\s+/).filter(Boolean)
    const beatStart = Math.round(beat.start * 1000), duration = Math.round(beat.end * 1000) - beatStart
    const pieces = Math.max(1, Math.min(words.length || 1, Math.floor(duration / 700), Math.ceil(duration / shotLengthMs)))
    for (let part = 0; part < pieces; part++) {
      const start = beatStart + Math.round(duration * part / pieces)
      const end = beatStart + Math.round(duration * (part + 1) / pieces)
      const narration = words.slice(Math.floor(words.length * part / pieces), Math.floor(words.length * (part + 1) / pieces)).join(' ')
      shots.push({ narration, startMs: start, durationMs: end - start, beat, first: shots.length === 0, last: beat === plan.scenes.at(-1) && part === pieces - 1 })
    }
  }
  return shots
}

export function shortHeading(text: string) {
  return text.replace(/^[\s,;:]+|[.!?,;:]+$/g, '').split(/\s+/).slice(0, 8).join(' ')
}
