import type { CreatorSprint } from '@/lib/creator/sprints'

export function CampaignVersionToggle({ campaigns, selectedId, onChange }: {
  campaigns: CreatorSprint[]
  selectedId: string
  onChange: (id: string) => void
}) {
  if (campaigns.length < 2) return null
  return <div role="group" aria-label="Detailed analysis campaign version" className="grid gap-1 rounded-2xl bg-zinc-100 p-1 sm:grid-cols-2">
    {campaigns.map(campaign => <button
      key={campaign.id}
      type="button"
      aria-pressed={campaign.id === selectedId}
      onClick={() => onChange(campaign.id)}
      className={`min-h-11 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-[#00A8EF] active:scale-[0.98] ${campaign.id === selectedId ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
    >{campaign.name}</button>)}
  </div>
}
