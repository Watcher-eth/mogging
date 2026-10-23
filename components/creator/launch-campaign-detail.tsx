import { CampaignBudget } from './campaign-budget'
import { ContentRestrictions } from './content-restrictions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { CampaignAchievements } from "./campaign-achievements";
import type { CampaignBonusProgress } from "@/lib/creator/campaign-bonuses";
import { SocialPlatformLogo } from "@/components/brand/social-platform-logo";
import { CampaignRegionHelp } from "@/components/creator/campaign-region-help";
import {
  campaignAudienceBands,
  campaignHasAudienceBands,
  campaignRegionRates,
} from "@/lib/creator/sprint-defaults";
import { creatorCampaignRules } from "@/lib/creator/post-guidance";
import {
  sprintMoney,
  sprintPayoutCents,
  sprintPhase,
  sprintViews,
  type CreatorSprint,
} from "@/lib/creator/sprints";
import type { LaunchCampaign } from "@/lib/creator/campaign-launch";
import styles from "./launch-campaign-detail.module.css";

const MILESTONE_METALS = ['#cd8b55', '#c6d0de', '#edc963', '#a5efff'];

function payoutMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function ExampleCarousel({ campaign }: { campaign: LaunchCampaign }) {
  const [active, setActive] = useState(0);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const touchStart = useRef<number | null>(null);
  const count = campaign.examples.length;
  function change(index: number) {
    setActive((index + count) % count);
  }
  useEffect(() => {
    for (const frame of frames.current.values())
      frame.contentWindow?.postMessage(
        { type: "pause", "x-tiktok-player": true },
        "https://www.tiktok.com",
      );
  }, [active]);
  return (
    <section
      className={styles.examples}
      aria-labelledby="campaign-examples-title"
    >
      <div className={styles.sectionHeading}>
        <span className={styles.eyebrow}>A little inspiration</span>
        <h2 id="campaign-examples-title">See the format in action.</h2>
      </div>
      <div
        className={styles.carousel}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${campaign.name} examples`}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (
            start !== null &&
            Math.abs(event.changedTouches[0].clientX - start) > 45
          )
            change(active + (event.changedTouches[0].clientX < start ? 1 : -1));
        }}
      >
        {campaign.examples.map((example, index) => {
          let distance = (index - active + count) % count;
          if (distance > count / 2) distance -= count;
          if (Math.abs(distance) > 2) return null;
          const id = example.url.split("/").at(-1);
          const selected = distance === 0;
          return (
            <div
              key={example.url}
              className={styles.videoCard}
              data-active={selected}
              style={
                {
                  "--position": distance,
                  "--depth": Math.abs(distance),
                  zIndex: 3 - Math.abs(distance),
                } as CSSProperties
              }
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${example.label}`}
              aria-hidden={!selected}
              inert={!selected}
            >
              <iframe
                ref={(frame) => {
                  if (frame) frames.current.set(index, frame);
                  else frames.current.delete(index);
                }}
                src={`https://www.tiktok.com/player/v1/${id}?autoplay=0&loop=0&description=0&music_info=0&rel=0`}
                title={`${campaign.name} — ${example.label}`}
                loading="lazy"
                allow="fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                tabIndex={selected ? 0 : -1}
              />
              {!selected ? <span className={styles.videoShade} /> : null}
            </div>
          );
        })}
        <button
          type="button"
          className={`${styles.carouselArrow} ${styles.previous}`}
          aria-label="Previous example"
          onClick={() => change(active - 1)}
        >
          <ChevronLeft size={21} />
        </button>
        <button
          type="button"
          className={`${styles.carouselArrow} ${styles.next}`}
          aria-label="Next example"
          onClick={() => change(active + 1)}
        >
          <ChevronRight size={21} />
        </button>
      </div>
      <div
        className={styles.exampleCaption}
        aria-live="polite"
        aria-atomic="true"
      >
        <a
          href={campaign.examples[active].url}
          target="_blank"
          rel="noreferrer"
        >
          View original post <ArrowRight size={14} />
        </a>
        <h3>{campaign.name}</h3>
        <p>{campaign.description}</p>
      </div>
      <div className={styles.dots} aria-label="Choose an example">
        {campaign.examples.map((example, index) => (
          <button
            key={example.url}
            type="button"
            aria-label={`Show example ${index + 1}: ${example.label}`}
            aria-current={index === active ? "true" : undefined}
            onClick={() => change(index)}
          >
            <span />
          </button>
        ))}
      </div>
    </section>
  );
}

export function LaunchCampaignDetail({
  sprint,
  campaign,
  bonusProgress,
  conversionsHref,
}: {
  sprint: CreatorSprint;
  campaign: LaunchCampaign;
  bonusProgress?: CampaignBonusProgress;
  conversionsHref?: string;
}) {
  const [audienceTier, setAudienceTier] = useState("A");
  const audienceBands = campaignAudienceBands(sprint.terms);
  const band = audienceBands.find((item) => item.tier === audienceTier)!;
  const format = sprint.terms.formats[0];
  const minimum = sprint.terms.milestones[0].views;
  const canSubmit =
    sprintPhase(sprint) === "active" && sprint.usedCents < sprint.budgetCents;
  const faqs = [
    [
      "When can I submit?",
      `Submit once your post reaches ${minimum.toLocaleString("en-US")} views while this campaign is active. Include a continuous analytics recording filmed with a second device so we can verify your post, views and audience.`,
    ],
    [
      "How are payouts calculated?",
      "The strip shows the total payout at each milestone, not an amount added for every milestone. Your verified views and Tier 1 audience determine the payout. Select an audience tier above to see the applicable rates.",
    ],
    [
      "Can the same post earn more later?",
      "Yes. When your post reaches a higher milestone, upload fresh analytics and request another review from Submissions. Previously paid earnings are accounted for so the same milestone is never paid twice.",
    ],
    [
      "Are videos and slideshows accepted?",
      "Yes. Use the format that works for your audience, follow this campaign’s brief, and keep the post public and original. The examples are inspiration; do not repost someone else’s content.",
    ],
    [
      "What happens after I submit?",
      "Your post and analytics are reviewed against the campaign requirements. Follow its progress in Submissions and look for review feedback in Updates. Approved earnings appear in Money.",
    ],
  ];
  return (
    <div className={styles.page}>
      <Link href="/creator/sprints" className={styles.back}>
        <ArrowLeft size={14} /> Active campaigns
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mogging creator campaigns</p>
          <h1>{sprint.name}</h1>
          <p className={styles.description}>{sprint.description}</p>
          <div className={styles.metadata}>
            <span>
              <Clock3 size={14} />
              30 days
            </span>
            <span className={styles.separator} />
            <span>
              <SocialPlatformLogo platform="tiktok" className="size-3.5" />
              <SocialPlatformLogo
                platform="instagram"
                className="size-3.5"
              />{" "}
              Videos & slideshows
            </span>
          </div>
        </div>
        <div className={styles.headerAction}>
          <div className={styles.headerBudget}>
            <span>Total Budget</span>
            <strong>{sprintMoney(sprint.usedCents + (sprint.bonusUsedCents ?? 0))}<span> / {sprintMoney(sprint.budgetCents + (sprint.terms.bonusBudgetCents ?? 0))}</span></strong>
          </div>
          {canSubmit ? (
            <Link
              className={styles.primaryButton}
              href={`/creator/submissions?new=1&sprint=${sprint.id}`}
            >
              Submit a post <ArrowRight size={16} />
            </Link>
          ) : null}
        </div>
      </header>
      <section className={styles.payments} aria-labelledby="payout-heading">
        <div className={styles.paymentHeading}>
          <h2 id="payout-heading">Your views, rewarded.</h2>
          <div className={styles.tierSelect}>
            <label htmlFor="campaign-audience">Audience tier</label>
            <div>
              <select
                id="campaign-audience"
                value={audienceTier}
                onChange={(event) => setAudienceTier(event.target.value)}
              >
                {[...audienceBands].reverse().map((item) => (
                  <option key={item.tier} value={item.tier}>
                    Tier {item.tier}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <CampaignRegionHelp terms={sprint.terms} monochrome />
          </div>
        </div>
        <ol className={styles.paymentStrip}>
          {sprint.terms.milestones.map((item, index, milestones) => (
            <li key={item.views} style={{ '--milestone-color': MILESTONE_METALS[Math.round(index / Math.max(1, milestones.length - 1) * (MILESTONE_METALS.length - 1))] } as CSSProperties}>
              <span className={styles.milestoneDot} />
              <strong>
                {payoutMoney(
                  sprintPayoutCents(
                    sprint.terms,
                    item.views,
                    band.minimumPercent,
                  ),
                )}
              </strong>
              <span>{sprintViews(item.views)} views</span>
            </li>
          ))}
        </ol>
      </section>
      <p className={styles.payoutTime}><Clock3 size={13} aria-hidden="true" />Average payout time 24hrs</p>
      <section
        className={styles.requirements}
        aria-labelledby="requirements-heading"
      >
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>The creative brief</span>
          <h2 id="requirements-heading">Make it yours. Hit the essentials.</h2>
        </div>
        <div className={styles.briefGrid}>
          <div className={styles.rulesCard}>
            <div className={styles.cardTitle}>
              <ShieldCheck size={17} />
              <h3>Content Requirements</h3>
            </div>
            <ol className={styles.timeline}>
              {format.elements.map((item, index) => (
                <li key={item.title}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.termsCard}>
            <div className={styles.cardTitle}>
              <CircleHelp size={17} />
              <h3>Rules</h3>
            </div>
            <ul>
              <li>
                <span>{campaignRegionRates(sprint.terms)}</span>
                {campaignHasAudienceBands(sprint.terms) ? (
                  <CampaignRegionHelp terms={sprint.terms} monochrome />
                ) : null}
              </li>
              {[
                "A continuous analytics recording filmed with a second device is required.",
                ...creatorCampaignRules(sprint.terms.rules),
              ].map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
              <li>
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="min-h-9 text-left underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900">Default rules apply</button>
                  </DialogTrigger>
                  <DialogContent className="creator-dialog max-h-[calc(100dvh-32px)] max-w-2xl overflow-y-auto p-6 sm:p-8">
                    <DialogHeader className="pr-6 text-left">
                      <DialogTitle className="creator-dialog-title">Default rules</DialogTitle>
                      <DialogDescription>These requirements and content restrictions apply to this campaign.</DialogDescription>
                    </DialogHeader>
                    <section className="mt-3 space-y-3 border-t border-zinc-100 pt-5">
                      <h3 className="text-sm font-semibold">Requirements</h3>
                      <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-zinc-600">
                        {creatorCampaignRules(format.requirements).map(rule => <li key={rule}>{rule}</li>)}
                      </ul>
                    </section>
                    <div className="mt-3"><ContentRestrictions rules={format.notAllowed} /></div>
                  </DialogContent>
                </Dialog>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <CampaignAchievements
        progress={bonusProgress}
        conversionsHref={conversionsHref}
      />
      <ExampleCarousel key={campaign.key} campaign={campaign} />
      <section className={styles.faq} aria-labelledby="faq-heading">
        <div>
          <span className={styles.eyebrow}>Good to know</span>
          <h2 id="faq-heading">
            A few answers
            <br />
            before you create.
          </h2>
          <p>Everything else? We’re here to help.</p>
        </div>
        <div className={styles.questions}>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={16} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <CampaignBudget sprint={sprint} />
      <footer className={styles.footer}>
        <span>
          <ShieldCheck size={16} />
          Create something worth sharing.
        </span>
        {canSubmit ? (
          <Link
            className={styles.primaryButton}
            href={`/creator/submissions?new=1&sprint=${sprint.id}`}
          >
            Submit a post <ArrowRight size={15} />
          </Link>
        ) : (
          <span>Opens October 23 · 12 pm Los Angeles</span>
        )}
      </footer>
    </div>
  );
}
