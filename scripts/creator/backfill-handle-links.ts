import { asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { syncCreatorTrackingLinkHandle } from '../../lib/creator/attribution'

// Deploy alias-aware referral routing before using --apply. Old URLs and IDs remain intact.
const apply = process.argv.includes('--apply')
try {
  const links = await db.select({ link: schema.creatorTrackingLinks, handle: schema.creatorSocialAccounts.handle, platform: schema.creatorSocialAccounts.platform })
    .from(schema.creatorTrackingLinks)
    .innerJoin(schema.creatorSocialAccounts, eq(schema.creatorTrackingLinks.socialAccountId, schema.creatorSocialAccounts.id))
    .orderBy(sql`case when ${schema.creatorSocialAccounts.platform} = 'tiktok' then 0 else 1 end`, asc(schema.creatorTrackingLinks.createdAt))
  let updated = 0, unchanged = 0, missingHandle = 0
  for (const { link, handle, platform } of links) {
    if (!handle || !/^[a-z0-9._]{1,40}$/i.test(handle.replace(/^@/, ''))) { missingHandle++; continue }
    if (!apply) { console.log({ platform, currentUrl: link.publicUrl, preferredUrl: `https://www.mogging.com/r/${handle.replace(/^@/, '').toLowerCase()}` }); continue }
    const result = await syncCreatorTrackingLinkHandle(link)
    if (result.publicUrl === link.publicUrl) unchanged++
    else { updated++; console.log({ platform, oldUrl: link.publicUrl, newUrl: result.publicUrl }) }
  }
  console.log({ mode: apply ? 'apply' : 'dry-run', total: links.length, updated, unchanged, missingHandle })
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Creator handle backfill failed')
  process.exit(1)
}
process.exit(0)
