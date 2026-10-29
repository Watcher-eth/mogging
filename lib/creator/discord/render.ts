import type { SupportArtifact, SupportResponse } from '../support/contracts'
import { destinations } from '../support/contracts'
import { selectSupportArtifacts, timeChartKind } from '../support/presentation'
import { campaignPhase } from '../support/campaign-lifecycle'
import { sprintMoney, sprintPayoutCents, sprintViews } from '../sprints'
import { portalOrigin } from './config'

export type DiscordReply = { content: string; embeds?: Array<{ title?: string; description?: string; color?: number; url?: string; image?: { url: string }; footer?: { text: string } }>; components?: Array<{ type: 1; components: Array<{ type: 2; style: 5; label: string; url: string }> }>; allowed_mentions: { parse: never[] } }
export type RenderedReply = { payload: DiscordReply; image?: Buffer }
const truncate = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value
export const safeText = (value: string) => value.replace(/[\u202a-\u202e\u2066-\u2069]/g, '').replace(/@/g, '@\u200b').replace(/[\\`*_{}\[\]()~|<>]/g, '\\$&')
const portal = (path: string) => `${portalOrigin()}${path}`
const submissionUrl = (id: string) => portal(`/creator/submissions?submission=${encodeURIComponent(id)}`)
const campaignUrl = (id: string) => portal(`/creator/sprints?id=${encodeURIComponent(id)}`)
const rowLink = (title: string, url: string) => `[${safeText(truncate(title, 70))}](${url})`
const n = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
const money = (value: number) => sprintMoney(value)
const status = (value: string) => value.replace(/_/g, ' ')
type Chart = { title: string; kind: 'bar' | 'line'; rows: Array<{ label: string; value: number }> }

function artifactView(a: SupportArtifact): { title: string; text: string; url?: string; chart?: Chart } | null {
  switch (a.type) {
    case 'action': return null
    case 'submissions': return { title: `Your submissions · ${a.total}`, url: portal('/creator/submissions'), text: a.groups
      ? a.groups.map(g => `**${g.title} · ${g.total}**\n${g.submissions.slice(0, 2).map(s => `${rowLink(s.title, submissionUrl(s.id))} · ${status(s.status)}`).join('\n') || 'No submissions'}`).join('\n\n')
      : a.submissions.slice(0, 6).map(s => `${rowLink(s.title, submissionUrl(s.id))} · ${status(s.status)}`).join('\n') || 'No matching submissions.' }
    case 'submission-detail': {
      const d = a.detail, e = d.earnings
      return { title: truncate(d.submission.title, 100), url: submissionUrl(d.submission.id), text: `${status(d.submission.status)}${e.recordedApprovedCents != null ? ` · ${money(e.recordedApprovedCents)} approved content earnings` : ''}\n${e.verifiedViews != null ? `${sprintViews(e.verifiedViews)} verified views` : 'Views not verified'} · ${e.verifiedAudiencePercent != null ? `${e.verifiedAudiencePercent}% verified Tier 1 audience` : 'Audience not verified'}\n${d.review.note ? safeText(truncate(d.review.note, 500)) : 'No reviewer note recorded.'}${d.context ? `\nTerms: ${safeText(d.context.campaign.name)} · ${d.context.termsSource}` : ''}` }
    }
    case 'campaigns': return { title: 'Your campaigns', url: portal('/creator/sprints'), text: a.campaigns.map(c => `${rowLink(c.name, campaignUrl(c.id))} · ${campaignPhase(c)}\n${c.startsAt.slice(0, 10)} → ${c.endsAt.slice(0, 10)} UTC`).join('\n\n') || 'No accessible campaigns found.' }
    case 'campaign-detail': {
      const c = a.context, terms = c.campaign.terms
      const rules = c.rules.filter(r => !c.focusRuleIds.length || c.focusRuleIds.includes(r.id))
      const milestones = terms.milestones.map(m => `${sprintViews(m.views)} views → ${money(sprintPayoutCents(terms, m.views, c.audiencePercent ?? terms.maximumTier1Percent))}`)
      return { title: truncate(c.campaign.name, 100), url: campaignUrl(c.campaign.id), text: `${c.termsSource}${c.campaign.status === 'ended' || Date.parse(c.campaign.endsAt) <= Date.now() ? ' · Campaign ended' : ''}\n${a.view !== 'rules' ? `${milestones.join('\n')}\nAmounts are total content tiers, using ${c.audiencePercent ?? terms.maximumTier1Percent}% Tier 1 audience.\n` : ''}${a.view !== 'milestones' ? rules.slice(0, 7).map(r => `• ${safeText(r.label)}`).join('\n') : ''}\n${c.focusRuleIds.length ? 'Relevant rules shown; open campaign for every requirement.' : ''}` }
    }
    case 'campaign-examples': return { title: 'Campaign video examples', url: campaignUrl(a.campaign.id), text: `Explore the reference videos for ${safeText(a.campaign.name)} in the campaign page. Examples are inspiration, not an approval guarantee.` }
    case 'cta': return { title: 'Your CTA draft', url: portal('/creator/cta-generator'), text: safeText(a.text) }
    case 'analytics': {
      const metric = a.metric ?? 'conversions', t = a.report.totals
      const label = { conversions: 'Conversions', revenue: 'Attributed revenue', downloads: 'Downloads', linkPresses: 'Link presses' }[metric]
      const kind = a.chartKind ?? timeChartKind(a.report.daily.length)
      return { title: `${label} · Last ${a.days} days`, url: portal('/creator/conversions'), text: `${metric === 'revenue' ? money(t.revenueCents) : n(t[metric])} ${label.toLowerCase()}\n${metric === 'conversions' ? `${money(t.revenueCents)} attributed revenue\n` : ''}Attributed revenue is separate from creator earnings. Dates are UTC.`, chart: kind === 'summary' ? undefined : { title: `${label}${metric === 'revenue' ? ' ($)' : ''}`, kind, rows: a.report.daily.map(d => ({ label: d.day.slice(5), value: d[metric] })) } }
    }
    case 'video-analytics': {
      const r = a.report, metric = a.metric ?? 'conversions'
      const title = { conversions: 'Conversions', revenue: 'Attributed revenue ($)', downloads: 'Downloads', linkPresses: 'Link presses' }[metric]
      const compare = a.presentation === 'comparison', kind = compare ? 'bar' : a.chartKind ?? timeChartKind(r.daily.length)
      const rows = compare ? r.videos.map(v => ({ label: v.title, value: metric === 'revenue' ? v.revenueCents / 100 : v[metric] })) : r.daily.map(d => ({ label: d.day.slice(5), value: d[metric] }))
      const value = (v: typeof r.totals) => metric === 'revenue' ? money(v.revenueCents) : n(v[metric])
      return { title: `${title} · ${r.window.label}`, url: portal('/creator/conversions'), text: `${value(r.totals)} ${title.toLowerCase()}\n${r.videos.slice(0, 3).map(v => `${rowLink(v.title, submissionUrl(v.id))} · ${value(v)}`).join('\n')}\nDirect and estimated attribution may be included. Revenue is separate from creator earnings. UTC.`, chart: kind !== 'summary' && rows.length > 1 ? { title, kind, rows } : undefined }
    }
    case 'submission-views': return { title: 'Recorded video views', url: portal('/creator/submissions'), text: `${a.rows.slice(0, 5).map(r => `${rowLink(r.title, submissionUrl(r.id))} · ${r.views == null ? 'Unrecorded' : `${n(r.views)} ${r.basis} views`}`).join('\n')}\n${safeText(a.scope)}`, chart: a.rows.filter(r => r.views != null).length > 1 ? { title: 'Recorded cumulative views', kind: 'bar', rows: a.rows.filter(r => r.views != null).map(r => ({ label: r.title, value: r.views! })) } : undefined }
    case 'payments': return { title: `Recorded payments · ${a.total}`, url: portal('/creator/money'), text: a.payments.slice(0, 6).map(p => `${p.currency} ${n(p.amountCents / 100)} · ${p.status}${p.paidAt ? ` · ${p.paidAt.slice(0, 10)}` : ''}`).join('\n') || 'No recorded payments.' }
    case 'bonuses': return { title: `Recorded bonuses · ${a.total}`, url: portal('/creator/money'), text: a.payments.slice(0, 6).map(p => `${p.currency} ${n(p.amountCents / 100)} · ${p.status}`).join('\n') || 'No recorded bonuses.' }
    case 'referrals': return { title: 'Your creator referrals', url: portal('/creator/guide?topic=referrals'), text: `${n(a.report.invited)} creators invited\n${money(a.report.earnedCents)} earned · ${money(a.report.paidCents)} paid · ${money(a.report.outstandingCents)} outstanding` }
  }
}
const xml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
async function chartImage(chart: Chart) {
  const rows = chart.kind === 'bar' ? chart.rows.slice(0, 8) : chart.rows
  const maximum = Math.max(0, ...rows.map(r => r.value))
  const minimum = Math.min(0, ...rows.map(r => r.value))
  const span = maximum - minimum || 1
  const height = chart.kind === 'bar' ? 70 + rows.length * 46 : 280
  let body: string
  if (chart.kind === 'bar') {
    const x = (value: number) => 210 + (value - minimum) / span * 410
    const zero = x(0)
    body = `<line x1="${zero}" y1="45" x2="${zero}" y2="${height - 20}" stroke="#e2e8f0"/>`
    body += rows.map((r, i) => `<text x="16" y="${67 + i * 46}" fill="#64748b" font-size="12">${xml(truncate(r.label, 28))}</text>
      <rect x="${Math.min(zero, x(r.value))}" y="${53 + i * 46}" rx="5" width="${Math.abs(x(r.value) - zero)}" height="22" fill="#00a8ef"/>
      <text x="720" y="${69 + i * 46}" text-anchor="end" font-size="12" fill="#334155">${xml(n(r.value))}</text>`).join('')
  } else {
    const x = (index: number) => 35 + index / Math.max(1, rows.length - 1) * 650
    const y = (value: number) => 225 - (value - minimum) / span * 160
    const labels = rows.flatMap((r, i) => i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 5) === 0
      ? [`<text x="${x(i)}" y="250" text-anchor="middle" fill="#64748b" font-size="11">${xml(r.label)}</text>`] : [])
    body = `<line x1="35" y1="${y(0)}" x2="700" y2="${y(0)}" stroke="#e2e8f0"/>
      <polyline fill="none" stroke="#00a8ef" stroke-width="3" points="${rows.map((r, i) => `${x(i)},${y(r.value)}`).join(' ')}"/>
      ${labels.join('')}<text x="15" y="55" font-size="11" fill="#64748b">${xml(n(maximum))}</text>
      ${minimum < 0 ? `<text x="15" y="235" font-size="11" fill="#64748b">${xml(n(minimum))}</text>` : ''}`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="${height}" font-family="Arial,sans-serif"><rect width="740" height="${height}" fill="white"/><text x="16" y="28" font-size="16" fill="#0f172a">${xml(chart.title)}</text>${body}</svg>`
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svg)).png().toBuffer()
}

export async function renderDiscordSupport(result: SupportResponse, question: string): Promise<RenderedReply> {
  const selected = selectSupportArtifacts(question, result.artifacts)
  const views = selected.map(artifactView).filter(v => v !== null).slice(0, 2)
  const links = new Map<string, string>()
  for (const v of views) if (v.url) links.set(v.url, truncate(v.title, 65))
  for (const a of selected) if (a.type === 'action') links.set(portal(destinations[a.destination].href), destinations[a.destination].label)
  const payload: DiscordReply = { content: truncate(safeText(result.text), 1900), allowed_mentions: { parse: [] }, embeds: views.map(v => ({ title: truncate(v.title.replace(/@/g, '@\u200b'), 100), description: truncate(v.text, 1600), color: 0x00a8ef, url: v.url })) }
  if (result.allowance) {
    const footer = { text: `${result.allowance.remaining} of 4 messages left today across Discord and Creator Studio · Resets midnight UTC` }
    if (payload.embeds?.length) payload.embeds[payload.embeds.length - 1].footer = footer
    else payload.embeds = [{ footer }]
  }
  if (links.size) payload.components = [{ type: 1, components: [...links].slice(0, 5).map(([url, label]) => ({ type: 2, style: 5, label, url })) }]
  const chartIndex = views.findIndex(v => v.chart)
  if (chartIndex < 0) return { payload }
  try {
    const image = await chartImage(views[chartIndex].chart!)
    payload.embeds![chartIndex].image = { url: 'attachment://performance.png' }
    return { payload, image }
  } catch {
    // The numeric summary remains useful if image generation is unavailable.
    return { payload }
  }
}
