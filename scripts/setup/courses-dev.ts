// Bootstrap only the isolated, empty local course database. Never run against production.
import postgres from 'postgres'
import { chmod } from 'node:fs/promises'
import { userInfo } from 'node:os'

const url = process.env.COURSE_DEV_DATABASE_URL || `postgres://${encodeURIComponent(userInfo().username)}@127.0.0.1:55432/mogging_courses_dev`
const target = new URL(url)
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/mogging_courses_dev') {
  throw new Error('This setup script only accepts the dedicated local mogging_courses_dev database')
}
process.env.DATABASE_URL = url
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
try {
  const [{ count }] = await sql`select count(*)::int as count from information_schema.tables where table_schema='public'`
  if (count !== 0) throw new Error('Database must be empty; existing data is never reset')
  const exported = Bun.spawnSync(['bunx', '--no-install', 'drizzle-kit', 'export', '--dialect', 'postgresql', '--schema', './lib/db/schema.ts'], { stdout: 'pipe', stderr: 'pipe' })
  if (exported.exitCode !== 0) throw new Error(exported.stderr.toString())
  const migration = await Bun.file('drizzle/0040_course_platform.sql').text() + '\n--> statement-breakpoint\n' + await Bun.file('drizzle/0042_course_watch_progress.sql').text()
  await sql.begin(async tx => {
    await tx.unsafe(exported.stdout.toString())
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await tx.unsafe(statement)
  })
  const { registerUser } = await import('../../lib/auth/register')
  const { saveSeller, changeSellerStatus } = await import('../../lib/courses/sellers')
  const { db, schema } = await import('../../lib/db')
  const { eq } = await import('drizzle-orm')
  const password = `Dev-${crypto.randomUUID()}`
  const creator = await registerUser({ email: 'creator@mogging.test', password, name: 'Course development creator' })
  const buyer = await registerUser({ email: 'buyer@mogging.test', password, name: 'Course development buyer' })
  for (const user of [creator, buyer]) await db.update(schema.users).set({ emailVerified: new Date() }).where(eq(schema.users.id, user.id))
  const seller = await saveSeller(creator.id, { slug: 'dev-creator', country: 'DE', supportEmail: creator.email, bio: 'Local development fixture' })
  await changeSellerStatus(seller.id, 'enabled', creator.id)
  await Bun.write('.local/course-accounts.json', JSON.stringify({ creator: creator.email, buyer: buyer.email, password, sellerId: seller.id }, null, 2))
  await chmod('.local/course-accounts.json', 0o600)
  console.log('Local schema and course migration applied. Development sign-in details are in ignored .local/course-accounts.json.')
} finally {
  await sql.end()
}
process.exit(0)
