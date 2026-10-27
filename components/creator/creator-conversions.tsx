import { CreatorReferralsSection } from './creator-referrals'
import { useState } from "react";
import Image from "next/image";
import { CreatorConversionVideoCard } from "./conversion-video-card";
import {
  Search,
  TrendingUp,
} from "lucide-react";
import { AnalyticsChart, chartColors } from "@/components/admin/analytics-chart";
import { CreatorHeader } from "./creator-shell";
import { sprintMoney } from "@/lib/creator/sprints";
import type { CreatorConversionReport } from "@/lib/creator/conversion-report";
import styles from "./creator-conversions.module.css";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format;
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
            {videos.map(video => <CreatorConversionVideoCard key={video.id} video={video} showBonuses={showBonuses} />)}
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
      <CreatorReferralsSection />
    </div>
  );
}
