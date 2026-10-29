import { asksForViews, isGeneralVideoPerformanceQuestion } from './performance'
import type { CreatorConversionMetrics, CreatorConversionReport, CreatorConversionVideo } from '../conversion-report'
import { supportAnalyticsWindow } from './analytics'

export type ConversionPeriod = 'this-week' | 'last-week' | 'this-month' | 'rolling'
export type VideoAnalyticsQuery = { period?: ConversionPeriod; days?: number; submissionId?: string; search?: string; postedInPeriod?: boolean }
export type ConversionWindow = { start: string; end: string; label: string; days: number; timeZone: 'UTC' }
export type SupportVideoAnalytics = {
  window: ConversionWindow
  daily: CreatorConversionReport['daily']; totals: CreatorConversionMetrics; unassigned: CreatorConversionMetrics
  videos: CreatorConversionVideo[]; totalVideos: number; selection: 'all' | 'video' | 'posted' | 'missing'
  unknownPostDates: number
  conversionsPer100Presses: number | null
}
const zero = (): CreatorConversionMetrics => ({ linkPresses: 0, downloads: 0, conversions: 0, revenueCents: 0 })
const add = (a: CreatorConversionMetrics, b: CreatorConversionMetrics) => ({ linkPresses: a.linkPresses + b.linkPresses, downloads: a.downloads + b.downloads, conversions: a.conversions + b.conversions, revenueCents: a.revenueCents + b.revenueCents })
export function conversionWindow(query: VideoAnalyticsQuery, now = new Date()): ConversionWindow {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(today.getTime() + 86400000)
  const start = new Date(today)
  let label = 'Last 30 days'
  if (query.period === 'this-week' || query.period === 'last-week') {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
    label = 'This week'
    if (query.period === 'last-week') { end.setTime(start.getTime()); start.setUTCDate(start.getUTCDate() - 7); label = 'Last week' }
  } else if (query.period === 'this-month') { start.setUTCDate(1); label = 'This month' }
  else { const days = [7,14,30,90].includes(query.days ?? 30) ? query.days ?? 30 : 30; start.setUTCDate(start.getUTCDate() - days + 1); label = `Last ${days} days` }
  return { start: start.toISOString(), end: end.toISOString(), label, days: Math.round((end.getTime() - start.getTime()) / 86400000), timeZone: 'UTC' }
}
export function isConversionQuestion(message: string) {
  // Policy explanations may mention view thresholds without asking for account analytics.
  if (/\b(?:milestones?|requirements?|rules?|eligib\w*|qualif\w*)\b/i.test(message) && !isGeneralVideoPerformanceQuestion(message)) return false
  return isGeneralVideoPerformanceQuestion(message) || (asksForViews(message) && /\b(?:my|this|that|video|videos|post|posts|chart|graph)\b/i.test(message)) || /\b(convert(?:ed|ing|s)?|conversions?|analytics|downloads?|link (?:clicks|presses)|revenue|performance)\b/i.test(message)
    && !/^(?:what (?:is|are|does)|define|explain (?:the )?(?:meaning|definition))\b/i.test(message)
}
export function conversionQuery(message: string): VideoAnalyticsQuery {
  const period: ConversionPeriod = /this week/i.test(message) ? 'this-week' : /last week/i.test(message) && !/last 7 days/i.test(message) ? 'last-week' : /this month/i.test(message) ? 'this-month' : 'rolling'
  return { period, days: Number(message.match(/\b(7|14|30|90)\s*days?\b/i)?.[1] ?? (/\bweek\b/i.test(message) ? 7 : 30)), submissionId: message.match(/\bfor my submission ([a-zA-Z0-9_-]{1,100})\b/i)?.[1], search: message, postedInPeriod: /\b(?:posted|published|uploaded)\b/i.test(message) && /\b(?:week|month|days)\b/i.test(message) }
}
/** Input report must already be windowed at event time by the attribution service. */
export function supportVideoAnalytics(report: CreatorConversionReport, window: ConversionWindow, query: VideoAnalyticsQuery): SupportVideoAnalytics {
  let videos = report.videos
  let selection: SupportVideoAnalytics['selection'] = 'all'
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const named = query.search ? videos.filter(v => normalize(v.title).length >= 5 && normalize(query.search!).includes(normalize(v.title))) : []
  if (query.submissionId || named.length === 1) { videos = videos.filter(v => query.submissionId ? v.id === query.submissionId : v.id === named[0].id); selection = videos.length ? 'video' : 'missing' }
  if (query.postedInPeriod) { videos = videos.filter(v => v.postedAt && Date.parse(v.postedAt) >= Date.parse(window.start) && Date.parse(v.postedAt) < Date.parse(window.end)); if (selection !== 'missing') selection = 'posted' }
  const scoped = selection !== 'all'
  const inputDaily = scoped ? videos.flatMap(v => v.daily ?? []) : report.daily
  const merged = new Map<string, CreatorConversionReport['daily'][number]>()
  for (const row of inputDaily) { const prior = merged.get(row.day); merged.set(row.day, prior ? { day: row.day, linkPresses: prior.linkPresses + row.linkPresses, downloads: prior.downloads + row.downloads, conversions: prior.conversions + row.conversions, revenue: prior.revenue + row.revenue } : row) }
  const { daily } = supportAnalyticsWindow({ daily: [...merged.values()] }, window.days, new Date(Date.parse(window.end) - 1))
  const rank = (v: CreatorConversionVideo) => /revenue/i.test(query.search ?? '') ? v.revenueCents : /downloads?/i.test(query.search ?? '') ? v.downloads : /link (?:presses|clicks)/i.test(query.search ?? '') ? v.linkPresses : v.conversions
  const totals = scoped ? videos.reduce(add, zero()) : report.totals
  return { window, daily, totals, unassigned: scoped ? zero() : report.unassigned, videos: [...videos].sort((a,b) => rank(b) - rank(a)).slice(0,8), totalVideos: videos.length, selection, unknownPostDates: report.videos.filter(v => !v.postedAt).length, conversionsPer100Presses: totals.linkPresses > 0 ? Math.round(totals.conversions / totals.linkPresses * 10000) / 100 : null }
}
const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format
const money = (cents: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100)
export function videoAnalyticsText(report: SupportVideoAnalytics) {
  if (report.selection === 'missing') return 'I couldn’t find that video in your submissions. Choose one of your own videos so I can show its conversions here.'
  const scope = report.selection === 'video' ? `“${report.videos[0]?.title}”` : report.selection === 'posted' ? 'videos with a recorded posting date in this period' : 'your creator account'
  const summary = `${report.window.label} (UTC), ${scope} recorded ${count(report.totals.linkPresses)} link presses, ${count(report.totals.downloads)} downloads, and ${count(report.totals.conversions)} conversions, with ${money(report.totals.revenueCents)} in attributed revenue.`
  const leaders = report.videos.slice(0,3).map(v => `“${v.title}”: ${count(v.conversions)} conversions (${count(v.direct.conversions)} direct, ${count(v.estimated.conversions)} estimated), ${money(v.revenueCents)} attributed revenue.`).join('\n\n')
  const rate = report.conversionsPer100Presses === null ? 'No link presses were recorded, so a conversion-per-press ratio cannot be calculated.' : `That is ${report.conversionsPer100Presses} conversions per 100 link presses in this period. This is an activity ratio, not a same-visitor conversion rate; some purchases can follow earlier clicks.`
  const unassigned = report.selection === 'all' && report.unassigned.conversions > 0 ? `${count(report.unassigned.conversions)} conversions could not be assigned to a video and remain separate.` : ''
  return [summary, leaders || (report.selection === 'posted' ? 'There are no videos with recorded posting dates in this period.' : 'No submitted videos were found for this account.'), rate, unassigned, 'Attributed revenue is not your creator earnings. Shared-link attribution is estimated; this data alone does not explain why a viewer purchased.'].filter(Boolean).join('\n\n')
}
export function videoAnalyticsSummary(report: SupportVideoAnalytics) {
  const format = (m: CreatorConversionMetrics) => ({ linkPresses:m.linkPresses,downloads:m.downloads,conversions:m.conversions,attributedRevenueUSD:money(m.revenueCents) })
  return { window: {label:report.window.label,startDay:report.window.start.slice(0,10),endDay:new Date(Date.parse(report.window.end)-1).toISOString().slice(0,10),days:report.window.days,timeZone:'UTC'}, selection: report.selection, totals: format(report.totals), unassigned: format(report.unassigned), periodConversionsPer100Presses: report.conversionsPer100Presses, totalVideos: report.totalVideos, unknownPostDates: report.unknownPostDates, videos: report.videos.map(v => ({id:v.id,title:v.title,platform:v.platform,postedAt:v.postedAt,submittedAt:v.submittedAt,...format(v),direct:format(v.direct),estimated:format(v.estimated)})), guidance: 'The selected chart is shown in chat; do not refer to additional ranked video cards. Answer using these figures; never send the creator away to a dashboard to get this answer. Explain the leading video and direct versus estimated conversions. When multiple videos match "my video", show the useful breakdown then ask which title to explore. A period activity ratio is NOT a percentage of clicks that converted, cohort conversion rate, or views-to-purchase rate. Never say strong, weak, good, bad, impressive, or significant performance: no benchmark was retrieved. Use supplied USD dollar strings, never cents. Display the inclusive startDay/endDay dates. Revenue is not creator earnings. Estimated conversions are shared-link allocations, not proof that a video influenced a specific person. Only known postedAt timestamps qualify as posted this week; missing dates are not inferred from submission dates.' }
}
/** Guard against unsupported benchmark/cohort claims in a numerical answer. */
export function groundedAnalyticsAnswer(text: string, report: SupportVideoAnalytics) {
  const prose = text.replace(/[“"][^”"]+[”"]/g,'')
  const unsupported = /\bcents\b|\b(?:performed|converted|converting)\s+(?:well|poorly|badly)\b|\bstrong(?:ly)?\b|\b(?:good|bad|weak|excellent|impressive|healthy|poor|solid|significant)\s+(?:performance|attribution|conversion|results?)|(?:converted|conversion rate)\b[^.!?\n]{0,45}\d[\d.]*%|\d[\d.]*%\s+of\s+(?:your\s+)?(?:link presses|clicks|visitors)|likely influenced|couldn.t be tied to a specific press/i
  return unsupported.test(prose) ? videoAnalyticsText(report) : text
}
