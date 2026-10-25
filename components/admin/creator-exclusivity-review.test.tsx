import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import * as React from 'react'
let states: unknown[] = [], cursor = 0
const messages: string[] = []
mock.module('react', () => ({ ...React, useState: (initial: unknown) => {
  const index = cursor++
  if (!(index in states)) states[index] = initial
  return [states[index], (value: unknown) => { states[index] = value }]
} }))
mock.module('sonner', () => ({ toast: { success: (message: string) => messages.push(message), error: (message: string) => messages.push(message) } }))
const { CreatorExclusivityReview } = await import('./creator-exclusivity-review')
const originalFetch = globalThis.fetch
let requests: { method?: string; body: unknown }[] = []
let fail = false, refreshes = 0
beforeEach(() => {
 states = []; cursor = 0; messages.length = 0; requests = []; fail = false; refreshes = 0
 globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
  requests.push({ method: init.method, body: JSON.parse(String(init.body)) })
  return fail ? Response.json({ error: { message: 'Verification could not be saved' } }, { status: 500 }) : Response.json({ data: { record: {} } })
 }) as typeof fetch
})
afterAll(() => { globalThis.fetch = originalFetch })
function checkbox() {
 cursor = 0
 const label = CreatorExclusivityReview({ submission: { id: 'new-campaign-post', exclusivityConfirmed: false }, onSaved: async () => { refreshes++ } })
 return label.props.children[0]
}
test('checking and unchecking bio verification use the accepted PATCH contract and refresh in place', async () => {
 await checkbox().props.onChange({ target: { checked: true } })
 expect(requests[0]).toEqual({ method: 'PATCH', body: { resource: 'exclusivity', id: 'new-campaign-post', confirmed: true } })
 expect(checkbox().props.checked).toBe(true)
 expect(refreshes).toBe(1)
 await checkbox().props.onChange({ target: { checked: false } })
 expect(requests[1].body).toEqual({ resource: 'exclusivity', id: 'new-campaign-post', confirmed: false })
 expect(checkbox().props.checked).toBe(false)
 expect(refreshes).toBe(2)
})
test('a failed save preserves verification state and permits retry', async () => {
 fail = true
 await checkbox().props.onChange({ target: { checked: true } })
 expect(checkbox().props.checked).toBe(false)
 expect(checkbox().props.disabled).toBe(false)
 expect(refreshes).toBe(0)
 expect(messages).toContain('Verification could not be saved')
 fail = false
 await checkbox().props.onChange({ target: { checked: true } })
 expect(checkbox().props.checked).toBe(true)
})
