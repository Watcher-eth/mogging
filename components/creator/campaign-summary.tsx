import { campaignTimeLabel } from '@/lib/creator/campaign-preview'
import {
  sprintMoney,
  sprintPhase,
  type CreatorSprint,
} from '@/lib/creator/sprints'

export function SprintStatus({ sprint }: { sprint: CreatorSprint }) {
  const phase = sprintPhase(sprint)
  return (
    <span
      className={`rounded-lg px-3 py-1 text-xs font-medium ${phase === 'active' ? 'bg-[#29CE53] text-white' : 'bg-[#f5f6f7] text-zinc-600'}`}
    >
      {phase === 'past'
        ? 'Ended'
        : phase === 'scheduled'
          ? 'Scheduled'
          : phase === 'draft'
            ? 'Draft'
            : 'Active'}
    </span>
  )
}
export function SprintBudget({ sprint }: { sprint: CreatorSprint }) {
  const percent = Math.min(
    100,
    Math.round((sprint.usedCents / sprint.budgetCents) * 100),
  )
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        <p>Budget committed</p>
        <p className="text-right">{campaignTimeLabel(sprint)}</p>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold tabular-nums">{percent}%</p>
        <p className="text-sm text-zinc-500">
          <strong className="font-medium text-zinc-900">
            {sprintMoney(sprint.usedCents)}
          </strong>{' '}
          / {sprintMoney(sprint.budgetCents)}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Budget committed"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100"
      >
        <div
          className={`h-full rounded-full bg-[#00A8EF]${percent > 0 && percent < 100 ? ' creator-progress' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
