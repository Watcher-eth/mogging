export type CreatorConversionMetrics = {
  linkPresses: number;
  downloads: number;
  conversions: number;
  revenueCents: number;
};
/** Top-level video metrics include estimates. Financial qualification must use direct.revenueCents, never the blended total. */
export type CreatorConversionVideo = CreatorConversionMetrics & {
  /** Present only for an explicitly windowed report; never substitute lifetime metrics. */
  daily?: Array<{ day: string; linkPresses: number; downloads: number; conversions: number; revenue: number }>;
  id: string;
  title: string;
  platform: string;
  postUrl: string | null;
  paidAmountCents: number;
  postedAt: string | null;
  submittedAt: string;
  attributionExpiresAt: string | null;
  direct: CreatorConversionMetrics;
  estimated: CreatorConversionMetrics;
};
export type CreatorConversionReport = {
  bonusesAvailable: boolean;
  daily: Array<{ day: string; linkPresses: number; downloads: number; conversions: number; revenue: number }>;
  totals: CreatorConversionMetrics;
  unassigned: CreatorConversionMetrics;
  videos: CreatorConversionVideo[];
};
export const EMPTY_CREATOR_CONVERSION_REPORT: CreatorConversionReport = {
  bonusesAvailable: false,
  daily: [],
  totals: { linkPresses: 0, downloads: 0, conversions: 0, revenueCents: 0 },
  unassigned: { linkPresses: 0, downloads: 0, conversions: 0, revenueCents: 0 },
  videos: [],
};
