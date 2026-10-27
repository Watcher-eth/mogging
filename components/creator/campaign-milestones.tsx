import type { CSSProperties } from 'react'
import { sprintMoney, sprintPayoutCents, sprintViews, type SprintTerms } from '@/lib/creator/sprints'
import styles from './launch-campaign-detail.module.css'
const metals = ['#cd8b55', '#c6d0de', '#edc963', '#a5efff']
/** Shared by the campaign page and support explanations; all rates use the same calculator. */
export function CampaignMilestoneStrip({ terms, audiencePercent, views }: { terms: SprintTerms; audiencePercent: number; views?: number | null }) {
  const reached = views == null ? null : terms.milestones.findLast(m => views >= m.views)?.views
  return <ol className={styles.paymentStrip} aria-label="Campaign view milestones">{terms.milestones.map((item, index, milestones) => <li key={item.views} data-reached={reached === item.views || undefined} aria-current={reached === item.views ? 'step' : undefined} style={{ '--milestone-color': metals[Math.round(index / Math.max(1, milestones.length - 1) * (metals.length - 1))] } as CSSProperties}>
    <span className={styles.milestoneDot} /><strong>{sprintMoney(sprintPayoutCents(terms, item.views, audiencePercent))}</strong><span>{sprintViews(item.views)} views</span>
  </li>)}</ol>
}
