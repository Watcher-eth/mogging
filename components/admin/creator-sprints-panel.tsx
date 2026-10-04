import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldClass } from '@/components/creator/creator-shell'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  sprintInputSchema,
  sprintMoney,
  sprintPhase,
  type CreatorSprint,
  type SprintTerms,
} from '@/lib/creator/sprints'
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
export function CreatorSprintsPanel() {
  const { data, error, isLoading, mutate } = useSWR<{
    sprints: CreatorSprint[]
  }>('/api/admin/creator/sprints', apiGet)
  const [editing, setEditing] = useState<CreatorSprint | 'new' | null>(null)
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus />
          New campaign
        </Button>
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto my-16 animate-spin" />
      ) : error ? (
        <p role="alert">
          Could not load campaigns.{' '}
          <button onClick={() => void mutate()}>Retry</button>
        </p>
      ) : data?.sprints.length ? (
        <div className="admin-list">
          {data.sprints.map((sprint) => (
            <button
              key={sprint.id}
              onClick={() => setEditing(sprint)}
              className="admin-resource-row flex items-center justify-between gap-3 text-left"
            >
              <div>
                <h3 className="font-semibold">{sprint.name}</h3>
                <p className="mt-1 text-xs capitalize text-zinc-500">
                  {sprintPhase(sprint)} ·{' '}
                  {sprint.counts.pending + sprint.counts.in_review} pending ·{' '}
                  {sprint.counts.approved + sprint.counts.paid} approved
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {sprintMoney(sprint.usedCents)} /{' '}
                {sprintMoney(sprint.budgetCents)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-zinc-50 p-8 text-sm text-zinc-500">
          No campaigns yet. Create a draft, then publish it when its terms are
          ready.
        </p>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto p-6 sm:p-8">
          {editing ? (
            <SprintEditor
              key={typeof editing === 'string' ? editing : editing.id}
              sprint={editing === 'new' ? undefined : editing}
              onSaved={async () => {
                await mutate()
                setEditing(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
function SprintEditor({
  sprint,
  onSaved,
}: {
  sprint?: CreatorSprint
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(sprint?.name || '')
  const [description, setDescription] = useState(sprint?.description || '')
  const [budget, setBudget] = useState(
    sprint ? String(sprint.budgetCents / 100) : '',
  )
  const [status, setStatus] = useState(sprint?.status || 'draft')
  const localDate = (value: string) => {
    const date = new Date(value)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  }
  const [starts, setStarts] = useState(
    localDate(sprint?.startsAt || new Date().toISOString()),
  )
  const [ends, setEnds] = useState(
    localDate(
      sprint?.endsAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    ),
  )
  const [terms, setTerms] = useState<SprintTerms>(
    () => sprint?.terms || defaultCreatorSprintTerms(),
  )
  const [busy, setBusy] = useState(false)
  const patch = (change: Partial<SprintTerms>) =>
    setTerms((current) => ({ ...current, ...change }))
  async function save(event: FormEvent) {
    event.preventDefault()
    const parsed = sprintInputSchema.safeParse({
      id: sprint?.id,
      name,
      description,
      status,
      budgetCents: Math.round(Number(budget) * 100),
      startsAt: new Date(starts).toISOString(),
      endsAt: new Date(ends).toISOString(),
      terms,
    })
    if (!parsed.success) return toast.error(parsed.error.issues[0].message)
    setBusy(true)
    try {
      await apiPost('/api/admin/creator/sprints', parsed.data)
      toast.success('Campaign saved')
      await onSaved()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not save campaign',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="grid gap-6">
      <DialogHeader className="text-left">
        <DialogTitle>{sprint ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        <DialogDescription>
          New terms apply to future submissions. Existing submissions retain
          their saved terms and earnings.
        </DialogDescription>
      </DialogHeader>
      <fieldset disabled={busy} className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign name">
            <input
              required
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="draft">Draft</option>
              <option value="published">
                Published (dates control active/scheduled)
              </option>
              <option value="ended">Ended</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            required
            className={`${fieldClass} min-h-20 py-3`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Total budget (USD)">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              className={fieldClass}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field label="Starts (your local time)">
            <input
              required
              type="datetime-local"
              className={fieldClass}
              value={starts}
              onChange={(e) => setStarts(e.target.value)}
            />
          </Field>
          <Field label="Ends (your local time)">
            <input
              required
              type="datetime-local"
              className={fieldClass}
              value={ends}
              onChange={(e) => setEnds(e.target.value)}
            />
          </Field>
        </div>
        <section className="border-t pt-5">
          <h3 className="mb-3 font-semibold">Maximum Tier 1 milestone rates</h3>
          {terms.milestones.some((rate) => rate.audienceRates) ? (
            <p className="mb-3 text-xs text-zinc-500">
              Existing audience tiers are retained. Editing a maximum payout
              scales its lower tiers; changing audience limits switches to
              proportional payouts.
            </p>
          ) : null}
          <div className="space-y-2">
            {terms.milestones.map((rate, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
              >
                <Field label="Views">
                  <input
                    required
                    type="number"
                    min="1"
                    className={fieldClass}
                    value={rate.views}
                    onChange={(e) =>
                      patch({
                        milestones: terms.milestones.map((row, index) =>
                          index === i
                            ? { ...row, views: Number(e.target.value) }
                            : row,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Total payout (USD)">
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={fieldClass}
                    value={rate.amountCents / 100}
                    onChange={(e) =>
                      patch({
                        milestones: terms.milestones.map((row, index) =>
                          index === i
                            ? {
                                ...row,
                                amountCents: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                                audienceRates: row.audienceRates?.map(
                                  (rate) => ({
                                    ...rate,
                                    amountCents: Math.round(
                                      (rate.amountCents *
                                        Number(e.target.value) *
                                        100) /
                                        row.amountCents,
                                    ),
                                  }),
                                ),
                              }
                            : row,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Remove milestone"
                  disabled={terms.milestones.length === 1}
                  onClick={() =>
                    patch({
                      milestones: terms.milestones.filter(
                        (_, index) => i !== index,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={terms.milestones.length >= 12}
            onClick={() =>
              patch({
                milestones: [
                  ...terms.milestones,
                  {
                    views: terms.milestones.at(-1)!.views * 2,
                    amountCents: terms.milestones.at(-1)!.amountCents * 2,
                  },
                ],
              })
            }
          >
            Add milestone
          </Button>
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum Tier 1 audience %">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={fieldClass}
              value={terms.minimumTier1Percent}
              onChange={(e) =>
                patch({
                  minimumTier1Percent: Number(e.target.value),
                  milestones: terms.milestones.map((row) => ({
                    ...row,
                    audienceRates: undefined,
                  })),
                })
              }
            />
          </Field>
          <Field label="Audience % for maximum rate">
            <input
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              className={fieldClass}
              value={terms.maximumTier1Percent}
              onChange={(e) =>
                patch({
                  maximumTier1Percent: Number(e.target.value),
                  milestones: terms.milestones.map((row) => ({
                    ...row,
                    audienceRates: undefined,
                  })),
                })
              }
            />
          </Field>
          <Field label="Submit within (hours of posting)">
            <input
              type="number"
              min="0.1"
              max="720"
              step="0.1"
              className={fieldClass}
              value={terms.submissionWindowHours}
              onChange={(e) =>
                patch({ submissionWindowHours: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <div className="flex gap-5">
          {(['tiktok', 'instagram'] as const).map((platform) => (
            <label
              key={platform}
              className="flex items-center gap-2 text-sm capitalize"
            >
              <input
                type="checkbox"
                checked={terms.platforms.includes(platform)}
                onChange={(e) =>
                  patch({
                    platforms: e.target.checked
                      ? [...terms.platforms, platform]
                      : terms.platforms.filter((item) => item !== platform),
                  })
                }
              />
              {platform}
            </label>
          ))}
        </div>
        <Field label="Campaign rules" hint="One per line">
          <textarea
            className={`${fieldClass} min-h-28 py-3`}
            value={terms.rules.join('\n')}
            onChange={(e) => patch({ rules: e.target.value.split('\n') })}
            onBlur={() => patch({ rules: lines(terms.rules.join('\n')) })}
          />
        </Field>
        <section className="border-t pt-5">
          <h3 className="font-semibold">Creative briefs</h3>
          {terms.formats.map((format, i) => {
            const change = (value: Partial<typeof format>) =>
              patch({
                formats: terms.formats.map((item, index) =>
                  index === i ? { ...item, ...value } : item,
                ),
              })
            return (
              <div
                className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-4"
                key={i}
              >
                <div className="flex justify-between">
                  <strong className="text-sm">Format {i + 1}</strong>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Remove format"
                    disabled={terms.formats.length === 1}
                    onClick={() =>
                      patch({
                        formats: terms.formats.filter(
                          (_, index) => i !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Field label="Name">
                  <input
                    className={fieldClass}
                    value={format.name}
                    onChange={(e) => change({ name: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Brief">
                  <textarea
                    className={`${fieldClass} min-h-20 py-3`}
                    value={format.shortDescription}
                    onChange={(e) =>
                      change({ shortDescription: e.target.value })
                    }
                    required
                  />
                </Field>
                {format.elements.map((element, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-2">
                    <Field label="Section title">
                      <input
                        className={fieldClass}
                        required
                        value={element.title}
                        onChange={(e) =>
                          change({
                            elements: format.elements.map((item, n) =>
                              n === index
                                ? { ...item, title: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Instruction">
                      <input
                        className={fieldClass}
                        required
                        value={element.detail}
                        onChange={(e) =>
                          change({
                            elements: format.elements.map((item, n) =>
                              n === index
                                ? { ...item, detail: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                ))}
                <Field label="Requirements" hint="One per line">
                  <textarea
                    className={`${fieldClass} min-h-28 py-3`}
                    value={format.requirements.join('\n')}
                    onChange={(e) =>
                      change({ requirements: e.target.value.split('\n') })
                    }
                    onBlur={() =>
                      change({
                        requirements: lines(format.requirements.join('\n')),
                      })
                    }
                  />
                </Field>
                <Field label="Not allowed" hint="One per line">
                  <textarea
                    className={`${fieldClass} min-h-24 py-3`}
                    value={format.notAllowed.join('\n')}
                    onChange={(e) =>
                      change({ notAllowed: e.target.value.split('\n') })
                    }
                    onBlur={() =>
                      change({
                        notAllowed: lines(format.notAllowed.join('\n')),
                      })
                    }
                  />
                </Field>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={terms.formats.length >= 8}
            onClick={() =>
              patch({
                formats: [
                  ...terms.formats,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    shortDescription: '',
                    active: true,
                    elements: [
                      { title: 'Opening hook', detail: '' },
                      { title: 'Product moment', detail: '' },
                      { title: 'Closing CTA', detail: '' },
                    ],
                    requirements: ['Keep the post public and original.'],
                    notAllowed: [],
                  },
                ],
              })
            }
          >
            Add format
          </Button>
        </section>
      </fieldset>
      <Button disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? 'Saving…' : 'Save campaign'}
      </Button>
    </form>
  )
}
