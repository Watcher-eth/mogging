import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { computeImageHash } from '@/lib/photos/imageHash'

// Exercise the actual AWS SDK retries and abort behavior against localhost, not R2.
test('temporary storage failures retry the identical upload; a stalled upload is bounded', async () => {
  let requests = 0, stall = false
  const keys: string[] = [], uploads: Buffer[] = []
  const server = createServer(async (req, res) => {
    requests++
    keys.push(req.url!)
    const parts: Buffer[] = []
    for await (const part of req) parts.push(Buffer.from(part))
    uploads.push(Buffer.concat(parts))
    if (stall) return
    if (requests < 3) {
      res.writeHead(503, { 'Content-Type': 'application/xml' })
      res.end('<Error><Code>ServiceUnavailable</Code><Message>Injected temporary outage</Message></Error>')
    } else { res.writeHead(200, { ETag: '"test-image"' }); res.end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const clients: S3Client[] = []
  const load = (deadline: number) => {
    const source = readFileSync(new URL('./images.ts', import.meta.url), 'utf8')
      .replace(/^import .*\n/gm, '').replace(/^export /gm, '').replace('AbortSignal.timeout(20_000)', `AbortSignal.timeout(${deadline})`)
    const scope: any = { z, Buffer, Set, AbortSignal, computeImageHash, PutObjectCommand, DeleteObjectsCommand,
      env: { R2_BUCKET_NAME: 'test-only', R2_PUBLIC_BASE_URL: 'https://images.example.invalid' }, isR2Configured: () => true,
      S3Client: class extends S3Client {
        constructor(options: any) {
          super({ ...options, endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`, credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, forcePathStyle: true })
          clients.push(this)
        }
      },
    }
    runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source) + '\nglobalThis.upload=storeImageDataUrl;', scope)
    return scope.upload as (data: string) => Promise<{ imageStorageKey: string }>
  }
  try {
    const data = `data:image/jpeg;base64,${Buffer.from('isolated-upload-fixture').toString('base64')}`
    const uploaded = await load(20_000)(data)
    expect(requests).toBe(3)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toContain(uploaded.imageStorageKey)
    expect(uploads.every(body => body.equals(uploads[0]))).toBe(true)
    stall = true
    const started = Date.now()
    await expect(load(50)(data)).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - started).toBeLessThan(1000)
  } finally {
    for (const client of clients) client.destroy()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
