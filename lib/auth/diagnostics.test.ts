import { expect, test } from 'bun:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { authErrorOutcome } from '../reliability/outcome'

test('shared NextAuth logger classifies the correct concurrent request and never logs secrets', async () => {
  const marks = new Map(), logs: unknown[] = []
  const source = readFileSync(new URL('./diagnostics.ts', import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')
  const scope: any = { AsyncLocalStorage, createHash, authErrorOutcome, console: {error: (_:unknown,v:unknown) => logs.push(v),info(){},warn(){}},
    setBackendOutcome: (res:unknown,outcome:unknown) => marks.set(res,outcome) }
  runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.context = authDiagnosticContext; globalThis.logger = authLogger;'),scope)
  const a = {getHeader:()=>'a'}, b = {getHeader:()=>'b'}
  await Promise.all([scope.context.run({req:{cookies:{},query:{state:'private-oauth-state'}},res:a},async()=>{
    await Promise.resolve(); scope.logger.error('OAUTH_CALLBACK_ERROR',{error:new Error('State cookie was missing.'),token:'private-access-token'})
  }),scope.context.run({req:{cookies:{},query:{}},res:b},async()=>{
    scope.logger.error('OAUTH_CALLBACK_HANDLER_ERROR',new Error('access_denied'))
  })])
  expect(marks.get(a).code).toBe('oauth_state_missing')
  expect(marks.get(b).code).toBe('oauth_cancelled')
  expect(JSON.stringify(logs)).not.toContain('private-')
})
