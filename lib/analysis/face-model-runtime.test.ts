import { afterEach, expect, test } from 'bun:test'
import { faceModelWorker, requireFaceModelWorker } from './face-model-runtime'
const original = { origin: process.env.FACE_MODEL_WORKER_ORIGIN, secret: process.env.FACE_MODEL_WORKER_SECRET, fetch: globalThis.fetch }
afterEach(() => {
  for (const [key, value] of Object.entries({ FACE_MODEL_WORKER_ORIGIN: original.origin, FACE_MODEL_WORKER_SECRET: original.secret })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
  globalThis.fetch = original.fetch
})
test('unconfigured workers reject readiness before scan creation', async () => {
  delete process.env.FACE_MODEL_WORKER_ORIGIN
  delete process.env.FACE_MODEL_WORKER_SECRET
  await expect(requireFaceModelWorker()).rejects.toMatchObject({ status: 503 })
})
test('worker origins reject embedded credentials and offline workers', async () => {
  process.env.FACE_MODEL_WORKER_SECRET = 'private-test-worker-secret-of-sufficient-length'
  process.env.FACE_MODEL_WORKER_ORIGIN = 'https://credentials:secret@worker.invalid'
  expect(() => faceModelWorker()).toThrow()
  process.env.FACE_MODEL_WORKER_ORIGIN = 'https://worker.invalid'
  globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({ ready: false })), { preconnect: original.fetch.preconnect })
  await expect(requireFaceModelWorker()).rejects.toMatchObject({ status: 503 })
  globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({ ready: true })), { preconnect: original.fetch.preconnect })
  await expect(requireFaceModelWorker()).resolves.toBeUndefined()
})
