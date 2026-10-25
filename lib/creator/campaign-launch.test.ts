import { describe, expect, test } from "bun:test";
import { CAMPAIGN_LAUNCH_AT, LAUNCH_CAMPAIGNS, launchCampaignTerms } from "./campaign-launch";
import { minimumSubmissionViews } from './validation';
import {
  campaignAudienceBands,
  campaignHasAudienceBands,
  defaultCreatorSprintTerms,
} from "./sprint-defaults";
import { creatorCampaignFormats, sprintPhase, sprintPayoutCents, sprintTermsSchema, type CreatorSprint } from "./sprints";
import {
  conversionBonusCents,
  campaignBonusTargets,
  audienceBonusClaimsRemaining,
  exclusivityBonusCents,
  qualifiesAudienceBonus,
} from "./campaign-bonuses";

describe("new campaign audience thresholds", () => {
  test('upcoming campaigns cannot be selected until noon Los Angeles', () => {
    const startsAt = CAMPAIGN_LAUNCH_AT;
    const sprint = { id: 'new', status: 'published', startsAt, endsAt: '2026-11-22T19:00:00.000Z', usedCents: 0, budgetCents: 250000, terms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]) } as CreatorSprint;
    const start = Date.parse(startsAt);
    expect(sprintPhase(sprint, start - 1)).toBe('scheduled');
    expect(creatorCampaignFormats([sprint], start - 1)).toHaveLength(0);
    expect(sprintPhase(sprint, start)).toBe('active');
    expect(creatorCampaignFormats([sprint], start)).toHaveLength(1);
    expect(minimumSubmissionViews(sprint.terms)).toBe(5000);
    expect(minimumSubmissionViews(defaultCreatorSprintTerms())).toBe(20000);
  });
  for (const campaign of LAUNCH_CAMPAIGNS)
    test(`${campaign.name} qualifies for Tier A at 32%, preserving its exact payouts`, () => {
      const terms = sprintTermsSchema.parse(launchCampaignTerms(campaign));
      expect(campaignHasAudienceBands(terms)).toBe(true);
      expect(campaignAudienceBands(terms).map(band => band.tier)).toEqual(['C', 'B', 'A']);
      expect(sprintPayoutCents(terms, campaign.milestones[0].views, 14.99)).toBe(0);
      expect(
        campaignAudienceBands(terms).find((band) => band.tier === "A")
          ?.minimumPercent,
      ).toBe(32);
      for (const milestone of campaign.milestones) {
        expect(sprintPayoutCents(terms, milestone.views, 31.99)).toBe(
          Math.round(milestone.amountCents * 0.65),
        );
        expect(sprintPayoutCents(terms, milestone.views, 32)).toBe(
          milestone.amountCents,
        );
      }
    });
  test("legacy campaign Tier A stays at 30%", () => {
    const terms = defaultCreatorSprintTerms();
    expect(
      campaignAudienceBands(terms).find((band) => band.tier === "A")
        ?.minimumPercent,
    ).toBe(30);
    expect(campaignHasAudienceBands(terms)).toBe(true);
    expect(campaignAudienceBands(terms).map(band => band.tier)).toEqual(['D', 'C', 'B', 'A']);
    expect(sprintPayoutCents(terms, terms.milestones[0].views, 30)).toBe(
      terms.milestones[0].amountCents,
    );
  });
});

describe("bonus eligibility estimates", () => {
  test('the bio-link bonus needs period verification, not exclusive posting, and keeps its payment identity', () => {
    const posts = [{ id: 'post', approvedAmountCents: 10000, adminViewCountThreshold: 20000, adminUsAudiencePercent: 30 }];
    expect(campaignBonusTargets(posts, false, new Map())).toEqual([]);
    expect(campaignBonusTargets(posts, true, new Map())).toEqual([{ subject: 'exclusivity:post', cents: 500, label: 'Link in bio bonus' }]);
  });
  test("Audience Excellence has five claims total, not one", () => {
    expect(audienceBonusClaimsRemaining(0)).toBe(5);
    expect(audienceBonusClaimsRemaining(1)).toBe(4);
    expect(audienceBonusClaimsRemaining(5)).toBe(0);
    expect(audienceBonusClaimsRemaining(6)).toBe(0);
    expect(audienceBonusClaimsRemaining(-1)).toBe(5);
  });
  test("the audience bonus requires the same post to reach 100K views and reach 45% Tier 1", () => {
    expect(qualifiesAudienceBonus(99_999, 50)).toBe(false);
    expect(qualifiesAudienceBonus(100_000, 45)).toBe(true);
    expect(qualifiesAudienceBonus(100_000, 51.4)).toBe(true);
    expect(qualifiesAudienceBonus(100_001, 44.99)).toBe(false);
    expect(qualifiesAudienceBonus(100_001, 45)).toBe(true);
    expect(qualifiesAudienceBonus(Infinity, 45)).toBe(false);
    expect(qualifiesAudienceBonus(120_000, 101)).toBe(false);
  });
  test("exclusivity earns 5% of the base video payout, capped at $10 per video", () => {
    expect(exclusivityBonusCents(800)).toBe(40);
    expect(exclusivityBonusCents(10_000)).toBe(500);
    expect(exclusivityBonusCents(32_500)).toBe(1000);
    expect(exclusivityBonusCents(-100)).toBe(0);
  });
  test("conversion commission uses all attributed revenue once 150% is reached", () => {
    const conversion = {
      revenueCents: 14_999,
      paidAmountCents: 10_000,
      bioLinkVerified: true,
      captionCodeVerified: true,
    };
    expect(conversionBonusCents(conversion)).toBe(0);
    expect(conversionBonusCents({ ...conversion, revenueCents: 15_000 })).toBe(
      750,
    );
    expect(conversionBonusCents({ ...conversion, revenueCents: 20_000 })).toBe(
      1000,
    );
    expect(
      conversionBonusCents({
        ...conversion,
        revenueCents: 20_000,
        bioLinkVerified: false,
      }),
    ).toBe(0);
    expect(
      conversionBonusCents({
        ...conversion,
        revenueCents: 20_000,
        captionCodeVerified: false,
      }),
    ).toBe(0);
    expect(
      conversionBonusCents({
        ...conversion,
        revenueCents: 20_000,
        paidAmountCents: 0,
      }),
    ).toBe(0);
  });
});

test('specialist campaign review criteria retain saved element IDs and have specific labels', async () => {
  const { sprintReviewItems } = await import('./sprints')
  for (const key of ['detailed-analysis', 'feature-comparison']) {
    const campaign = LAUNCH_CAMPAIGNS.find(item => item.key === key)!
    const terms = launchCampaignTerms(campaign)
    const criteria = sprintReviewItems(terms, terms.formats[0].id).filter(item => item.id.startsWith('element-'))
    expect(criteria.map(item => item.id)).toEqual(['element-1', 'element-2', 'element-3'])
    expect(criteria.every(item => item.detail.length > 40)).toBe(true)
    expect(criteria[0].label).toContain(key === 'detailed-analysis' ? 'commenter or celebrity' : 'facial feature')
  }
})
