import { beforeEach, expect, mock, test } from 'bun:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let effects: Array<() => unknown> = []
let getKey: (index: number, previous: unknown) => string | null
let polling = 0
const receipts: unknown[] = []
mock.module('react', () => ({ ...React, useEffect: (effect: () => unknown) => effects.push(effect) }))
mock.module('swr', () => ({ useSWRConfig: () => ({ mutate: async () => {} }) }))
mock.module('swr/infinite', () => ({ default: (key: typeof getKey, _fetcher: unknown, config: { refreshInterval: number }) => {
  getKey = key; polling = config.refreshInterval
  return { data: [{ submission: { status: 'approved', unreadMessages: 1 }, messages: [{ id: 'unread', authorRole: 'creator', body: 'Question', createdAt: '2026-10-23T12:00:00Z' }], nextCursor: null }], mutate: async () => {}, size: 1 }
} }))
mock.module('@/lib/api/client', () => ({ apiGet: async () => {}, apiPost: async () => {}, apiPatch: async (_endpoint: string, body: unknown) => { receipts.push(body) } }))
const { SubmissionConversation } = await import('./submission-conversation')
beforeEach(() => { effects = []; receipts.length = 0 })

function render(active?: boolean) {
  renderToStaticMarkup(<SubmissionConversation submissionId="sample" viewerRole="team" active={active} />)
  for (const effect of effects) effect()
}

test('a preserved hidden conversation neither polls nor marks messages read', () => {
  render(false)
  expect(getKey(0, null)).toBeNull()
  expect(polling).toBe(0)
  expect(receipts).toEqual([])
})

test('a visible conversation keeps normal polling and read receipts', () => {
  render()
  expect(getKey(0, null)).toBe('/api/admin/creator/submissions/sample/messages')
  expect(polling).toBe(10000)
  expect(receipts).toEqual([{ messageId: 'unread' }])
})
