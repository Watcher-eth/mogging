import Link from 'next/link'
import Image from 'next/image'
import { useId, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import NumberFlow, { type Format } from '@number-flow/react'
import { TextShimmer } from '@/components/core/text-shimmer'
import { Clock3, Eye, Plus, Sparkles, Wallet } from 'lucide-react'
import { creatorOverviewMetrics } from '@/lib/creator/overview'
import { creatorAccountLabel, type CreatorDashboard, type CreatorSubmission, type CreatorSocialAccount } from './types'
import { CreatorAnchorTile } from './creator-anchor-tile'
import { CashStack, ReviewClock, ApprovalStamp, GoldCoin } from './overview-graphics'
import styles from './overview-bento.module.css'

const currencyFormat = (cents: number): Format => ({ style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 })
const number = (value: number) => new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)

export function OverviewBento({ data, onAccountSaved }: { data: CreatorDashboard; onAccountSaved: () => Promise<unknown> }) {
  const metrics = creatorOverviewMetrics(data)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { amount: 0.1 })
  return <div ref={ref} className={styles.grid} data-running={visible} aria-label="Your creator overview">
    <Link href="/creator/submissions" className={`${styles.tile} ${styles.views}`}>
      <div className={styles.topline}><span><Eye size={15} aria-hidden="true" />Views</span></div>
      <ViewsGraphic posts={metrics.posts} />
      <div className={styles.viewsBottom}><p className={styles.heroValue}><OverviewNumber value={metrics.views} order={0} format={{ notation: metrics.views >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }} /></p><p className={styles.description}>Across your submitted posts</p><div className={styles.chartFooter}><span>Latest post snapshots</span><span><OverviewNumber value={metrics.posts.length} order={1} /> {metrics.posts.length === 1 ? 'post' : 'posts'}</span></div></div>
    </Link>
    <Link href="/creator/money" className={`${styles.tile} ${styles.paid}`}>
      <div className={styles.topline}><span><Wallet size={15} aria-hidden="true" />Paid</span></div>
      <div className={styles.tileBottom}><p className={styles.value}><OverviewNumber value={metrics.paidCents / 100} order={1} format={currencyFormat(metrics.paidCents)} /></p><p className={styles.description}>Paid to you</p></div><div className={styles.visual}><CashStack /></div>
    </Link>
    <Link href="/creator/submissions" className={`${styles.tile} ${styles.review}`}>
      <div className={styles.topline}><span><Clock3 size={15} aria-hidden="true" />In review</span></div>
      <div className={styles.tileBottom}><p className={styles.value}><OverviewNumber value={metrics.inReview} order={2} /></p><p className={styles.description}>Active submissions</p></div><div className={styles.visual}><ReviewClock /></div>
    </Link>
    <Link href="/creator/submissions" className={`${styles.tile} ${styles.approved}`}>
      <div className={styles.topline}><span>Approved</span></div>
      <div className={styles.tileBottom}><p className={styles.value}><OverviewNumber value={metrics.approved} order={3} /></p><p className={styles.description}>Videos accepted</p></div><div className={styles.visual}><ApprovalStamp /></div>
    </Link>
    <Link href="/creator/accounts" className={`${styles.tile} ${styles.accounts}`}>
      <div className={styles.topline}><span>Accounts</span></div>
      <div className={styles.tileBottom}><p className={styles.value}><OverviewNumber value={data.socialAccounts.length} order={4} /></p></div>
      <div className={styles.avatars}>{data.socialAccounts.slice(0, 3).map(account => <ProfileAvatar key={`${account.id}:${account.avatarUrl}`} account={account} />)}{!data.socialAccounts.length ? <span className={styles.avatar}><Plus size={26} aria-hidden="true" /></span> : null}</div>
    </Link>
    <CreatorAnchorTile accounts={data.socialAccounts} onAccountSaved={onAccountSaved} />
    <Link href="/creator/money" className={`${styles.tile} ${styles.bonuses}`}>
      <div className={styles.topline}><span><Sparkles size={15} aria-hidden="true" />Bonuses</span><BonusEarned cents={metrics.bonusPaidCents} active={visible} /></div>
      <div className={styles.tileBottom}><p className={styles.value}><OverviewNumber value={metrics.bonusCents / 100} order={5} format={currencyFormat(metrics.bonusCents)} /></p><div className={styles.bonusFooter}><span><OverviewNumber value={metrics.bonusOutstandingCents / 100} order={6} format={currencyFormat(metrics.bonusOutstandingCents)} /> outstanding</span></div></div><div className={styles.visual}><GoldCoin /></div>
    </Link>
  </div>
}

function OverviewNumber({ value, order, format }: { value: number; order: number; format?: Format }) {
  const ref = useRef<HTMLSpanElement>(null)
  const entered = useInView(ref, { once: true, amount: 0.5 })
  const reduced = useReducedMotion()
  const timing = { duration: 1400, delay: order * 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' as const }
  return <span ref={ref} className={styles.number} aria-label={new Intl.NumberFormat('en-US', format).format(value)}><NumberFlow value={entered || reduced ? value : 0} format={format} locales="en-US" trend={1} animated={!reduced} transformTiming={timing} spinTiming={timing} opacityTiming={{ duration: 300, delay: order * 120 }} aria-hidden="true" /></span>
}

function BonusEarned({ cents, active }: { cents: number; active: boolean }) {
  const reduced = useReducedMotion()
  return <span className={styles.earned}><OverviewNumber value={cents / 100} order={6} format={currencyFormat(cents)} />{reduced || !active ? <span>earned</span> : <TextShimmer as="span" duration={3} className={`${styles.earnedShimmer} [--base-color:#5e3705] [--base-gradient-color:#fff4c5]`}>earned</TextShimmer>}</span>
}

function ProfileAvatar({ account }: { account: CreatorSocialAccount }) {
  const [failed, setFailed] = useState(false)
  const label = creatorAccountLabel(account)
  return <span className={styles.avatar} role="img" aria-label={label} title={label}><span aria-hidden="true">{(account.displayName || account.handle || 'M').replace('@', '').slice(0, 2).toUpperCase()}</span>{account.avatarUrl && !failed ? <Image src={account.avatarUrl} alt="" width={80} height={80} unoptimized onError={() => setFailed(true)} /> : null}</span>
}

function ViewsGraphic({ posts }: { posts: CreatorSubmission[] }) {
  const id = useId().replace(/:/g, '')
  const recent = posts.filter(post => typeof (post.adminViewCountThreshold ?? post.viewCountThreshold) === 'number').slice(-12)
  const values = recent.map(post => post.adminViewCountThreshold ?? post.viewCountThreshold ?? 0)
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => [16 + index * 368 / Math.max(1, values.length - 1), 140 - value / max * 112])
  const line = points.map(([x, y], index) => index ? `C${(points[index - 1][0] + x) / 2},${points[index - 1][1]} ${(points[index - 1][0] + x) / 2},${y} ${x},${y}` : `M${x},${y}`).join(' ')
  const area = points.length > 1 ? `${line} L384,154 L16,154 Z` : ''
  return <figure className={styles.chart} aria-label={values.length ? `Latest ${values.length} post view counts: ${values.map(number).join(', ')}` : 'Your post views will appear here'}>
    <svg viewBox="0 0 400 165" role="img" aria-hidden="true" preserveAspectRatio="none"><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#478bff" stopOpacity=".28" /><stop offset="1" stopColor="#478bff" stopOpacity="0" /></linearGradient></defs><path d="M0 35H400M0 90H400M0 145H400" stroke="#dfe7f1" strokeWidth="1" strokeDasharray="3 7" />{area ? <path d={area} fill={`url(#${id})`} /> : null}{points.length > 1 ? <path className={styles.chartLine} d={line} fill="none" stroke="#2869e8" strokeWidth="3" strokeLinecap="round" pathLength="1" /> : null}{points.map(([x, y], index) => <circle key={recent[index].id} cx={x} cy={y} r="4" fill="#2869e8" stroke="#fff" strokeWidth="3"><title>{recent[index].title}: {number(values[index])} views</title></circle>)}</svg>
    {!values.length ? <figcaption className={styles.chartEmpty}>Your reach starts with your first post.</figcaption> : null}
  </figure>
}
