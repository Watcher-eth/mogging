import { getRuntimeReadiness } from '../../lib/env'

const readiness = getRuntimeReadiness()

for (const check of readiness.checks) {
  const state = check.ok ? 'ok' : check.required ? 'missing' : 'optional'
  console.log(`${state}\t${check.key}${check.message ? `\t${check.message}` : ''}`)
}

if (!readiness.ok) {
  process.exitCode = 1
}
