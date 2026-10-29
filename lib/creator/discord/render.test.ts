import { expect, test } from 'bun:test'
import { renderDiscordSupport, safeText } from './render'
import { createDemoDataSource } from '../support/demo'
import { runSupportAgent } from '../support/agent'
import type { SupportResponse } from '../support/contracts'
import { sendPrivateReply } from './private-reply'
import { discordInteractionSchema } from './interactions'

test('unlimited accounts get a clear allowance footer without a numeric daily cap', async () => {
  const response: SupportResponse = { text: 'Here are your results.', artifacts: [], engine: 'instant', sampleData: false, usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0 }, allowance: { unlimited: true, limit: null, remaining: null, resetsAt: '2026-10-30T00:00:00Z' } }
  const { payload } = await renderDiscordSupport(response, 'Show my results')
  expect(payload.embeds?.[0].footer?.text).toBe('Unlimited support messages across Discord and Creator Studio')
  expect(JSON.stringify(payload)).not.toContain('null of 4')
})

test('renders at most two relevant sections and only first-party navigation', async () => {
  const source = createDemoDataSource()
  const response = await runSupportAgent({ input: { message: 'What is the status of my submissions?' }, source, memory: [], sampleData: true })
  response.artifacts.push({ type: 'campaigns', campaigns: await source.campaigns() }, { type: 'bonuses', payments: [], total: 0 })
  const { payload } = await renderDiscordSupport(response, 'What is the status of my submissions?')
  expect(payload.embeds!.length).toBeLessThanOrEqual(2)
  expect(payload.embeds![0].description).toContain('In review')
  expect(payload.embeds![0].description).toContain('Approved & paid')
  expect(payload.embeds![0].description).toContain('Rejected')
  expect(payload.allowed_mentions.parse).toEqual([])
  for (const row of payload.components ?? []) for (const button of row.components) expect(new URL(button.url).origin).toBe(new URL(process.env.NEXTAUTH_URL || 'https://www.mogging.com').origin)
})
test('one observation stays a numeric summary; multi-video comparisons produce an attached image', async () => {
  const base: SupportResponse = { text: 'Your result.', artifacts: [], engine: 'instant', sampleData: false, usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0 } }
  const one = await renderDiscordSupport({ ...base, artifacts: [{ type: 'analytics', days: 1, report: { daily: [{ day: '2026-10-29', conversions: 4, downloads: 8, linkPresses: 12, revenue: 5 }], totals: { conversions: 4, downloads: 8, linkPresses: 12, revenueCents: 500 } } }] }, 'Show analytics')
  expect(one.image).toBeUndefined()
  expect(one.payload.embeds![0].description).toContain('4 conversions')
  const comparison = await renderDiscordSupport({ ...base, artifacts: [{ type: 'submission-views', scope: 'Cumulative snapshots, not weekly gains.', rows: [{ id: 'a', title: '<script>@everyone</script>', views: 123, basis: 'verified', status: 'paid' }, { id: 'b', title: 'Another video', views: 456, basis: 'submitted', status: 'pending' }] }] }, 'Compare my video views')
  expect(comparison.image!.subarray(1, 4).toString()).toBe('PNG')
  expect(comparison.payload.embeds![0].image?.url).toBe('attachment://performance.png')
  expect(comparison.payload.embeds![0].description).toContain('verified views')
  expect(comparison.payload.embeds![0].description).toContain('submitted views')
  expect(safeText('@everyone')).not.toBe('@everyone')
})
test('delivery only edits the originating interaction and cannot fall back to public channel posting', async () => {
  const original = globalThis.fetch, calls: string[] = []
  globalThis.fetch = (async (url, init) => { calls.push(String(url)); expect(init?.method).toBe('PATCH'); return new Response('', { status: 403 }) }) as typeof fetch
  try {
    const interaction = discordInteractionSchema.parse({ id: '1526698974847963288', application_id: '1526698974847963299', token: 'private-token', type: 2, guild_id: '1526698974847963268', channel_id: '1526698975313526877', member: { user: { id: '1526698974847963300' } }, data: { name: 'help' } })
    await expect(sendPrivateReply(interaction, { payload: { content: 'Private account data', allowed_mentions: { parse: [] } } })).rejects.toThrow('could not be delivered')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/webhooks/')
    expect(calls[0]).toEndWith('/messages/@original')
    expect(calls[0]).not.toContain('/channels/')
  } finally { globalThis.fetch = original }
})
