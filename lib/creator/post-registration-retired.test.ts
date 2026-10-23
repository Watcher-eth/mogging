import { expect, mock, test } from 'bun:test'
let session: { user: { id: string } } | null = { user: { id: 'creator' } }
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => session }))
const { default: handler } = await import('../../pages/api/creator/posts')
async function request(method: string) {
  const response: any = { statusCode: 200, setHeader() {}, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this } }
  await handler({ method, body: {}, headers: {} } as any, response)
  return response
}
test('cached post setup cannot mint more codes, while unauthenticated requests remain protected', async () => {
  for (const method of ['POST', 'PATCH']) {
    const result = await request(method)
    expect(result.statusCode).toBe(410)
    expect(result.body.error.message).toContain('Reuse your account link or code')
  }
  session = null
  expect((await request('POST')).statusCode).toBe(401)
  expect((await request('DELETE')).statusCode).toBe(405)
})
