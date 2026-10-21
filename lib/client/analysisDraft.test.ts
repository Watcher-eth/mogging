import { afterEach, expect, test } from 'bun:test'
import { saveAnalysisDraft, clearAnalysisDraft } from './analysisDraft'

const original = globalThis.indexedDB
afterEach(() => { globalThis.indexedDB = original })

function storage() {
  const request: any = {}
  const transaction: any = { objectStore: () => ({ put: () => request, delete: () => request }) }
  let closed = false
  const db = { transaction: () => transaction, close: () => { closed = true } }
  globalThis.indexedDB = { open: () => {
    const open: any = { result: db }
    queueMicrotask(() => open.onsuccess())
    return open
  } } as unknown as IDBFactory
  return { request, transaction, closed: () => closed }
}

test('checkout draft is durable only when its transaction commits', async () => {
  const h = storage()
  let saved = false
  const pending = saveAnalysisDraft({ images: [], gender: 'male', savedAt: 1 }).then(() => { saved = true })
  await Promise.resolve(); await Promise.resolve()
  h.request.onsuccess?.()
  await Promise.resolve(); await Promise.resolve()
  expect(saved).toBe(false)
  h.transaction.oncomplete()
  await pending
  expect(saved).toBe(true)
  expect(h.closed()).toBe(true)
})

test('a transaction abort after a successful write stops checkout and closes storage', async () => {
  const h = storage()
  const pending = saveAnalysisDraft({ images: [], gender: 'female', savedAt: 1 })
  await Promise.resolve(); await Promise.resolve()
  h.request.onsuccess?.()
  h.transaction.error = new Error('Storage full')
  h.transaction.onabort?.()
  await expect(pending).rejects.toThrow('Storage full')
  expect(h.closed()).toBe(true)
})

test('clearing the checkout draft also waits for commit', async () => {
  const h = storage()
  let cleared = false
  const pending = clearAnalysisDraft().then(() => { cleared = true })
  await Promise.resolve(); await Promise.resolve()
  h.request.onsuccess?.()
  await Promise.resolve(); await Promise.resolve()
  expect(cleared).toBe(false)
  h.transaction.oncomplete()
  await pending
  expect(h.closed()).toBe(true)
})
