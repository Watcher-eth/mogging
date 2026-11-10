import { MoggingIcon } from '@/components/ui/mogging-icon'
import type { MoggingWebIconName } from '@/lib/design/mogging-web-glyphs'
import { highlightedFactParts, type InlineFactKind } from '@/lib/creator/support/inline-facts'
import styles from './support-chat.module.css'

const facts = {
  views: { icon: 'eyes', tone: 'indigo', label: 'Views' },
  downloads: { icon: 'download', tone: 'blue', label: 'Downloads' },
  conversions: { icon: 'verified', tone: 'teal', label: 'Conversions' },
  revenue: { icon: 'revenue', tone: 'green', label: 'Attributed revenue' },
  money: { icon: 'dollar', tone: 'green', label: 'Amount' },
  bonus: { icon: 'sparkles', tone: 'amber', label: 'Bonus' },
  audience: { icon: 'people', tone: 'violet', label: 'Audience percentage' },
  percentage: { icon: 'percent', tone: 'violet', label: 'Percentage' },
  clicks: { icon: 'link', tone: 'blue', label: 'Link presses' },
  referrals: { icon: 'share-nodes', tone: 'violet', label: 'Referrals' },
  submissions: { icon: 'submitted-video', tone: 'indigo', label: 'Submissions' },
  review: { icon: 'clock', tone: 'amber', label: 'Awaiting review' },
  approved: { icon: 'check-circle', tone: 'green', label: 'Approved' },
  paid: { icon: 'check', tone: 'teal', label: 'Paid' },
  rejected: { icon: 'close', tone: 'rose', label: 'Rejected' },
  checks: { icon: 'list-checks', tone: 'indigo', label: 'Requirements' },
} satisfies Record<InlineFactKind, { icon: MoggingWebIconName; tone: string; label: string }>

export function SupportResponseText({ text }: { text: string }) {
  return <>{highlightedFactParts(text).map((part, index) => {
    if (!part.kind) return part.text
    const fact = facts[part.kind]
    return <span key={index} className={styles.factPill} data-tone={fact.tone} title={fact.label}><span className={styles.factIcon} aria-hidden="true"><MoggingIcon name={fact.icon} size={11} strokeWidth={2.2} /></span>{part.text}</span>
  })}</>
}
