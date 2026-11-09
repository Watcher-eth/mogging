import { createContext, useContext, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { GripVertical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fieldClass } from '@/components/creator/creator-shell'
import { apiPatch, ApiClientError } from '@/lib/api/client'
import { canSeeCampaign } from '@/lib/creator/campaign-access'
import { sprintMoney, sprintPhase, sprintPayoutCents, type CreatorSprint } from '@/lib/creator/sprints'
import { creatorRetainerTerms } from '@/lib/creator/retainer'
import type { AdminSubmission } from './creator-types'
import { submissionReviewQueueId, type SubmissionReviewQueueId } from '@/lib/admin/creator-overview'

type CampaignSubmission = AdminSubmission
const dragType = 'application/x-mogging-submission'
const MoveContext = createContext<{
  activeCampaigns: CreatorSprint[]
  destinationsFor: (submission: CampaignSubmission) => CreatorSprint[]
  dragged: CampaignSubmission | null
  setDragged: (submission: CampaignSubmission | null) => void
  open: (submission: CampaignSubmission, targetId: string, campaignIds?: string[]) => void
} | null>(null)

export function CampaignSubmissionMoves({ campaigns, onMoved, children }: {
  campaigns: CreatorSprint[]
  onMoved: () => Promise<unknown>
  children: ReactNode
}) {
  const [dragged, setDragged] = useState<CampaignSubmission | null>(null)
  const [moving, setMoving] = useState<{ submission: CampaignSubmission; targetId: string; campaignIds?: string[] } | null>(null)
  const activeCampaigns = campaigns.filter(campaign =>
    sprintPhase(campaign) === 'active' && campaign.terms.formats.some(format => format.active),
  )
  const destinationsFor = (submission: CampaignSubmission) => submission.sprintId
    ? activeCampaigns.filter(campaign => campaign.id !== submission.sprintId && canSeeCampaign(campaign.audience, submission.creatorProfileId))
    : []
  const sourceId = moving?.submission.sprintId

  return <MoveContext.Provider value={{
    activeCampaigns, destinationsFor, dragged, setDragged,
    open: (submission, targetId, campaignIds) => setMoving({ submission, targetId, campaignIds }),
  }}>
    {children}
    {moving && sourceId ? (
      <MoveSubmissionDialog
        sourceId={sourceId}
        sourceName={campaigns.find(campaign => campaign.id === sourceId)?.name ?? moving.submission.sprintName ?? 'its current campaign'}
        submission={moving.submission}
        campaigns={destinationsFor(moving.submission).filter(campaign => !moving.campaignIds || moving.campaignIds.includes(campaign.id))}
        initialTargetId={moving.targetId}
        onClose={() => setMoving(null)}
        onMoved={onMoved}
      />
    ) : null}
  </MoveContext.Provider>
}

export function DraggableCampaignSubmission({ submission, children }: { submission: CampaignSubmission; children: ReactNode }) {
  const move = useContext(MoveContext)
  if (!move?.destinationsFor(submission).length) return <>{children}</>

  function dragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(dragType, submission.id)
    move!.setDragged(submission)
  }

  return <div className="flex cursor-grab items-center active:cursor-grabbing" draggable onDragStart={dragStart} onDragEnd={() => move.setDragged(null)}>
    <div className="min-w-0 flex-1">{children}</div>
    <button
      type="button"
      title="Drag or click to move"
      aria-label={`Move ${submission.title} to another campaign`}
      onClick={() => move.open(submission, '')}
      className="mr-2 grid size-10 shrink-0 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  </div>
}

export function CampaignDropTargets({ sourceId }: { sourceId?: string }) {
  const move = useContext(MoveContext)
  const [hovered, setHovered] = useState<string | null>(null)
  if (!move) return null
  const { dragged } = move
  const campaigns = move.activeCampaigns.filter(campaign => campaign.id !== sourceId)
  const available = dragged ? new Set(move.destinationsFor(dragged).map(campaign => campaign.id)) : null
  if (!campaigns.length) return null

  return <div className="flex flex-wrap items-center gap-2" aria-label="Campaign drop targets">
    <span className="mr-1 text-xs font-medium text-zinc-500">Drop on campaign</span>
    {campaigns.map(campaign => {
      const acceptsDrop = available?.has(campaign.id)
      const style = acceptsDrop && hovered === campaign.id
        ? 'border-sky-400 bg-sky-50 text-sky-800'
        : 'border-dashed border-zinc-200 bg-white text-zinc-600'
      return <span
        key={campaign.id}
        onDragOver={event => {
          if (!acceptsDrop || !event.dataTransfer.types.includes(dragType)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setHovered(campaign.id)
        }}
        onDragLeave={() => setHovered(id => id === campaign.id ? null : id)}
        onDrop={event => {
          if (!acceptsDrop || !dragged || event.dataTransfer.getData(dragType) !== dragged.id) return
          event.preventDefault()
          move.open(dragged, campaign.id)
          move.setDragged(null)
          setHovered(null)
        }}
        className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${style} ${available && !acceptsDrop ? 'opacity-40' : ''}`}
      >
        {campaign.name}
      </span>
    })}
  </div>
}

export function CampaignReviewQueue({ queueId, label, children }: {
  queueId: SubmissionReviewQueueId
  label: string
  children: ReactNode
}) {
  const move = useContext(MoveContext)
  const [hovered, setHovered] = useState(false)
  const destinations = move?.dragged ? move.destinationsFor(move.dragged).filter(campaign =>
    campaign.terms.formats.some(format => submissionReviewQueueId({
      formatId: format.id, sprintTerms: campaign.terms, sprintName: campaign.name, title: '',
    }) === queueId),
  ) : []
  const acceptsDrop = destinations.length > 0

  return <section
    aria-labelledby={`review-queue-${queueId}`}
    aria-label={label}
    className={`overflow-hidden rounded-2xl border bg-white transition-colors ${acceptsDrop && hovered ? 'border-sky-400 ring-2 ring-sky-100' : 'border-zinc-200'}`}
    onDragOver={event => {
      if (!acceptsDrop || !event.dataTransfer.types.includes(dragType)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setHovered(true)
    }}
    onDragLeave={event => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
      setHovered(false)
    }}
    onDrop={event => {
      setHovered(false)
      if (!move?.dragged || !acceptsDrop || event.dataTransfer.getData(dragType) !== move.dragged.id) return
      event.preventDefault()
      move.open(move.dragged, destinations.length === 1 ? destinations[0].id : '', destinations.map(campaign => campaign.id))
      move.setDragged(null)
    }}
  >{children}</section>
}

function MoveSubmissionDialog({
  sourceId, sourceName, submission, campaigns, initialTargetId, onClose, onMoved,
}: {
  sourceId: string
  sourceName: string
  submission: CampaignSubmission
  campaigns: CreatorSprint[]
  initialTargetId: string
  onClose: () => void
  onMoved: () => Promise<unknown>
}) {
  const [targetId, setTargetId] = useState(initialTargetId)
  const [selectedFormatId, setSelectedFormatId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const target = campaigns.find(campaign => campaign.id === targetId)
  const formats = target?.terms.formats.filter(format => format.active) ?? []
  const formatId = formats.length === 1 ? formats[0].id : selectedFormatId
  const priorApproval = submission.approvedAmountCents ?? null
  const hasVerifiedMetrics = submission.adminViewCountThreshold != null && submission.adminUsAudiencePercent != null
  const correctedApproval = target && priorApproval !== null && hasVerifiedMetrics
    ? sprintPayoutCents(creatorRetainerTerms(target.terms, submission.sprintTerms?.retainer, new Date(submission.createdAt)), submission.adminViewCountThreshold!, submission.adminUsAudiencePercent)
    : null
  const missingMetrics = priorApproval !== null && !hasVerifiedMetrics


  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !target || !formatId || missingMetrics) return
    setSaving(true)
    setError('')
    try {
      const result = await apiPatch<{ campaignName: string }>(
        `/api/admin/creator/submissions/${encodeURIComponent(submission.id)}/campaign`,
        { sourceId, targetId, formatId, expectedPriorApproval: priorApproval, expectedApproval: correctedApproval },
      )
      toast.success(`Moved to ${result.campaignName}`)
      onClose()
      void onMoved().catch(() => toast.error('Submission moved. Refresh to see the updated campaigns.'))
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : 'Could not move this submission. Try again.')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move submission</DialogTitle>
          <DialogDescription>
            Move “{submission.title}” from {sourceName}. Queued payouts are recalculated. Any overpayment offsets future submission earnings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
          <label className="block space-y-2 text-sm font-medium">
            <span>Destination campaign</span>
            <select className={fieldClass} value={targetId} disabled={saving} onChange={event => {
              setTargetId(event.target.value)
              setSelectedFormatId('')
              setError('')
            }}>
              <option value="">Choose a campaign</option>
              {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          {formats.length > 1 ? (
            <label className="block space-y-2 text-sm font-medium">
              <span>Format</span>
              <select className={fieldClass} value={formatId} disabled={saving} onChange={event => setSelectedFormatId(event.target.value)}>
                <option value="">Choose a format</option>
                {formats.map(format => <option key={format.id} value={format.id}>{format.name}</option>)}
              </select>
            </label>
          ) : null}
          {missingMetrics ? <p role="alert" className="text-sm text-red-700">This approval needs verified views and audience before it can be recalculated.</p> : null}
          {correctedApproval !== null ? <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">Approved earnings <strong>{sprintMoney(priorApproval!)} → {sprintMoney(correctedApproval)}</strong></p> : null}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !target || !formatId || missingMetrics}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Move submission
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
