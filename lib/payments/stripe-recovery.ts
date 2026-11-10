// Fixed provider snapshots and an event cursor make every pass resumable. The
// adapter owns the lease; this runner never advances past an unsuccessful event.
export type RecoveryPass = { since: number; until: number; cursor: string | null }
export type StripeRecoveryState = {
  incremental: RecoveryPass | null; audit: RecoveryPass | null
  coveredUntil: number | null; auditedAt: number | null
}
type Event = { id: string }
export async function runStripeRecovery<T extends Event>(options: {
  state: StripeRecoveryState; now: number; clock?: () => number; budgetMs?: number
  list: (pass: RecoveryPass) => Promise<{ data: T[]; has_more: boolean }>
  processed: (ids: string[]) => Promise<Set<string>>
  process: (event: T) => Promise<void>
  save: (state: StripeRecoveryState) => Promise<void>
}) {
  const { state, now } = options, clock = options.clock ?? Date.now
  const started = clock(), budget = options.budgetMs ?? 50_000
  const auditDue = Boolean(state.audit) || state.auditedAt === null || now - state.auditedAt >= 86400
  let checked = 0, recovered = 0
  for (const lane of ['incremental', 'audit'] as const) {
    if (lane === 'audit' && !state.audit && state.auditedAt !== null && now - state.auditedAt < 86400) continue
    const pass = state[lane] ??= { since: lane === 'audit' || state.coveredUntil === null ? now - 7 * 86400 : Math.max(now - 30 * 86400, state.coveredUntil - 3600), until: now, cursor: null }
    await options.save(state)
    const deadline = lane === 'incremental' && auditDue ? budget / 2 : budget
    while (clock() - started < deadline) {
      const page = await options.list(pass)
      const processed = await options.processed(page.data.map(event => event.id))
      let paused = false
      for (const event of page.data) {
        if (clock() - started >= deadline) { paused = true; break }
        if (!processed.has(event.id)) { await options.process(event); recovered++ }
        pass.cursor = event.id
        checked++
        // Persist actual processing immediately. A crash replays only idempotent
        // work, and never loses a partially completed provider page.
        if (!processed.has(event.id)) await options.save(state)
      }
      if (paused) { await options.save(state); break }
      if (page.has_more && !page.data.length) throw new Error('Stripe returned an empty continuation page')
      if (!page.has_more) {
        if (lane === 'incremental') state.coveredUntil = pass.until
        else state.auditedAt = pass.until
        state[lane] = null
      }
      await options.save(state)
      if (!page.has_more) break
    }
  }
  return { checked, recovered, partial: Boolean(state.incremental || state.audit) }
}
