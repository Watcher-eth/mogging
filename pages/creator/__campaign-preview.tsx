import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { CreatorConversions } from "@/components/creator/creator-conversions";
import {
  EMPTY_CREATOR_CONVERSION_REPORT,
  type CreatorConversionReport,
} from "@/lib/creator/conversion-report";
import { SessionContext } from "next-auth/react";
import {
  SWRConfig,
  type Middleware,
  type Key,
  type BareFetcher,
  type SWRConfiguration,
} from "swr";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CreatorShell } from "@/components/creator/creator-shell";
import { LaunchCampaignDetail } from "@/components/creator/launch-campaign-detail";
import {
  CAMPAIGN_LAUNCH_AT,
  LAUNCH_CONTENT_BUDGET_CENTS,
  LAUNCH_CAMPAIGNS,
  launchCampaignTerms,
} from "@/lib/creator/campaign-launch";
import type { CreatorSprint } from "@/lib/creator/sprints";

const previewData: Middleware =
  (useSWRNext) =>
  <Data, Error>(
    key: Key,
    _fetcher: BareFetcher<Data> | null,
    config: SWRConfiguration<Data, Error>,
  ) =>
    useSWRNext<Data, Error>(
      key,
      async () =>
        ({
          profile: null,
          submissions: [],
          payments: [],
          payoutRequests: [],
          updates: [],
          socialAccounts: [],
          featureFlags: {},
          communityMetrics: {},
        }) as Data,
      { ...config, revalidateOnFocus: false, shouldRetryOnError: false },
    );

const sampleConversionReport: CreatorConversionReport = {
  bonusesAvailable: true,
  daily: [
    { day: "2026-10-16", linkPresses: 12, downloads: 2, conversions: 0, revenue: 0 },
    { day: "2026-10-17", linkPresses: 21, downloads: 4, conversions: 1, revenue: 10 },
    { day: "2026-10-18", linkPresses: 18, downloads: 5, conversions: 1, revenue: 15 },
    { day: "2026-10-19", linkPresses: 36, downloads: 9, conversions: 2, revenue: 30 },
    { day: "2026-10-20", linkPresses: 28, downloads: 8, conversions: 1, revenue: 15 },
    { day: "2026-10-21", linkPresses: 45, downloads: 11, conversions: 3, revenue: 45 },
    { day: "2026-10-22", linkPresses: 61, downloads: 14, conversions: 3, revenue: 45 },
  ],
  totals: {
    linkPresses: 221,
    downloads: 53,
    conversions: 11,
    revenueCents: 16000,
  },
  unassigned: {
    linkPresses: 18,
    downloads: 5,
    conversions: 1,
    revenueCents: 800,
  },
  videos: [
    {
      id: "preview-analysis",
      title: "Facial harmony explained",
      platform: "TikTok",
      postUrl: null,
      linkPresses: 142,
      downloads: 36,
      conversions: 8,
      revenueCents: 12000,
      paidAmountCents: 7000,
      postedAt: "2026-10-23T17:00:00Z",
      submittedAt: "2026-10-23T17:15:00Z",
      attributionExpiresAt: "2026-10-25T17:15:00Z",
      direct: { linkPresses: 42, downloads: 10, conversions: 2, revenueCents: 3000 },
      estimated: { linkPresses: 100, downloads: 26, conversions: 6, revenueCents: 9000 },
    },
    {
      id: "preview-tips",
      title: "Small changes, a clearer picture",
      platform: "Instagram",
      postUrl: null,
      linkPresses: 61,
      downloads: 12,
      conversions: 2,
      revenueCents: 3200,
      paidAmountCents: 4000,
      postedAt: "2026-10-22T15:00:00Z",
      submittedAt: "2026-10-22T15:15:00Z",
      attributionExpiresAt: "2026-10-24T15:15:00Z",
      direct: { linkPresses: 11, downloads: 2, conversions: 0, revenueCents: 0 },
      estimated: { linkPresses: 50, downloads: 10, conversions: 2, revenueCents: 3200 },
    },
  ],
};

export default function CampaignPreview() {
  const router = useRouter();
  const showConversions = ["bonuses", "conversions"].includes(String(router.query.view));
  const [selected, setSelected] = useState(0);
  const [sampleProgress, setSampleProgress] = useState(false);
  const campaign = LAUNCH_CAMPAIGNS[selected];
  const sprint: CreatorSprint = {
    id: `private-preview-${campaign.key}`,
    name: campaign.name,
    description: campaign.description,
    status: "draft",
    budgetCents: LAUNCH_CONTENT_BUDGET_CENTS,
    usedCents: 0,
    startsAt: CAMPAIGN_LAUNCH_AT,
    endsAt: "2026-11-22T20:00:00.000Z",
    terms: launchCampaignTerms(campaign),
    counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
  };
  return (
    <SessionContext.Provider
      value={{
        data: {
          expires: "2099-01-01",
          user: { id: "", name: "Campaign preview" },
        },
        status: "authenticated",
        update: async () => null,
      }}
    >
      <Head>
        <title>Private campaign design preview</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <SWRConfig value={{ provider: () => new Map(), use: [previewData] }}>
        <SidebarProvider className="min-h-0 flex-1 flex-col">
          <CreatorShell>
            <div className="mb-7 rounded-2xl border border-dashed border-zinc-200 p-4">
              <p className="mb-3 text-[11px] text-zinc-500">
                Design preview only · No campaigns are published
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Preview campaign"
              >
                {LAUNCH_CAMPAIGNS.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selected === index}
                    onClick={() => setSelected(index)}
                    className={`min-h-10 rounded-full px-4 text-xs ${selected === index ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-500"}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4 flex gap-4 text-xs">
              <Link
                className="text-zinc-500 underline underline-offset-4"
                href="/creator/__campaign-preview"
              >
                Campaign preview
              </Link>
              <Link
                className="text-zinc-500 underline underline-offset-4"
                href="/creator/__campaign-preview?view=conversions"
              >
                Conversions preview
              </Link>
              {showConversions ? (
                <span className="text-zinc-400">
                  Illustrative tracking data only
                </span>
              ) : null}
            </div>
            <div className="mb-5 flex items-center justify-end gap-3 text-[11px] text-zinc-400">
              <span>
                {sampleProgress
                  ? "Illustrative progress only"
                  : "Preview starts with no activity"}
              </span>
              <button
                type="button"
                aria-pressed={sampleProgress}
                onClick={() => setSampleProgress((value) => !value)}
                className="min-h-9 rounded-full border border-zinc-200 px-3 text-zinc-600"
              >
                {sampleProgress ? "Reset progress" : "Show sample progress"}
              </button>
            </div>
            {showConversions ? (
              <CreatorConversions
                showBonuses
                report={
                  sampleProgress
                    ? sampleConversionReport
                    : EMPTY_CREATOR_CONVERSION_REPORT
                }
              />
            ) : (
              <LaunchCampaignDetail
                key={campaign.key}
                sprint={sprint}
                campaign={campaign}
                conversionsHref="/creator/__campaign-preview?view=conversions"
                bonusProgress={
                  sampleProgress
                    ? {
                        audience: { views: 125000, tier1Percent: 47 },
                        exclusivity: null,
                        conversions: null,
                        millionViewVideos: 2,
                        audienceAwards: 1,
                        audienceQualifyingPosts: 2,
                      }
                    : undefined
                }
              />
            )}
          </CreatorShell>
        </SidebarProvider>
      </SWRConfig>
    </SessionContext.Provider>
  );
}

export function getServerSideProps() {
  return process.env.NODE_ENV === "production"
    ? { notFound: true }
    : { props: {} };
}
