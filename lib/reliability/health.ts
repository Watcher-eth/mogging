import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getRuntimeReadiness } from '@/lib/env'

export async function backendHealth() {
  const start = Date.now()
  let database = false
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '3s'`)
      await tx.execute(sql`select 1`)
    })
    database = true
  } catch { /* Report the dependency failure without leaking connection details. */ }
  const configured = getRuntimeReadiness().ok
  return {ok:database && configured,database,configured,duration_ms:Date.now()-start,checked_at:new Date().toISOString()}
}
