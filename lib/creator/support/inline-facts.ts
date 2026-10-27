/** Presentation only: never changes, calculates, or certifies the answer's facts. */
export type InlineFactKind = 'views' | 'downloads' | 'conversions' | 'revenue' | 'money' | 'bonus' | 'audience' | 'percentage' | 'clicks' | 'referrals' | 'submissions' | 'review' | 'approved' | 'paid' | 'rejected' | 'checks'
export type InlineFactPart = { text: string; kind?: InlineFactKind }

const metrics: Array<{ kind: InlineFactKind; words: string }> = [
  { kind: 'views', words: 'views?|impressions?' },
  { kind: 'downloads', words: 'downloads?|installs?' },
  { kind: 'conversions', words: 'conversions?|subscriptions?|purchases?' },
  { kind: 'clicks', words: 'link presses|link clicks|clicks?' },
  { kind: 'referrals', words: 'referrals?|invites?|invitations?|invited creators' },
  { kind: 'review', words: 'pending|in review|awaiting review|under review' },
  { kind: 'approved', words: 'approved|approvals?' },
  { kind: 'paid', words: 'paid|payments?' },
  { kind: 'rejected', words: 'rejected|rejections?' },
  { kind: 'bonus', words: 'bonuses|bonus|rewards?' },
  { kind: 'submissions', words: 'submissions?|posts?|videos?' },
  { kind: 'checks', words: 'checks?|requirements?|milestones?' },
]
const classifiers = metrics.map(({ kind, words }) => ({
  kind,
  after: new RegExp(`^\\s+(?:(?:verified|submitted|public|total|new|recorded|saved|content)\\s+)?(?:${words})\\b`, 'i'),
  before: new RegExp(`\\b(?:${words})\\s*(?:(?:of|is|are|was|were|at|:|=|—)\\s*)?$`, 'i'),
}))

export function inlineFactParts(text: string): InlineFactPart[] {
  const parts: InlineFactPart[] = []
  // Currency, grouped/decimal numbers, compact counts, and percentages. No markup.
  const numbers = /(?:\b(?:US\$|USD|EUR|GBP)\s*|[$€£])\d+(?:,\d{3})*(?:\.\d+)?|(?<![\w/])\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?(?:\s?%|\b)/g
  let cursor = 0
  for (const match of text.matchAll(numbers)) {
    const start = match.index
    const value = match[0]
    const before = text.slice(Math.max(0, start - 70), start)
    const after = text.slice(start + value.length, start + value.length + 75)
    let kind: InlineFactKind | undefined
    if (/^(?:US\$|USD|EUR|GBP|[$€£])/i.test(value)) {
      kind = /\bbonus(?:es)?\s*(?:of|is|was|:)?\s*$/i.test(before) || /^\s+(?:(?:recorded|creator)\s+)?bonus\b/i.test(after) ? 'bonus'
        : /\brevenue\s*(?:of|is|was|:)?\s*$/i.test(before) || /^\s+(?:(?:in|of|attributed|total)\s+){0,2}revenue\b/i.test(after) ? 'revenue' : 'money'
    } else if (/%$/.test(value)) {
      kind = /audience|tier|locations?|countries|country/i.test(before + after) ? 'audience' : 'percentage'
    } else if (!/\bTier\s*$/i.test(before) && !/[-/]$/.test(before) && !/^[-/]/.test(after)) {
      // Prefer an adjacent unit. Never infer a metric from the paragraph's topic:
      // dates, durations, list numbers, and IDs must remain ordinary text.
      kind = classifiers.find(item => item.after.test(after))?.kind
        ?? classifiers.find(item => item.before.test(before))?.kind
      if (!kind && /^\s+of\s+\d+\s+(?:saved\s+)?(?:checks|requirements)\b/i.test(after)) kind = 'checks'
    }
    if (!kind) continue
    if (cursor < start) parts.push({ text: text.slice(cursor, start) })
    parts.push({ text: value, kind })
    cursor = start + value.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}

const metricPhrases: Array<{ kind: InlineFactKind; words: string; priority: number }> = [
  {kind:'revenue',words:'(?:attributed |tracked |direct |estimated )?revenue',priority:0},
  {kind:'conversions',words:'(?:(?:direct|estimated|total) )?(?:conversions?|subscriptions?|purchases?)',priority:1},
  {kind:'money',words:'(?:(?:recorded|approved|paid|scheduled|content) )?(?:content earnings|earnings|payout|amount|payment)',priority:2},
  {kind:'bonus',words:'(?:creator |recorded |paid )?(?:bonus|bonuses|rewards?)',priority:3},
  {kind:'views',words:'(?:(?:verified|submitted|public|total) )?(?:views?|impressions?)',priority:4},
  {kind:'audience',words:'(?:verified |submitted )?(?:Tier 1 audience|audience)',priority:5},
  ...metrics.filter(m=>!['views','conversions','bonus'].includes(m.kind)).map(m=>({...m,priority:6})),
]
/** Highlight complete value/metric phrases, at most twice per paragraph. */
export function highlightedFactParts(text: string, limit = 2): InlineFactPart[] {
  const candidates: Array<{start:number;end:number;kind:InlineFactKind;priority:number}> = []
  let offset=0
  for(const part of inlineFactParts(text)) {
    const start=offset;offset+=part.text.length
    if(!part.kind) continue
    const before=text.slice(0,start), after=text.slice(offset)
    for(const metric of metricPhrases) {
      const suffix=after.match(new RegExp(`^\\s+(?:(?:in|of)\\s+)?(?:${metric.words})\\b`,'i'))
      const prefix=before.match(new RegExp(`\\b(?:${metric.words})(?:\\s+(?:of|is|was|were|are|at))?\\s*:?\\s*$`,'i'))
      if(suffix) {candidates.push({start,end:offset+suffix[0].length,kind:metric.kind,priority:metric.priority});break}
      if(prefix) {candidates.push({start:start-prefix[0].length,end:offset,kind:metric.kind,priority:metric.priority});break}
    }
  }
  const selected:typeof candidates=[]
  for(const candidate of candidates.sort((a,b)=>a.priority-b.priority || a.start-b.start)) {
    if(selected.length>=Math.min(2,Math.max(0,limit))) break
    if(selected.some(s=>s.kind===candidate.kind || (s.start<candidate.end && candidate.start<s.end))) continue
    selected.push(candidate)
  }
  const result:InlineFactPart[]=[];let cursor=0
  for(const part of selected.sort((a,b)=>a.start-b.start)) {
    if(cursor<part.start) result.push({text:text.slice(cursor,part.start)})
    result.push({text:text.slice(part.start,part.end),kind:part.kind});cursor=part.end
  }
  if(cursor<text.length) result.push({text:text.slice(cursor)})
  return result
}
