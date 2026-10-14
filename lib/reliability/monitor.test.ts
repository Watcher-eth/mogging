import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { backendOutcome } from './outcome'

test('redirect failures override JSON success and are isolated between simultaneous requests', async () => {
  const events: unknown[] = []
  const tasks: Promise<unknown>[] = []
  const source = readFileSync(new URL('./monitor.ts', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
  const scope: any = { Date, WeakMap, Promise, console: {info(){}}, randomUUID: () => 'trace', backendOutcome,
    waitUntil: (task: Promise<unknown>) => tasks.push(task) }
  const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.monitor = monitorBackend; globalThis.mark = setBackendOutcome; recordBackendRequest = async (_, result) => events.push(result);')
  scope.events = events
  runInNewContext(script, scope)
  const response = () => ({statusCode:302, setHeader(){}, json(){}})
  const failed = response(), success = response()
  await Promise.all([scope.monitor('auth', async (_:unknown,res:unknown) => { scope.mark(res,{outcome:'failed',code:'oauth_state_missing',alert:true}); await Promise.resolve(); })( {},failed),
    scope.monitor('auth',async()=>{})( {},success)])
  await Promise.all(tasks)
  expect(events).toContainEqual({outcome:'failed',code:'oauth_state_missing',alert:true})
  expect(events).toContainEqual({outcome:'ok',code:'ok',alert:false})
  expect(events).toHaveLength(2)
})
