import { expect, test } from 'bun:test'
import { createDraftWriter } from './draft-writer'
import { newCourseContent } from './client'

test('serializes saves and retains edits made while a request is in flight', async () => {
  const content = newCourseContent(), requests: { version: number; title: string }[] = []
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const writer = createDraftWriter({ draft: content, version: 4 }, async (version, snapshot) => {
    requests.push({ version, title: snapshot.title })
    if (requests.length === 1) await wait
    return { version: version + 1 }
  }, () => {})
  writer.update({ ...content, title: 'First edit' })
  const first = writer.flush()
  writer.update(value => ({ ...value, title: 'Newest edit' }))
  expect(writer.flush()).toBe(first)
  release()
  expect(await first).toBe(6)
  expect(requests).toEqual([{ version: 4, title: 'First edit' }, { version: 5, title: 'Newest edit' }])
  expect(writer.dirty()).toBe(false)
})

test('failed validation can be corrected and retried without losing the draft', async () => {
  const content = newCourseContent(), states: string[] = []
  const writer = createDraftWriter({ draft: content, version: 1 }, async version => ({ version: version + 1 }), (_content, state) => states.push(state))
  writer.update({ ...content, title: '' })
  await expect(writer.flush()).rejects.toThrow()
  expect(writer.dirty()).toBe(true)
  writer.update(value => ({ ...value, title: 'Corrected' }))
  expect(await writer.flush()).toBe(2)
  expect(states.at(-1)).toBe('saved')
})

test('conflicts retain the unsaved edit and never guess a newer server version', async () => {
  const content = newCourseContent(), versions: number[] = []
  let retained = ''
  const writer = createDraftWriter({ draft: content, version: 3 }, async version => {
    versions.push(version); throw new Error('Course changed; reload')
  }, (value, state) => { if (state === 'error') retained = value.title })
  writer.update({ ...content, title: 'Keep this edit' })
  await expect(writer.flush()).rejects.toThrow('Course changed')
  await expect(writer.flush()).rejects.toThrow('Course changed')
  expect(retained).toBe('Keep this edit')
  expect(versions).toEqual([3, 3])
  expect(writer.dirty()).toBe(true)
})
