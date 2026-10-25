import { useState } from "react";
import Image from "next/image";
import { useSubmissionPostPreview } from "./submission-post-preview";
import {
  ArrowUpRight,
  Film,
  Search,
  TrendingUp,
} from "lucide-react";
import { AnalyticsChart, chartColors } from "@/components/admin/analytics-chart";
import { CreatorHeader } from "./creator-shell";
import { sprintMoney } from "@/lib/creator/sprints";
import type { CreatorConversionReport, CreatorConversionVideo } from "@/lib/creator/conversion-report";
import styles from "./creator-conversions.module.css";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format;
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function utc(value: string) {
  return new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}
function PostPreview({ video }: { video: CreatorConversionVideo }) {
  const { ref, preview } = useSubmissionPostPreview<HTMLSpanElement>(video);
  const [failed, setFailed] = useState<string | null>(null);
  const source = preview?.thumbnailUrl;
  return <span ref={ref} className={styles.postPreview} aria-hidden="true">
    {source && source !== failed
      ? <Image src={source} alt="" fill sizes="44px" unoptimized referrerPolicy="no-referrer" onError={() => setFailed(source)} />
      : <Film size={17} />}
  </span>;
}
function EmptyConversionChart() {
  return (
    <div className={styles.chartSkeleton}>
      <svg viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
        <path className={styles.skeletonGrid} d="M0 45H1000 M0 110H1000 M0 175H1000 M0 240H1000" />
        <path className={styles.skeletonLine} pathLength="1" d="M0 210C85 210 90 165 170 175S265 205 340 150S425 175 500 110S600 145 690 80S810 100 880 55S950 40 1000 25" />
        <path className={styles.skeletonLine} pathLength="1" d="M0 225C100 225 115 205 190 210S300 180 390 190S490 150 590 158S710 120 800 125S910 90 1000 88" />
        <path className={styles.skeletonLine} pathLength="1" d="M0 240C120 240 160 232 260 235S380 215 480 222S600 190 710 198S870 165 1000 168" />
      </svg>
      <p>Your chart starts with your first tracked visit.</p>
    </div>
  );
}

export function CreatorConversions({ report, showBonuses = report.bonusesAvailable }: { report: CreatorConversionReport; showBonuses?: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(["linkPresses", "downloads", "conversions"]);
  function toggleMetric(key: string) {
    setSelected(current => {
      if (key === "revenue" || current.includes("revenue")) return [key];
      if (!current.includes(key)) return [...current, key];
      return current.length > 1 ? current.filter(item => item !== key) : current;
    });
  }
  const metrics = [
    { key: "linkPresses", label: "Link presses", color: chartColors.blue, value: number(report.totals.linkPresses) },
    { key: "downloads", label: "Downloads", color: chartColors.violet, value: number(report.totals.downloads) },
    { key: "conversions", label: "Conversions", color: chartColors.green, value: number(report.totals.conversions) },
    { key: "revenue", label: "Revenue", color: chartColors.orange, value: sprintMoney(report.totals.revenueCents) },
  ];
  const selectedMetric = metrics.filter(item => selected.includes(item.key));
  const firstDay = report.daily.at(0)?.day;
  const lastDay = report.daily.at(-1)?.day;
  const days = firstDay && lastDay ? Math.max(7, (Date.parse(lastDay) - Date.parse(firstDay)) / 86_400_000 + 1) : 7;
  const videos = report.videos
    .filter((video) => video.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.conversions - a.conversions);
  return (
    <div className={styles.page}>
      <CreatorHeader
        eyebrow="Your impact"
        title="Conversions"
        description="See what turns views into action. Use these insights to improve your next post."
      />
      <section className={styles.chartSection} aria-label="Content performance over time">
        <div className={styles.legend} aria-label="Choose a chart metric">
          {metrics.map(item => (
            <button key={item.key} type="button" aria-pressed={selected.includes(item.key)} onClick={() => toggleMetric(item.key)}>
              <span className={styles.legendDot} style={{ background: item.color }} />
              <strong>{item.value}</strong> {item.label}
            </button>
          ))}
        </div>
        <div className={styles.chart}>
          {report.daily.length ? (
            <AnalyticsChart key={selected.join(",")} rows={report.daily} metrics={selectedMetric} days={days} fitToData timeZone="UTC"
              currency={selected.includes("revenue") ? "USD" : undefined} title="Daily content performance" />
          ) : <EmptyConversionChart />}
        </div>
        <p className={styles.chartCaption}>Daily activity · All time · UTC</p>
      </section>
      {showBonuses ? <section className={styles.conversionBrief}>
        <Image className={styles.referralArtwork} src="/creator/achievements/referral-five-percent.png" alt="" width={112} height={112} sizes="112px" />
        <div>
          <h2>Earn a % of your referrals.</h2>
          <p>
            When direct revenue reaches 150% of your video’s paid payout, earn 5%
            of all verified attributed revenue. Mogging link in bio and code in caption required.
          </p>
        </div>
      </section> : null}
      <section id="conversions" className={styles.videoSection} aria-label="Videos ranked by conversions">
        <label className={styles.search}>
          <Search size={14} />
          <input
            id="creator-conversion-search"
            aria-label="Find a video"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a video"
          />
        </label>
        {videos.length ? (
          <div className={styles.videos}>
            {videos.map((video) => {
              const returnPercent =
                video.paidAmountCents > 0
                  ? (Math.max(0, video.direct.revenueCents) / video.paidAmountCents) *
                    100
                  : null;
              const reachedThreshold =
                returnPercent !== null && returnPercent >= 150;
              return (
                <article key={video.id} className={styles.video}>
                  <header>
                    <PostPreview video={video} />
                    <div>
                      <h3>{video.title}</h3>
                      <p>{video.postedAt ? "Posted" : "Submitted"} <time dateTime={video.postedAt ?? video.submittedAt}>{date.format(utc(video.postedAt ?? video.submittedAt))}</time></p>
                      <p>{video.attributionExpiresAt && utc(video.attributionExpiresAt).getTime() > Date.now()
                        ? `Tracking until ${date.format(utc(video.attributionExpiresAt))}`
                        : "48-hour window ended"}</p>
                    </div>
                    {video.postUrl ? (
                      <a
                        href={video.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${video.title}`}
                      >
                        <ArrowUpRight size={16} />
                      </a>
                    ) : null}
                  </header>
                  <dl>
                    {[
                      ["Link presses", number(video.linkPresses)],
                      ["Downloads", number(video.downloads)],
                      ["Conversions", number(video.conversions)],
                      ["Revenue", sprintMoney(video.revenueCents)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={styles.attributionSplit}>
                    {number(video.direct.linkPresses)} direct · {number(video.estimated.linkPresses)} estimated link presses
                  </p>
                  {showBonuses ? <footer>
                    <div>
                      <span>Direct revenue return</span>
                      <strong>
                        {returnPercent === null
                          ? "Awaiting video payout"
                          : `${Math.round(returnPercent)}% / 150%`}
                      </strong>
                    </div>
                    <div
                      className={styles.track}
                      role="progressbar"
                      aria-label={`${video.title} revenue return`}
                      aria-valuemin={0}
                      aria-valuemax={150}
                      aria-valuenow={Math.min(
                        150,
                        Math.round(returnPercent ?? 0),
                      )}
                    >
                      <span
                        style={{
                          width: `${Math.min(100, ((returnPercent ?? 0) / 150) * 100)}%`,
                        }}
                      />
                    </div>
                    <p>
                      {reachedThreshold
                        ? "Revenue threshold reached · Link-in-bio and caption-code verification required before a bonus is awarded."
                        : returnPercent === null
                          ? "A paid video payout is needed to calculate the 150% revenue target."
                          : `Paid video payout: ${sprintMoney(video.paidAmountCents)} · Target revenue: ${sprintMoney(Math.ceil(video.paidAmountCents * 1.5))}`}
                    </p>
                  </footer> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <TrendingUp size={23} />
            <h3>
              {search
                ? "No matching videos"
                : "Your next post could start something."}
            </h3>
            <p>
              {search
                ? "Try a different title."
                : "Your submitted videos and their tracked conversions will appear here."}
            </p>
          </div>
        )}
      </section>
      <section className={styles.accountActivity}>
        <div>
          <h2>Unassigned activity</h2>
          <p>
            Included in your totals. Traffic outside a video’s 48-hour window or without a matching account stays here.
          </p>
        </div>
        <div>
          <span>{number(report.unassigned.linkPresses)} link presses</span>
          <span>{number(report.unassigned.downloads)} downloads</span>
          <span>{number(report.unassigned.conversions)} conversions</span>
          <span>{sprintMoney(report.unassigned.revenueCents)} revenue</span>
        </div>
      </section>
    </div>
  );
}
