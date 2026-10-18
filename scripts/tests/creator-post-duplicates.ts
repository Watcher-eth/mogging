import postgres from 'postgres'
const db = postgres({ host: '/tmp', database: 'postgres', username: 'watcher', max: 2, prepare: false, onnotice: () => {} })
const name = `duplicate_test_${crypto.randomUUID().replaceAll('-', '')}`
const table = `"${name}".creator_submissions`
const assert = (x: unknown, message: string) => { if (!x) throw Error(message) }
try {
 await db.unsafe(`create schema "${name}"`)
 await db.unsafe(`create table ${table} (id text primary key, status text not null, post_url text)`)
 const migration = await Bun.file(new URL('../../drizzle/0052_creator_submission_post_identity.sql', import.meta.url)).text()
 for (const statement of migration.split('--> statement-breakpoint')) await db.unsafe(statement.replaceAll(/\bcreator_submissions\b/g, table))
 const results = await Promise.allSettled(['creator-a','creator-b'].map(id => db.unsafe(`insert into ${table}(id,status,post_key,post_url) values ($1,'pending','tiktok:123',$2)`, [id, `https://tiktok.com/@${id}/video/123?share=${id}`])))
 assert(results.filter(r=>r.status==='fulfilled').length===1,'Concurrent duplicate inserts both succeeded')
 assert(results.some(r=>r.status==='rejected' && r.reason.code==='23505'),'Missing database unique constraint')
 const [row] = await db.unsafe(`select id from ${table}`)
 await db.unsafe(`update ${table} set status='approved' where id=$1`,[row.id])
 await db.unsafe(`update ${table} set status='in_review' where id=$1`,[row.id])
 await db.unsafe(`insert into ${table}(id,status,post_key) values ('rejected-history','rejected','tiktok:123')`)
 const reopened = await Promise.allSettled([db.unsafe(`update ${table} set status='approved' where id='rejected-history'`)])
 assert(reopened[0].status==='rejected','Rejected duplicate could become payout-eligible')
 console.log('PASS: only one concurrent insert succeeds; same-row rereviews work; rejected history preserved; duplicate cannot become payout-eligible')
} finally { await db.unsafe(`drop schema if exists "${name}" cascade`); await db.end() }
