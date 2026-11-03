import { useState } from 'react'
import Image from 'next/image'
import { ArrowUpRight, Film } from 'lucide-react'
import { useSubmissionPostPreview } from './submission-post-preview'
import { sprintMoney } from '@/lib/creator/sprints'
import type { CreatorConversionVideo } from '@/lib/creator/conversion-report'
import styles from './creator-conversions.module.css'
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
function utc(value: string) { return new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`) }
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
export function CreatorConversionVideoCard({ video, showBonuses = false, periodLabel, onActivate, className }: { video: CreatorConversionVideo; showBonuses?: boolean; periodLabel?: string; onActivate?: () => void; className?: string }) {
  const returnPercent =
    video.paidAmountCents > 0
      ? (Math.max(0, video.direct.revenueCents) / video.paidAmountCents) *
        100
      : null;
  const reachedThreshold =
    returnPercent !== null && returnPercent >= 150;
  return (
    <article className={`${styles.video} ${className ?? ''}`} role={onActivate ? 'button' : undefined} tabIndex={onActivate ? 0 : undefined} aria-label={onActivate ? `View conversion details for ${video.title}` : undefined} onClick={onActivate} onKeyDown={onActivate ? event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onActivate() } } : undefined}>
      <header>
        <PostPreview video={video} />
        <div>
          <h3>{video.title}</h3>
          <p>{video.postedAt ? "Posted" : "Submitted"} <time dateTime={video.postedAt ?? video.submittedAt}>{date.format(utc(video.postedAt ?? video.submittedAt))}</time></p>
          {!periodLabel ? <p>{video.attributionExpiresAt && utc(video.attributionExpiresAt).getTime() > Date.now()
            ? `Tracking until ${date.format(utc(video.attributionExpiresAt))}`
            : "48-hour window ended"}</p> : null}
        </div>
        {onActivate ? <ArrowUpRight size={15} aria-hidden="true" /> : video.postUrl ? (
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
        {periodLabel ? `${number(video.direct.conversions)} direct · ${number(video.estimated.conversions)} estimated conversions` : `${number(video.direct.linkPresses)} direct · ${number(video.estimated.linkPresses)} estimated link presses`}
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
}
