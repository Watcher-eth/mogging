import { Info, LockKeyhole } from 'lucide-react'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { campaignBudgetState } from '@/lib/creator/campaign-budget-state'
import { sprintMoney, type CreatorSprint } from '@/lib/creator/sprints'

export function CampaignSubmissionBudget({ sprint }: { sprint: CreatorSprint }) {
  const budget = campaignBudgetState(sprint)
  if (!budget.low) return null
  return <Disclosure className={`creator-info-bubble creator-info-bubble-compact creator-info-bubble-disclosure ${budget.locked ? '' : 'creator-info-bubble-warning'}`}>
    <DisclosureSummary className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
      <span className="flex items-start gap-2.5">
        {budget.locked
          ? <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-white" />
          : <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" fill="white" stroke="#202123" strokeWidth={1.7} />}
        <span className="min-w-0">
          <strong className="block text-xs">{budget.locked ? 'Submissions locked' : `${sprintMoney(budget.availableCents)} left for new submissions`}</strong>
        </span>
      </span>
    </DisclosureSummary>
    <AccordionContent>
      <p className="ml-[30px] mt-2 line-clamp-2 text-xs leading-[18px]">{budget.locked
        ? 'Reopens if requests are rejected or budget is added.'
        : 'Submissions lock when the remaining budget is requested.'}</p>
    </AccordionContent>
  </Disclosure>
}
