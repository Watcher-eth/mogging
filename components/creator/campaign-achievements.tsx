import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import {
  EMPTY_CAMPAIGN_BONUS_PROGRESS,
  AUDIENCE_BONUS_MAX_CLAIMS,
  audienceBonusClaimsRemaining,
  qualifiesAudienceBonus,
  type CampaignBonusProgress,
} from "@/lib/creator/campaign-bonuses";
import styles from "./campaign-achievements.module.css";

type Achievement = {
  key: string;
  title: string;
  reward: string;
  requirement: string;
  value: string;
  caption: string;
  qualified: boolean;
};

function Progress({ achievement }: { achievement: Achievement }) {
  return (
    <div className={styles.progress}>
      <strong>{achievement.value}</strong>
      <span>{achievement.caption}</span>
    </div>
  );
}

export function CampaignAchievements({
  progress = EMPTY_CAMPAIGN_BONUS_PROGRESS,
  conversionsHref = "/creator/conversions",
}: {
  progress?: CampaignBonusProgress;
  conversionsHref?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.1 });
  const reduced = useReducedMotion();
  const qualifiedAudience =
    !!progress.audience &&
    qualifiesAudienceBonus(
      progress.audience.views,
      progress.audience.tier1Percent,
    );
  const audienceRemaining = audienceBonusClaimsRemaining(
    progress.audienceAwards,
  );
  const conversion = progress.conversions;
  const conversionPercent =
    conversion && conversion.paidAmountCents > 0
      ? (conversion.revenueCents / conversion.paidAmountCents) * 100
      : null;
  const conversionQualified =
    conversionPercent !== null &&
    conversionPercent >= 150 &&
    !!conversion?.bioLinkVerified &&
    !!conversion.captionCodeVerified;
  const achievements: Achievement[] = [
    {
      key: "audience",
      title: "Audience excellence",
      reward: "$10 · up to 5 times",
      requirement:
        "Reach 45%+ Tier 1 audience on a post with more than 100K views. Claim this bonus up to 5 times total.",
      value: `$${(AUDIENCE_BONUS_MAX_CLAIMS - audienceRemaining) * 10} / $${AUDIENCE_BONUS_MAX_CLAIMS * 10}`,
      caption:
        progress.audienceQualifyingPosts > progress.audienceAwards &&
        audienceRemaining > 0
          ? "Ready for review"
          : `${audienceRemaining} claims left · $10 each`,
      qualified: qualifiedAudience && audienceRemaining > 0,
    },
    {
      key: "exclusive",
      title: "Link in bio bonus",
      reward: "+5% · up to $10 / video",
      requirement:
        "Keep your Mogging link in bio for the entire 30-day campaign. Paid at the end of the campaign month: 5% of each video payout, up to $10 per video.",
      value: "Up to $10 / video",
      caption: progress.exclusivity?.verified
        ? `${progress.exclusivity.eligibleVideos} eligible videos`
        : "Full month · paid at month-end",
      qualified: !!progress.exclusivity?.verified,
    },
    {
      key: "conversion",
      title: "Conversion bonus",
      reward: "5% commission",
      requirement:
        "Keep your link in bio and code in the caption. Once a video generates 150%+ of its paid payout in attributed revenue, earn 5% of all that revenue.",
      value: "5% · uncapped",
      caption:
        conversionPercent === null
          ? "Of qualifying attributed revenue"
          : `${Math.round(conversionPercent)}% / 150% revenue threshold`,
      qualified: conversionQualified,
    },
    {
      key: "million",
      title: "Million View Club",
      reward: "$15 · one-time",
      requirement:
        "Have 3 separate videos each reach 1 million views in this campaign.",
      value: `$${progress.millionViewVideos >= 3 ? 15 : 0} / $15`,
      caption: `${Math.min(progress.millionViewVideos, 3)} / 3 videos at 1M views`,
      qualified: progress.millionViewVideos >= 3,
    },
    {
      key: "decimillion",
      title: "Decimillion Club",
      reward: "$30 · one-time",
      requirement:
        "Have 10 separate videos each reach 1 million views in this campaign.",
      value: `$${progress.millionViewVideos >= 10 ? 30 : 0} / $30`,
      caption: `${Math.min(progress.millionViewVideos, 10)} / 10 videos at 1M views`,
      qualified: progress.millionViewVideos >= 10,
    },
  ];
  return (
    <section
      ref={sectionRef}
      data-visible={inView}
      className={styles.section}
      aria-labelledby="bonus-heading"
    >
      <header className={styles.heading}>
        <div>
          <span>Go a little further</span>
          <h2 id="bonus-heading">Eligible bonuses</h2>
        </div>
        <p>
          {achievements.filter((item) => item.qualified).length} / 5 qualified
        </p>
      </header>
      <div className={styles.rows}>
        {achievements.map((achievement, index) => (
          <motion.article
            initial={reduced ? false : { opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{
              duration: reduced ? 0 : 0.24,
              delay: reduced ? 0 : index * 0.025,
            }}
            key={achievement.key}
            className={styles.row}
            data-qualified={achievement.qualified}
          >
            <div className={styles.badge} aria-hidden="true">
              <Image
                src={`/creator/achievements/${achievement.key === "audience" ? "audience-globe" : achievement.key === "conversion" ? "conversion-target" : achievement.key}.png`}
                alt=""
                width={100}
                height={100}
                sizes="100px"
              />
            </div>
            <div className={styles.copy}>
              <div className={styles.title}>
                <h3>{achievement.title}</h3>
                {achievement.key === "conversion" ? (
                  <ArrowUpRight
                    size={13}
                    className={styles.linkArrow}
                    aria-hidden="true"
                  />
                ) : null}
                <span>{achievement.reward}</span>
              </div>
              <p>{achievement.requirement}</p>
            </div>
            <Progress achievement={achievement} />
            {achievement.key === "conversion" ? (
              <Link
                href={conversionsHref}
                className={styles.rowLink}
                aria-label="View video conversions"
              />
            ) : null}
          </motion.article>
        ))}
      </div>
      <p className={styles.note}>
        Progress shows qualification, not a payment. Bonus eligibility is
        verified before an award.
      </p>
    </section>
  );
}
