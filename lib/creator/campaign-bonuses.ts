export type CampaignBonusProgress = {
  audience: { views: number; tier1Percent: number } | null;
  exclusivity: { verified: boolean; eligibleVideos: number } | null;
  conversions: {
    revenueCents: number;
    paidAmountCents: number;
    bioLinkVerified: boolean;
    captionCodeVerified: boolean;
  } | null;
  millionViewVideos: number;
  audienceAwards: number;
  audienceQualifyingPosts: number;
};

export const EMPTY_CAMPAIGN_BONUS_PROGRESS: CampaignBonusProgress = {
  audience: null,
  exclusivity: null,
  conversions: null,
  millionViewVideos: 0,
  audienceAwards: 0,
  audienceQualifyingPosts: 0,
};

export const AUDIENCE_BONUS_MAX_CLAIMS = 5;

export function audienceBonusClaimsRemaining(awards: number) {
  return Number.isSafeInteger(awards) && awards >= 0
    ? Math.max(0, AUDIENCE_BONUS_MAX_CLAIMS - awards)
    : AUDIENCE_BONUS_MAX_CLAIMS;
}

export function qualifiesAudienceBonus(views: number, tier1Percent: number) {
  return (
    Number.isSafeInteger(views) &&
    views > 100_000 &&
    Number.isFinite(tier1Percent) &&
    tier1Percent >= 45 &&
    tier1Percent <= 100
  );
}

function validCents(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Eligibility estimates only. A qualified achievement does not record or send a payment.
export function exclusivityBonusCents(basePayoutCents: number) {
  return validCents(basePayoutCents)
    ? Math.min(Math.round(basePayoutCents * 0.05), 1_000)
    : 0;
}

export function conversionBonusCents(
  conversion: NonNullable<CampaignBonusProgress["conversions"]>,
) {
  const {
    revenueCents,
    paidAmountCents,
    bioLinkVerified,
    captionCodeVerified,
  } = conversion;
  if (
    !bioLinkVerified ||
    !captionCodeVerified ||
    !validCents(revenueCents) ||
    !validCents(paidAmountCents) ||
    paidAmountCents === 0 ||
    revenueCents < paidAmountCents * 1.5
  )
    return 0;
  return Math.round(revenueCents * 0.05);
}

export type ApprovedBonusPost = {
  id: string;
  approvedAmountCents: number | null;
  adminViewCountThreshold: number | null;
  adminUsAudiencePercent: number | null;
};
export type BonusTarget = { subject: string; cents: number; label: string };

// Targets are cumulative entitlements. Payment records account for every prior
// increment, so rereviews and reconciliation only issue the unpaid difference.
export function campaignBonusTargets(posts: ApprovedBonusPost[], bioLinkVerified: boolean, conversions: Map<string, NonNullable<CampaignBonusProgress['conversions']>>) {
  const targets: BonusTarget[] = [];
  for (const post of posts) {
    if (qualifiesAudienceBonus(post.adminViewCountThreshold ?? 0, post.adminUsAudiencePercent ?? 0)) targets.push({ subject: `audience:${post.id}`, cents: 1_000, label: 'Audience excellence' });
    // Keep the existing award identity so the renamed bonus cannot pay twice.
    if (bioLinkVerified) targets.push({ subject: `exclusivity:${post.id}`, cents: exclusivityBonusCents(post.approvedAmountCents ?? 0), label: 'Link in bio bonus' });
    const conversion = conversions.get(post.id);
    if (conversion) targets.push({ subject: `conversion:${post.id}`, cents: conversionBonusCents(conversion), label: 'Conversion bonus' });
  }
  const millionPosts = posts.filter(post => (post.adminViewCountThreshold ?? 0) >= 1_000_000).length;
  if (millionPosts >= 3) targets.push({ subject: 'million', cents: 1_500, label: 'Million View Club' });
  if (millionPosts >= 10) targets.push({ subject: 'decimillion', cents: 3_000, label: 'Decimillion Club' });
  return targets.filter(target => target.cents > 0);
}
