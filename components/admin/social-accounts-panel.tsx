import { useState } from 'react'
import { ArrowUpRight, Check, Link2 } from 'lucide-react'
import * as Avatar from '@radix-ui/react-avatar'
import { BioLinkTracker } from './bio-link-tracker'
import type { AdminAccount, AdminDashboard, AdminSubmission } from './creator-types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { creatorAccountLabel } from '@/components/creator/types'
import { activityDate, lastActiveLabel } from '@/lib/admin/bio-link-tracker'
import { hasLaunchCampaignBonuses } from '@/lib/creator/campaign-launch'
import { cn } from '@/lib/utils'

export function SocialAccountsPanel({ data, onReviewAccount, onSelectSubmission }: {
  data: AdminDashboard
  onReviewAccount: (account: AdminAccount) => void
  onSelectSubmission: (submission: AdminSubmission) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = data.accounts.find(account => account.id === selectedId)
  return <>
    <BioLinkTracker accounts={data.accounts} submissions={data.submissions} onSelectAccount={account => setSelectedId(account.id)} onSelectSubmission={onSelectSubmission} />
    {selected ? <Dialog open onOpenChange={open => { if (!open) setSelectedId(null) }}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto p-6 sm:p-8">
        <AccountOverview account={selected} data={data} onReviewAccount={account => { setSelectedId(null); onReviewAccount(account) }} onSelectSubmission={submission => { setSelectedId(null); onSelectSubmission(submission) }} />
      </DialogContent>
    </Dialog> : null}
  </>
}

export function AccountOverview({ account, data, onReviewAccount, onSelectSubmission }: {
  account: AdminAccount
  data: AdminDashboard
  onReviewAccount: (account: AdminAccount) => void
  onSelectSubmission: (submission: AdminSubmission) => void
}) {
  const creator = data.creators.find(creator => creator.id === account.creatorProfileId)
  const accounts = data.accounts.filter(item => item.creatorProfileId === account.creatorProfileId)
  const submissions = data.submissions.filter(item => item.creatorProfileId === account.creatorProfileId)
  const warnings = creator?.warnings?.filter(warning => !warning.resolvedAt) || []
  return <>
    <DialogHeader className="pr-8 text-left"><DialogTitle className="text-2xl">{account.creatorName}</DialogTitle><DialogDescription>{account.creatorEmail} · {accounts.length} linked {accounts.length === 1 ? 'account' : 'accounts'}</DialogDescription></DialogHeader>
    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-zinc-50 p-4 text-xs"><span><span className="text-zinc-500">Last active</span><span className="ml-2 font-medium" title={activityDate(account.lastActiveAt)}>{lastActiveLabel(account.lastActiveAt)}</span></span><span className="text-zinc-500">{activityDate(account.lastActiveAt)}</span><span className="text-zinc-500">{submissions.length} video submissions</span></div>
    <p className="text-[11px] leading-5 text-zinc-400">Last active is this creator’s most recent recorded portal visit, shared across their social accounts.</p>
    {warnings.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-semibold text-amber-900">Internal warnings</h3><ul className="mt-2 space-y-2 text-xs leading-5 text-amber-900">{warnings.map(warning => <li key={warning.id}>{warning.note}</li>)}</ul></section> : null}
    <section><h3 className="mb-3 text-sm font-semibold">Account cards</h3><div className="grid gap-3 sm:grid-cols-2">{accounts.map(item => {
      const videos = submissions.filter(submission => submission.socialAccountId === item.id)
      const eligible = videos.filter(hasLaunchCampaignBonuses)
      const verified = eligible.filter(submission => submission.exclusivityConfirmed).length
      const handle = item.handle?.replace(/^@/, '')
      const profileUrl = item.profileUrl || (handle ? `https://www.${item.platform}.com/${item.platform === 'tiktok' ? '@' : ''}${handle}` : null)
      return <article key={item.id} className={cn('min-w-0 rounded-2xl border p-4', item.id === account.id ? 'border-sky-200 bg-sky-50/30' : 'border-zinc-200')}>
        <div className="flex items-center gap-3"><Avatar.Root className="grid size-11 shrink-0 overflow-hidden rounded-full bg-zinc-100"><Avatar.Image src={item.avatarUrl || undefined} alt="" className="size-full object-cover" /><Avatar.Fallback className="grid size-full place-items-center text-zinc-500">{creatorAccountLabel(item).replace(/^@/, '').charAt(0).toUpperCase()}</Avatar.Fallback></Avatar.Root><div className="min-w-0"><h4 className="break-words text-sm font-semibold">{creatorAccountLabel(item)}</h4><p className="mt-1 text-xs text-zinc-500">{item.platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {item.connectionMethod === 'oauth' ? 'OAuth' : 'Manual'}</p></div></div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600">{item.status === 'approved' ? 'Approved' : item.status === 'missing_information' ? 'Needs information' : 'Pending review'}</span>{item.id === account.id ? <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">Selected account</span> : null}</div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-zinc-500">Videos</dt><dd className="mt-1 font-semibold tabular-nums">{videos.length}</dd></div><div><dt className="text-zinc-500">Bio verified</dt><dd className="mt-1 font-semibold tabular-nums">{verified}/{eligible.length}</dd></div><div><dt className="text-zinc-500">Link clicks</dt><dd className="mt-1 font-semibold tabular-nums">{(item.attribution?.clicks || 0).toLocaleString()}</dd></div></dl>
        <div className="mt-3 flex flex-col items-start gap-1">{profileUrl ? <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-sky-700 underline underline-offset-4">Open profile<ArrowUpRight className="size-3.5" /></a> : <p className="py-3 text-xs text-zinc-400">Profile URL not provided</p>}
          {item.trackingLinkUrl ? <a href={item.trackingLinkUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 max-w-full items-center gap-2 text-xs text-sky-700 underline underline-offset-4"><Link2 className="size-3.5 shrink-0" /><span className="break-all">{item.trackingLinkUrl}</span></a> : <p className="text-xs text-zinc-400">No tracking link</p>}
        </div>
        {item.trackingLinkUrl ? <p className="mt-1 text-[11px] text-zinc-500">Tracking link {item.trackingLinkActive ? 'active' : 'inactive'}</p> : null}
        {item.reviewNote ? <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-600">{item.reviewNote}</p> : null}
        <button type="button" onClick={() => onReviewAccount(item)} className="mt-4 min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 focus-visible:outline-sky-500">Review account & analytics</button>
      </article>
    })}</div></section>
    <section><h3 className="mb-3 text-sm font-semibold">Video submissions</h3>{submissions.length ? <ul className="divide-y divide-zinc-100">{submissions.map(submission => <li key={submission.id}><button type="button" onClick={() => onSelectSubmission(submission)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-zinc-50 focus-visible:outline-sky-500"><span className="min-w-0"><span className="block break-words text-sm font-medium">{submission.title}</span><span className="mt-1 block text-xs text-zinc-500">{submission.socialHandle || 'Unlinked account'} · {submission.status.replaceAll('_', ' ')} · {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium' }).format(new Date(submission.createdAt))}</span></span>{hasLaunchCampaignBonuses(submission) ? <span className={cn('flex shrink-0 items-center gap-1 text-xs', submission.exclusivityConfirmed ? 'text-emerald-700' : 'text-zinc-500')}>{submission.exclusivityConfirmed ? <><Check className="size-3.5" /> Bio verified</> : 'Bio not verified'}</span> : <ArrowUpRight className="size-4 shrink-0 text-zinc-400" />}</button></li>)}</ul> : <p className="text-sm text-zinc-500">No submitted videos yet.</p>}</section>
  </>
}
