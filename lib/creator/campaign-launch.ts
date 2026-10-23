import { CREATOR_SUBMISSION_FORMATS } from "./formats";
import { campaignAudienceRates } from "./sprint-defaults";
import { CREATOR_CTA_GUIDANCE } from "./post-guidance";
import type { SprintTerms } from "./sprints";

// Noon in Los Angeles on October 23 is PDT (UTC−7).
export const LAUNCH_CONTENT_BUDGET_CENTS = 250_000;
export const LAUNCH_BONUS_BUDGET_CENTS = 50_000;
export const CAMPAIGN_LAUNCH_AT = "2026-10-23T19:00:00.000Z";
export type LaunchCampaign = {
  key: string;
  name: string;
  description: string;
  milestones: SprintTerms["milestones"];
  contentRules: { title: string; detail: string }[];
  examples: { url: string; label: string }[];
};
export const LAUNCH_CAMPAIGNS: LaunchCampaign[] = [
  {
    key: "detailed-analysis",
    name: "Mogging Detailed Analysis",
    description:
      "Build a clear, detailed breakdown of facial features and show how Mogging helps viewers understand their own.",
    milestones: [
      {
        views: 5000,
        amountCents: 800,
      },
      {
        views: 50000,
        amountCents: 4000,
      },
      {
        views: 100000,
        amountCents: 7000,
      },
      {
        views: 300000,
        amountCents: 12000,
      },
      {
        views: 500000,
        amountCents: 18000,
      },
      {
        views: 1000000,
        amountCents: 32500,
      },
    ],
    contentRules: [
      {
        title: "Select a face to analyse",
        detail:
          "Choose a commenter or a celebrity. Use a clear photo where the face and the features you want to discuss are easy to see, and introduce whose face you are analysing.",
      },
      {
        title: "Create a mock report",
        detail:
          "Open Mock Reports in CTA Studio and create a report for your chosen face. Show the relevant report sections alongside the face so viewers can connect the analysis to what they see.",
      },
      {
        title: "Explain specific features with a voice-over",
        detail:
          "Use a voice-over to analyse one or more specific features or report categories, such as the eye area, jaw and chin, cheekbones, or facial harmony. Explain what stands out and why. For example, use guide lines to highlight eye spacing or facial proportions, then connect the observation to the matching report detail. Go beyond reading a score: help viewers understand what they are seeing.",
      },
    ],
    examples: [
      {
        url: "https://www.tiktok.com/@themysteriousone099/video/7671344286583033110",
        label: "@themysteriousone099",
      },
      {
        url: "https://www.tiktok.com/@faceiq2/video/7560856634847743287",
        label: "@faceiq2",
      },
      {
        url: "https://www.tiktok.com/@beyondermatology/video/7696959440586575117",
        label: "@beyondermatology",
      },
      {
        url: "https://www.tiktok.com/@beyondermatology/video/7653843374595640590",
        label: "@beyondermatology",
      },
    ],
  },
  {
    key: "feature-comparison",
    name: "Face Feature Comparison",
    description:
      "Analyse or highlight specific facial features through edits, education, detailed breakdowns, or improvement-focused content.",
    milestones: [
      {
        views: 20000,
        amountCents: 1250,
      },
      {
        views: 40000,
        amountCents: 2500,
      },
      {
        views: 100000,
        amountCents: 4000,
      },
      {
        views: 500000,
        amountCents: 8500,
      },
      {
        views: 1000000,
        amountCents: 15000,
      },
    ],
    contentRules: [
      {
        title: "Focus on specific facial features",
        detail:
          "Analyse or highlight one or more facial features of a person in detail, such as their eyes, jawline, chin, cheekbones, or facial proportions. Make the feature the clear focus of the post; comparing two people is optional.",
      },
      {
        title: "Choose your approach",
        detail:
          "Create a feature-focused edit, an educational explanation, a facial analysis, or content about how to improve the feature’s appearance. Choose the format that communicates your idea best, using visuals, text, or narration to bring attention to the feature.",
      },
      {
        title: "Make the detail easy to follow",
        detail:
          "Use close-ups, clear framing, on-screen labels, or commentary to show exactly what viewers should notice. If you compare faces, use similar angles and identify the feature being compared. Keep the edit or explanation centred on that feature.",
      },
    ],
    examples: [
      {
        url: "https://www.tiktok.com/@brayn6378/video/7699064861006810400",
        label: "@brayn6378",
      },
      {
        url: "https://www.tiktok.com/@glow.kaciey/photo/7699644724407209246",
        label: "Educational slideshow",
      },
      {
        url: "https://www.tiktok.com/@av2nd4/video/7692056432144960820",
        label: "@av2nd4",
      },
      {
        url: "https://www.tiktok.com/@brayn6378/video/7699161191377128736",
        label: "@brayn6378",
      },
      {
        url: "https://www.tiktok.com/@erwin_0058/video/7693712458355182856",
        label: "@erwin_0058",
      },
      {
        url: "https://www.tiktok.com/@pain.psl/video/7696565505318161666",
        label: "@pain.psl",
      },
      {
        url: "https://www.tiktok.com/@rined1ts/video/7690459013187636494",
        label: "@rined1ts",
      },
      {
        url: "https://www.tiktok.com/@lchwskedits/video/7691341229669371188",
        label: "@lchwskedits",
      },
      {
        url: "https://www.tiktok.com/@pedrocasxs/video/7698764501147061524",
        label: "@pedrocasxs",
      },
    ],
  },
  {
    key: "general-looksmaxxing",
    name: "General Looksmaxxing Content",
    description:
      "Create original looksmaxxing content with a useful takeaway and a clear Mogging product moment.",
    milestones: [
      {
        views: 20000,
        amountCents: 800,
      },
      {
        views: 50000,
        amountCents: 2250,
      },
      {
        views: 100000,
        amountCents: 3000,
      },
      {
        views: 500000,
        amountCents: 6000,
      },
      {
        views: 1000000,
        amountCents: 11000,
      },
    ],
    contentRules: [
      {
        title: "Create looksmaxxing-focused content",
        detail:
          "Follow the broad looksmaxxing style of our previous campaign: appearance-focused tips, glow-up content, routines, transformations, or relatable looksmaxxing stories. Keep the topic clearly connected to improving or understanding appearance.",
      },
      {
        title: "Follow the edit restrictions",
        detail:
          "No Tom Welling or celebrity movie edits, cartoons, or anime. Marlon content is allowed.",
      },
      {
        title: "Connect Mogging to the topic",
        detail:
          "Make Mogging part of the tip, transformation, or story you are sharing. Use a relevant product moment and the required CTA so viewers understand how the app connects to your content.",
      },
    ],
    examples: [
      {
        url: "https://www.tiktok.com/@xeyynn1/video/7697742447404731681",
        label: "Marlon",
      },
      {
        url: "https://www.tiktok.com/@glowuptips.ken/photo/7692507048977714452",
        label: "Glow up tips \u00b7 slideshow",
      },
    ],
  },
];

export function launchCampaign(terms: SprintTerms) {
  return LAUNCH_CAMPAIGNS.find((campaign) =>
    terms.formats?.some((format) => format.id === `launch-${campaign.key}-v1`),
  );
}

export function hasLaunchCampaignBonuses(post: { sprintId?: string | null; sprintTerms?: SprintTerms | null }) {
  return Boolean(post.sprintId && post.sprintTerms?.bonusBudgetCents && launchCampaign(post.sprintTerms));
}

export function launchCampaignTerms(campaign: LaunchCampaign): SprintTerms {
  const base = CREATOR_SUBMISSION_FORMATS[0];
  return {
    milestones: campaign.milestones.map((item) => ({
      ...item,
      audienceRates: campaignAudienceRates(item.amountCents, 32, 15),
    })),
    bonusBudgetCents: LAUNCH_BONUS_BUDGET_CENTS,
    minimumTier1Percent: 15,
    maximumTier1Percent: 40,
    platforms: ["tiktok", "instagram"],
    rules: [`${CREATOR_CTA_GUIDANCE.slice(0, -1)} and tag @moggingcom.`],
    formats: [
      {
        ...base,
        id: `launch-${campaign.key}-v1`,
        name: campaign.name,
        shortDescription: campaign.description,
        elements: campaign.contentRules.map((item) => ({ ...item })),
        requirements: [...base.requirements],
        notAllowed: [...base.notAllowed],
      },
    ],
  };
}
