import { BadgeCheck, Check, CheckCircle2, CircleDollarSign, Clock3, Download, Eye, Link2, ListChecks, Percent, Sparkles, Users, Wallet, X } from 'lucide-react'
import { highlightedFactParts, type InlineFactKind } from '@/lib/creator/support/inline-facts'
import styles from './support-chat.module.css'

const facts = {
  views: { icon: Eye, tone: 'indigo', label: 'Views' },
  downloads: { icon: Download, tone: 'blue', label: 'Downloads' },
  conversions: { icon: BadgeCheck, tone: 'teal', label: 'Conversions' },
  revenue: { icon: Wallet, tone: 'green', label: 'Attributed revenue' },
  money: { icon: CircleDollarSign, tone: 'green', label: 'Amount' },
  bonus: { icon: Sparkles, tone: 'amber', label: 'Bonus' },
  audience: { icon: Users, tone: 'violet', label: 'Audience percentage' },
  percentage: { icon: Percent, tone: 'violet', label: 'Percentage' },
  clicks: { icon: Link2, tone: 'blue', label: 'Link presses' },
  referrals: { icon: Users, tone: 'violet', label: 'Referrals' },
  submissions: { icon: ListChecks, tone: 'indigo', label: 'Submissions' },
  review: { icon: Clock3, tone: 'amber', label: 'Awaiting review' },
  approved: { icon: CheckCircle2, tone: 'green', label: 'Approved' },
  paid: { icon: Check, tone: 'teal', label: 'Paid' },
  rejected: { icon: X, tone: 'rose', label: 'Rejected' },
  checks: { icon: ListChecks, tone: 'indigo', label: 'Requirements' },
} satisfies Record<InlineFactKind, { icon: typeof Eye; tone: string; label: string }>

export function SupportResponseText({ text }: { text: string }) {
  return <>{highlightedFactParts(text).map((part, index) => {
    if (!part.kind) return part.text
    const fact = facts[part.kind]
    const Icon = fact.icon
    return <span key={index} className={styles.factPill} data-tone={fact.tone} title={fact.label}><span className={styles.factIcon} aria-hidden="true"><Icon size={11} strokeWidth={2.2} /></span>{part.text}</span>
  })}</>
}
