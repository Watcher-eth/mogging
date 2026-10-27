import type { SupportArtifact } from './contracts'

export function timeChartKind(points: number, question = ''): 'summary' | 'bar' | 'line' {
  if (points < 2) return 'summary'
  if (/\b(?:trend|over time|trajectory)\b/i.test(question)) return 'line'
  return points <= 7 ? 'bar' : 'line'
}
export function requestedChartMetric(question: string): 'conversions' | 'revenue' | 'downloads' | 'linkPresses' {
  return /revenue|sales value/i.test(question) ? 'revenue' : /downloads?/i.test(question) ? 'downloads' : /link (?:presses|clicks)/i.test(question) ? 'linkPresses' : 'conversions'
}
/** Reading data never grants unlimited space in the response. */
export function selectSupportArtifacts(question: string, artifacts: SupportArtifact[]): SupportArtifact[] {
  const views = /\bviews?\b/i.test(question)
  const comparison = /\b(?:compare|comparison|rank|top|best|leading|which videos?)\b/i.test(question)
  const ranked = artifacts.map((artifact, index) => ({ artifact, index, score:
    artifact.type === 'submission-views' ? views ? 120 : 0 :
    artifact.type === 'video-analytics' || artifact.type === 'analytics' ? views && !/convert|revenue|download/i.test(question) ? 20 : 110 :
    artifact.type === 'submissions' ? 90 : 80,
  })).filter(item => item.score > 0).sort((a,b) => b.score-a.score || a.index-b.index)
  const selected = new Set<number>()
  const seen = new Set<string>()
  let count = 0
  let links = 0
  for (const { artifact, index } of ranked) {
    const navigation = artifact.type === 'action' && artifact.destination !== 'video' && artifact.destination !== 'rules'
    const key = artifact.type === 'action' ? `action:${artifact.destination}` : artifact.type
    if (seen.has(key)) continue
    if (!navigation && count >= 2 || navigation && links >= 2) continue
    selected.add(index); seen.add(key)
    if (!navigation) count++
    else links++
  }
  return artifacts.flatMap<SupportArtifact>((artifact,index) => {
    if (!selected.has(index)) return []
    if (artifact.type === 'video-analytics') return [{ ...artifact, metric: requestedChartMetric(question), presentation: comparison && artifact.report.selection !== 'video' ? 'comparison' as const : 'timeline' as const, chartKind: timeChartKind(artifact.report.daily.length, question) }]
    if (artifact.type === 'analytics') return [{ ...artifact, metric: requestedChartMetric(question), chartKind: timeChartKind(artifact.report.daily.length, question) }]
    return [artifact]
  })
}
