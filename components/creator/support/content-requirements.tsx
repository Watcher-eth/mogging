import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { CampaignRequirementList } from '@/components/creator/campaign-requirement-list'
import { CREATOR_SUBMISSION_FORMATS } from '@/lib/creator/formats'
import { SHARED_CONTENT_RESTRICTIONS } from '@/lib/creator/content-policy'
import { destinations } from '@/lib/creator/support/contracts'
import { relevantRequirementIds } from '@/lib/creator/support/requirement-focus'
import campaignStyles from '@/components/creator/launch-campaign-detail.module.css'
import styles from './support-chat.module.css'

export function SupportContentRequirements({ rulesOnly, question }: { rulesOnly: boolean; question: string }) {
  const [showAll, setShowAll] = useState(false)
  const format = CREATOR_SUBMISSION_FORMATS[0]
  const rows = rulesOnly ? SHARED_CONTENT_RESTRICTIONS.map((text, i) => ({ id: `restriction-${i}`, title: ['Truthful claims', 'Original content', 'Clear product footage', 'No engagement farms', 'Relevant captions', 'Excluded niches', 'Celebrity edits', 'Genuine analytics'][i], detail: text })) : [
    ...format.elements.map(item => ({ id: item.title, ...item })),
    ...format.requirements.map((text, i) => ({ id: `requirement-${i}`, title: ['Tag @moggingcom', 'Public and original', 'Connected account', 'Looks-focused content', 'Clear audience fit', 'Genuine engagement', 'Analytics recording'][i], detail: text })),
  ]
  const focusIds = relevantRequirementIds(question, rows)
  const destination = rulesOnly ? destinations.rules : destinations.video
  return <section className={styles.campaignContext} aria-label={rulesOnly ? 'General content rules' : 'General content requirements'}>
    <header><div className={campaignStyles.cardTitle}><ShieldCheck size={15} aria-hidden="true" /><h3>{rulesOnly ? 'Content rules' : 'Content requirements'}</h3></div><Link href={destination.href} aria-label={`Open ${destination.label}`}><ArrowUpRight size={15} /></Link></header>
    <CampaignRequirementList items={rows} focusIds={showAll ? [] : focusIds} compact />
    {focusIds.length ? <button className={styles.requirementsSource} type="button" onClick={() => setShowAll(v => !v)}>{showAll ? 'Focus relevant requirements' : 'Show all at full contrast'}</button> : null}
  </section>
}
