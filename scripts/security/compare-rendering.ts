import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const candidate = process.cwd()
const baseline = process.argv[2]
assert.ok(baseline && path.isAbsolute(baseline), 'Pass the credential-free baseline checkout')
const output = path.join(candidate, '.local/rendering-comparison')

if (process.argv.includes('--worker')) {
  const root = baseline
  const destination = process.argv[3]
  await mkdir(destination, { recursive: true })
  const { mock } = await import('bun:test')
  const source = await Bun.file(path.join(root, 'public/model2.png')).arrayBuffer()
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(source, { headers: { 'Content-Type': 'image/png' } }) })
  mock.module(path.join(root, 'lib/sharing/service.ts'), () => ({
    getShareByToken: async () => ({
      photo: { name: 'Synthetic compatibility fixture', gender: 'male', imageUrl: `http://127.0.0.1:${server.port}/portrait.png` },
      analysis: { pslScore: 6, harmonyScore: 6, dimorphismScore: 6, tier: 'Test', landmarks: null, metrics: {} },
      owner: { name: 'Fixture' },
    }),
  }))
  try {
    for (const design of ['report', 'original', 'precision', 'afterimage']) {
      const file = design === 'report' ? 'report' : 'share'
      const handler = (await import(path.join(root, `pages/api/og/${file}.tsx`))).default
      let status = 200
      let bytes: Buffer | undefined
      const response = {
        setHeader() {},
        status(code: number) { status = code; return this },
        send(body: Buffer) { bytes = body; return this },
        end(body: string) { throw new Error(`${status}: ${body}`) },
      }
      await handler({ method: 'GET', query: { token: 'synthetic', design }, headers: { host: `127.0.0.1:${server.port}` } }, response)
      assert.equal(status, 200)
      assert.ok(bytes && bytes.length > 1000)
      await Bun.write(path.join(destination, `${design}.png`), bytes)
    }
  } finally { await server.stop(true) }
} else {
  for (const [label, root] of [['baseline', baseline], ['candidate', candidate]]) {
    const child = Bun.spawn([process.execPath, '--no-env-file', import.meta.path, root, path.join(output, label), '--worker'], {
      cwd: root, env: { PATH: process.env.PATH!, NODE_ENV: 'test', NO_COLOR: '1' }, stdout: 'inherit', stderr: 'inherit',
    })
    assert.equal(await child.exited, 0, `${label} rendering failed`)
  }
  const sharp = createRequire(path.join(candidate, 'package.json'))('sharp')
  const results = []
  for (const design of ['report', 'original', 'precision', 'afterimage']) {
    const before = await sharp(path.join(output, 'baseline', `${design}.png`)).raw().toBuffer({ resolveWithObject: true })
    const after = await sharp(path.join(output, 'candidate', `${design}.png`)).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(after.info, before.info)
    const identicalPixels = after.data.equals(before.data)
    results.push({ design, width: after.info.width, height: after.info.height, identicalPixels })
  }
  const report = { checkedAt: new Date().toISOString(), scope: 'Real report/share handlers, original renderer, public portrait fixture; only sharing database lookup mocked.', results }
  await Bun.write('docs/qa/security-rendering-comparison-2026-10-16.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  assert.ok(results.every(result => result.identicalPixels), 'Rendering differs; defer the dependency change for visual review')
}
