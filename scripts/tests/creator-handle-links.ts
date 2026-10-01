import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { sql, eq } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

const address = process.env.CREATOR_LINK_TEST_DATABASE_URL
if (!address) throw new Error('Set CREATOR_LINK_TEST_DATABASE_URL to a disposable localhost creator_link_test database')
const url = new URL(address)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/creator_link_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
const { db, schema } = await import('../../lib/db')
const { ensureCreatorTrackingLink, syncCreatorTrackingLinkHandle, createCreatorAttributionClick, resolveCreatorAttribution } = await import('../../lib/creator/attribution')
const dialect = new PgDialect()
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

try {
  for (const table of [schema.creatorSocialAccounts, schema.creatorTrackingLinks, schema.creatorAttributionClicks]) {
    const config = getTableConfig(table)
    const columns = config.columns.map(column => {
      const type = column.enumValues ? 'text' : column.getSQLType()
      const value = column.default
      const defaultSql = value === undefined ? '' : typeof value === 'string' ? ` default ${quote(value)}` : typeof value === 'boolean' || typeof value === 'number' ? ` default ${value}` : ` default ${dialect.sqlToQuery(value as any).sql}`
      return `"${column.name}" ${type}${column.primary ? ' primary key' : ''}${column.notNull ? ' not null' : ''}${defaultSql}`
    })
    await db.execute(sql.raw(`create table "${config.name}" (${columns.join(', ')})`))
  }
  await db.execute(sql`create unique index on creator_tracking_links (slug)`)
  await db.execute(sql`create unique index on creator_tracking_links (social_account_id)`)
  const migration = await readFile(new URL('../../drizzle/0038_creator_handle_links.sql', import.meta.url), 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) await db.execute(sql.raw(statement))

  async function account(id: string, handle: string | null, platform: 'tiktok' | 'instagram' = 'tiktok') {
    await db.insert(schema.creatorSocialAccounts).values({ id, creatorProfileId: 'profile', handle, platform })
  }
  await account('10000000-0000-4000-8000-000000000001', 'nate')
  const originalSlug = 'tiktok-account-241fcc4a'
  const [old] = await db.insert(schema.creatorTrackingLinks).values({ id: 'original-link', socialAccountId: '10000000-0000-4000-8000-000000000001', slug: originalSlug, publicUrl: `https://www.mogging.com/r/${originalSlug}`, deepLinkBaseUrl: 'mogging://r', iosAppStoreUrl: `https://apps.apple.com/app/id6771414050?ct=${originalSlug}` }).returning()
  const renamed = await syncCreatorTrackingLinkHandle(old)
  assert.equal(renamed.publicUrl, 'https://www.mogging.com/r/nate')
  assert.equal(renamed.id, old.id)
  assert.equal(renamed.slug, old.slug)
  assert.equal(renamed.iosAppStoreUrl, old.iosAppStoreUrl)
  const click = await createCreatorAttributionClick({ slug: originalSlug, anonymousActorId: 'visitor', userAgent: 'Mogging iOS' })
  const friendlyClick = await createCreatorAttributionClick({ slug: 'nate', anonymousActorId: 'visitor', userAgent: 'Mogging iOS' })
  assert.equal(click?.click.trackingLinkId, old.id)
  assert.equal(friendlyClick?.click.trackingLinkId, old.id)
  assert.match(friendlyClick!.deepLinkUrl, new RegExp(originalSlug))
  assert.equal((await resolveCreatorAttribution({ token: click!.token }))?.trackingLinkId, old.id)

  await account('20000000-0000-4000-8000-000000000002', 'nate', 'instagram')
  const instagram = await ensureCreatorTrackingLink('20000000-0000-4000-8000-000000000002')
  assert.equal(instagram.publicUrl, 'https://www.mogging.com/r/nate-instagram')
  await account('30000000-0000-4000-8000-000000000003', 'nate')
  const otherTikTok = await ensureCreatorTrackingLink('30000000-0000-4000-8000-000000000003')
  assert.equal(otherTikTok.publicUrl, 'https://www.mogging.com/r/nate-tiktok')
  await account('40000000-0000-4000-8000-000000000004', 'nate')
  assert.equal((await ensureCreatorTrackingLink('40000000-0000-4000-8000-000000000004')).publicUrl, 'https://www.mogging.com/r/nate-tiktok-40000000-0000-4000-8000-000000000004')
  const repeats = await Promise.all([ensureCreatorTrackingLink('10000000-0000-4000-8000-000000000001'), ensureCreatorTrackingLink('10000000-0000-4000-8000-000000000001')])
  assert.ok(repeats.every(link => link.id === old.id && link.publicUrl.endsWith('/nate')))

  await db.update(schema.creatorSocialAccounts).set({ handle: 'new.nate' }).where(eq(schema.creatorSocialAccounts.id, '10000000-0000-4000-8000-000000000001'))
  assert.equal((await ensureCreatorTrackingLink('10000000-0000-4000-8000-000000000001')).publicUrl, 'https://www.mogging.com/r/new.nate')
  assert.equal((await createCreatorAttributionClick({ slug: 'nate', anonymousActorId: null }))?.link.id, old.id)
  await db.update(schema.creatorTrackingLinks).set({ isActive: false }).where(eq(schema.creatorTrackingLinks.id, old.id))
  assert.equal(await createCreatorAttributionClick({ slug: 'nate', anonymousActorId: null }), null)
  assert.equal(await createCreatorAttributionClick({ slug: originalSlug, anonymousActorId: null }), null)
  await syncCreatorTrackingLinkHandle({ ...renamed, isActive: false })
  assert.equal((await db.query.creatorTrackingLinks.findFirst({ where: eq(schema.creatorTrackingLinks.id, old.id) }))?.isActive, false)
  await account('missing-handle', null)
  assert.match((await ensureCreatorTrackingLink('missing-handle')).publicUrl, /tiktok-account-/)
  console.log('PASS: migration, stable IDs/campaigns, old/new clicks and tokens, collisions, concurrency, handle changes, inactive links, missing handles')
} finally {
  for (const name of ['creator_tracking_link_aliases', 'creator_attribution_clicks', 'creator_tracking_links', 'creator_social_accounts']) await db.execute(sql.raw(`drop table if exists ${name} cascade`))
}
process.exit(0)
