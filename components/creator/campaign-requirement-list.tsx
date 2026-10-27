import styles from './launch-campaign-detail.module.css'
import compactStyles from './campaign-requirement-list.module.css'

export type CampaignRequirement = { id: string; title: string; detail?: string }

/** The campaign creative-brief timeline, also used by support. */
export function CampaignRequirementList({ items, focusIds = [], compact = false }: { items: CampaignRequirement[]; focusIds?: string[]; compact?: boolean }) {
  return <ol className={`${styles.timeline} ${compact ? compactStyles.compact : ''}`}>
    {items.map((item, index) => {
      const focused = focusIds.includes(item.id)
      return <li key={item.id} data-focused={focused} data-muted={focusIds.length > 0 && !focused} aria-label={focused ? `Relevant requirement: ${item.title}` : undefined}>
        <span className={styles.stepNumber}>{index + 1}</span>
        <div>{compact && item.detail ? <details open={focused || undefined}><summary><h4>{item.title}</h4></summary><p>{item.detail}</p></details> : <><h4>{item.title}</h4>{item.detail ? <p>{item.detail}</p> : null}</>}</div>
      </li>
    })}
  </ol>
}
