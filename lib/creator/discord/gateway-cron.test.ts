import { beforeEach, expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'

const starts = new Set<string>(), tasks: Promise<unknown>[] = []
let calls = 0
mock.module('@vercel/functions', () => ({ waitUntil: (task: Promise<unknown>) => { tasks.push(task) } }))
mock.module('./gateway', () => ({ runDirectMessageGateway: async () => { calls++ } }))
mock.module('./store', () => ({ discordStore: () => ({ set: async (key: string) => { if (starts.has(key)) return null; starts.add(key); return 'OK' }, del: async (key: string) => starts.delete(key) }) }))
const { default: handler } = await import('@/pages/api/cron/discord-gateway')
beforeEach(() => { starts.clear(); tasks.length = 0; calls = 0; process.env.CRON_SECRET = 'test-only-cron-secret'; process.env.VERCEL_DEPLOYMENT_ID = 'test-deployment' })
async function invoke(authorization?: string, method = 'GET') {
  let status = 0, body: unknown
  const req = { method, headers: { authorization } } as NextApiRequest
  const res = { setHeader() { return res }, status(code: number) { status = code; return res }, end() { return res }, json(value: unknown) { body = value; return res } } as unknown as NextApiResponse
  await handler(req, res)
  return { status, body }
}
test('only the authenticated cron can start a listener', async () => {
  expect((await invoke()).status).toBe(401)
  expect((await invoke('Bearer wrong-secret')).status).toBe(401)
  expect((await invoke('Bearer test-only-cron-secret', 'POST')).status).toBe(405)
  expect(calls).toBe(0)
})
test('duplicate scheduling starts one background listener per deployment and time slot', async () => {
  expect(await invoke('Bearer test-only-cron-secret')).toEqual({ status: 200, body: { started: true } })
  expect(await invoke('Bearer test-only-cron-secret')).toEqual({ status: 200, body: { started: false, reason: 'already_started' } })
  await Promise.all(tasks)
  expect(calls).toBe(1)
})
