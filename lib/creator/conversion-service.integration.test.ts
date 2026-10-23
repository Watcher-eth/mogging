import { afterAll, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
const target = process.env.CREATOR_TEST_DATABASE_URL;
if (target) {
  const url = new URL(target);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/creator_continuity_test"
  )
    throw new Error("Only the isolated local creator test database is allowed");
  process.env.DATABASE_URL = target;
}
const suite = target ? test : test.skip;
const { db, schema } = await import("@/lib/db");
const { getCreatorConversionReport } = await import("./conversion-service");
const campaignIds: string[] = [];
const userIds: string[] = [],
  linkIds: string[] = [];
async function creator() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `bonus-${crypto.randomUUID()}@example.invalid` })
    .returning();
  userIds.push(user.id);
  const [profile] = await db
    .insert(schema.creatorProfiles)
    .values({
      userId: user.id,
      displayName: "Bonus test",
      authStatus: "verified",
    })
    .returning();
  const [account] = await db
    .insert(schema.creatorSocialAccounts)
    .values({
      creatorProfileId: profile.id,
      platform: "tiktok",
      handle: "bonustest",
    })
    .returning();
  const [link] = await db
    .insert(schema.creatorTrackingLinks)
    .values({
      socialAccountId: account.id,
      slug: `test-${crypto.randomUUID()}`,
      publicUrl: "https://example.invalid/r/test",
      deepLinkBaseUrl: "mogging://",
      iosAppStoreUrl: "https://apps.apple.com",
    })
    .returning();
  linkIds.push(link.id);
  return { user, profile, account, link };
}
afterAll(async () => {
  if (campaignIds.length) await db.delete(schema.creatorSprints).where(inArray(schema.creatorSprints.id, campaignIds));
  if (linkIds.length)
    await db
      .delete(schema.creatorTrackingLinks)
      .where(inArray(schema.creatorTrackingLinks.id, linkIds));
  if (userIds.length)
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  await (
    globalThis as typeof globalThis & {
      postgresClient?: import("postgres").Sql;
    }
  ).postgresClient?.end();
});

suite(
  "creator report excludes other creators, bots, sandbox/internal billing and keeps shared bio traffic unassigned",
  async () => {
    const own = await creator(),
      other = await creator();
    const [post, empty, foreign] = await db
      .insert(schema.creatorSubmissions)
      .values([
        {
          creatorProfileId: own.profile.id,
          title: "Owned analysis",
          platform: "TikTok",
        },
        {
          creatorProfileId: own.profile.id,
          title: "No tracked activity",
          platform: "TikTok",
        },
        {
          creatorProfileId: other.profile.id,
          title: "Foreign private title",
          platform: "TikTok",
        },
      ])
      .returning();
    const [direct, account, bot, foreignClick] = await db
      .insert(schema.creatorAttributionClicks)
      .values([
        { trackingLinkId: own.link.id, submissionId: post.id },
        { trackingLinkId: own.link.id },
        { trackingLinkId: own.link.id, submissionId: post.id, isBot: true },
        { trackingLinkId: other.link.id, submissionId: foreign.id },
      ])
      .returning();
    const [internal] = await db
      .insert(schema.users)
      .values({
        email: `bonus-internal-${crypto.randomUUID()}@example.invalid`,
        analyticsInternal: true,
      })
      .returning();
    userIds.push(internal.id);
    const event = (
      clickId: string,
      eventType: "install" | "payment" | "refund",
      amountCents = 0,
      extra = {},
    ) => ({
      trackingLinkId: own.link.id,
      clickId,
      eventType,
      amountCents,
      attributionKey: "buyer-a",
      dedupeKey: crypto.randomUUID(),
      ...extra,
    });
    await db
      .insert(schema.creatorAttributionEvents)
      .values([
        event(direct.id, "install", 0, { mobileInstallId: "bonus-install-a" }),
        event(direct.id, "install", 0, { mobileInstallId: "bonus-install-a" }),
        event(direct.id, "payment", 20_000),
        event(direct.id, "payment", 10_000),
        event(direct.id, "refund", -2_000),
        event(account.id, "install", 0, {
          mobileInstallId: "bonus-install-b",
          attributionKey: "buyer-b",
        }),
        event(account.id, "payment", 5_000, { attributionKey: "buyer-b" }),
        event(direct.id, "payment", 100_000, {
          metadata: { environment: "sandbox" },
        }),
        event(direct.id, "payment", 200_000, { userId: internal.id }),
        event(bot.id, "payment", 300_000),
        event(foreignClick.id, "payment", 888_888, {
          trackingLinkId: other.link.id,
        }),
      ]);
    await db
      .insert(schema.creatorPayments)
      .values({
        creatorProfileId: own.profile.id,
        submissionId: post.id,
        amountCents: 10_000,
        status: "paid",
        paymentOption: "paypal",
      });
    const report = await getCreatorConversionReport(own.user.id);
    expect(report.totals).toEqual({
      linkPresses: 2,
      downloads: 2,
      conversions: 2,
      revenueCents: 33000,
    });
    expect(report.daily.reduce((sum, day) => sum + day.linkPresses, 0)).toBe(2);
    expect(report.daily.reduce((sum, day) => sum + day.downloads, 0)).toBe(2);
    expect(report.daily.reduce((sum, day) => sum + day.conversions, 0)).toBe(2);
    expect(report.daily.reduce((sum, day) => sum + day.revenue, 0)).toBeCloseTo(330, 8);
    expect(report.daily.length).toBeGreaterThanOrEqual(7);
    expect(report.unassigned).toEqual({
      linkPresses: 1,
      downloads: 1,
      conversions: 1,
      revenueCents: 5000,
    });
    expect(report.videos).toHaveLength(2);
    expect(report.videos.find((video) => video.id === post.id)).toMatchObject({
      linkPresses: 1,
      downloads: 1,
      conversions: 1,
      revenueCents: 28000,
      paidAmountCents: 10000,
    });
    expect(report.videos.find((video) => video.id === empty.id)).toMatchObject({
      linkPresses: 0,
      downloads: 0,
      conversions: 0,
      revenueCents: 0,
    });
    expect(JSON.stringify(report)).not.toContain("Foreign private title");
    expect(JSON.stringify(report)).not.toContain(other.profile.id);
  },
);
suite("suspended creators cannot read the report", async () => {
  const own = await creator();
  await db
    .update(schema.creatorProfiles)
    .set({ authStatus: "suspended" })
    .where(eq(schema.creatorProfiles.id, own.profile.id));
  await expect(getCreatorConversionReport(own.user.id)).rejects.toThrow(
    "Creator access required",
  );
});

suite("48-hour account windows preserve historical weights, deduplicate customers and retain later revenue", async () => {
  const own = await creator();
  const at = (hours: number) => new Date(Date.UTC(2026, 9, 1) + hours * 3_600_000);
  const [otherAccount] = await db.insert(schema.creatorSocialAccounts).values({
    creatorProfileId: own.profile.id, platform: "instagram", handle: "another-account",
  }).returning();
  const [older, newer, future, disconnected, otherPlatform] = await db.insert(schema.creatorSubmissions).values([
    { creatorProfileId: own.profile.id, socialAccountId: own.account.id, title: "Older", platform: "TikTok", createdAt: at(0) },
    { creatorProfileId: own.profile.id, socialAccountId: own.account.id, title: "Newer", platform: "TikTok", createdAt: at(24) },
    { creatorProfileId: own.profile.id, socialAccountId: own.account.id, title: "Future", platform: "TikTok", createdAt: at(200) },
    { creatorProfileId: own.profile.id, title: "Unlinked account", platform: "TikTok", createdAt: at(24) },
    { creatorProfileId: own.profile.id, socialAccountId: otherAccount.id, title: "Separate account", platform: "Instagram", createdAt: at(24) },
  ]).returning();
  await db.insert(schema.creatorSubmissionUpdates).values([
    { submissionId: older.id, type: "rereview_requested", createdAt: at(96) },
    { submissionId: newer.id, type: "feedback", createdAt: at(96) },
  ]);
  const [shared] = await db.insert(schema.creatorAttributionClicks).values([
    { trackingLinkId: own.link.id, createdAt: at(24) },
    { trackingLinkId: own.link.id, submissionId: older.id, createdAt: at(24) },
    { trackingLinkId: own.link.id, createdAt: at(72) }, // Exactly 48h after newest: expired.
    { trackingLinkId: own.link.id, submissionId: older.id, createdAt: at(72) }, // No fallback from expired exact identity.
    { trackingLinkId: own.link.id, createdAt: at(97) },
  ]).returning();
  const event = (eventType: "payment" | "install" | "refund", amountCents: number) => ({
    trackingLinkId: own.link.id, clickId: shared.id, eventType, amountCents,
    attributionKey: "window-buyer", mobileInstallId: "window-install", dedupeKey: crypto.randomUUID(), createdAt: at(300),
  });
  await db.insert(schema.creatorAttributionEvents).values([
    event("install", 0), event("install", 0), event("payment", 9000), event("payment", 3000), event("refund", -3000),
  ]);
  const report = await getCreatorConversionReport(own.user.id);
  const a = report.videos.find(v => v.id === older.id)!;
  const b = report.videos.find(v => v.id === newer.id)!;
  expect(report.totals).toEqual({ linkPresses: 5, downloads: 1, conversions: 1, revenueCents: 9000 });
  expect(report.unassigned.linkPresses).toBe(2);
  expect(a.direct.linkPresses).toBe(1);
  expect(a.estimated.linkPresses).toBeCloseTo(4 / 3, 10);
  expect(b.estimated.linkPresses).toBeCloseTo(2 / 3, 10);
  expect(a.estimated.downloads).toBeCloseTo(1 / 3, 10);
  expect(b.estimated.conversions).toBeCloseTo(2 / 3, 10);
  expect(a.estimated.revenueCents).toBeCloseTo(3000, 8);
  expect(b.estimated.revenueCents).toBeCloseTo(6000, 8);
  expect(a.direct.revenueCents).toBe(0);
  for (const metric of ["linkPresses", "downloads", "conversions", "revenueCents"] as const) {
    expect(report.videos.reduce((total, v) => total + v[metric], report.unassigned[metric])).toBeCloseTo(report.totals[metric], 8);
  }
  expect(report.videos.find(v => v.id === future.id)?.linkPresses).toBe(0);
  expect(report.videos.find(v => v.id === disconnected.id)?.linkPresses).toBe(0);
  expect(report.videos.find(v => v.id === otherPlatform.id)?.linkPresses).toBe(0);
});

suite("a saved draft is not tracked until submitted, and approved reviews renew only from their timestamp", async () => {
  const own = await creator();
  const at = (hours: number) => new Date(Date.UTC(2026, 9, 1) + hours * 3_600_000);
  const [post] = await db.insert(schema.creatorSubmissions).values({
    creatorProfileId: own.profile.id, socialAccountId: own.account.id, title: "Former draft", platform: "TikTok", createdAt: at(0),
  }).returning();
  await db.insert(schema.creatorSubmissionUpdates).values([
    { submissionId: post.id, type: "submitted", createdAt: at(100) },
    { submissionId: post.id, type: "approved", createdAt: at(200) },
  ]);
  await db.insert(schema.creatorAttributionClicks).values([99, 100, 148, 199, 200, 247, 248].map(hour => ({ trackingLinkId: own.link.id, createdAt: at(hour) })));
  const report = await getCreatorConversionReport(own.user.id);
  expect(report.videos[0].estimated.linkPresses).toBe(3);
  expect(report.videos[0].direct.linkPresses).toBe(0);
  expect(report.unassigned.linkPresses).toBe(4);
});

suite("recorded publication time starts the initial window, with submission time as the fallback", async () => {
  const own = await creator();
  const at = (hours: number) => new Date(Date.UTC(2026, 9, 1) + hours * 3_600_000);
  const [post] = await db.insert(schema.creatorSubmissions).values({
    creatorProfileId: own.profile.id, socialAccountId: own.account.id, title: "Known publication date", platform: "TikTok", postedAt: at(0), createdAt: at(24),
  }).returning();
  await db.insert(schema.creatorAttributionClicks).values([0, 47, 48, 60].map(hour => ({ trackingLinkId: own.link.id, createdAt: at(hour) })));
  const report = await getCreatorConversionReport(own.user.id);
  expect(report.videos.find(v => v.id === post.id)?.estimated.linkPresses).toBe(2);
  expect(report.unassigned.linkPresses).toBe(2);
});

suite("a creator with no recorded activity gets an empty chart instead of an invented trend", async () => {
  const own = await creator();
  expect((await getCreatorConversionReport(own.user.id)).daily).toEqual([]);
});

suite("bonus visibility follows published campaign dates without hiding another active campaign", async () => {
  const own = await creator();
  const now = Date.now();
  const baseline = (await getCreatorConversionReport(own.user.id)).bonusesAvailable;
  const [campaign] = await db.insert(schema.creatorSprints).values({
    name: "Conversion release gate test", description: "Local test only", status: "draft", budgetCents: 250000,
    startsAt: new Date(now - 3_600_000), endsAt: new Date(now + 3_600_000),
    terms: sql`'{"bonusBudgetCents":50000}'::jsonb`,
  }).returning();
  campaignIds.push(campaign.id);
  expect((await getCreatorConversionReport(own.user.id)).bonusesAvailable).toBe(baseline);
  await db.update(schema.creatorSprints).set({ status: "published", startsAt: new Date(now + 1800000) }).where(eq(schema.creatorSprints.id, campaign.id));
  expect((await getCreatorConversionReport(own.user.id)).bonusesAvailable).toBe(baseline);
  await db.update(schema.creatorSprints).set({ startsAt: new Date(now - 3600000) }).where(eq(schema.creatorSprints.id, campaign.id));
  expect((await getCreatorConversionReport(own.user.id)).bonusesAvailable).toBe(true);
  await db.update(schema.creatorSprints).set({ endsAt: new Date(now - 1) }).where(eq(schema.creatorSprints.id, campaign.id));
  expect((await getCreatorConversionReport(own.user.id)).bonusesAvailable).toBe(baseline);
});
