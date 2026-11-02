import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react'
import * as Avatar from '@radix-ui/react-avatar'
import { activityDate, bioLinkMonth, buildBioLinkTracker, lastActiveLabel } from '@/lib/admin/bio-link-tracker'
import { creatorAccountLabel } from '@/components/creator/types'
import type { AdminAccount, AdminSubmission } from './creator-types'
import { cn } from '@/lib/utils'

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function BioLinkTracker({ accounts, submissions, onSelectSubmission, onSelectAccount }: {
  accounts: AdminAccount[]
  submissions: AdminSubmission[]
  onSelectSubmission: (submission: AdminSubmission) => void
  onSelectAccount: (account: AdminAccount) => void
}) {
  const [year, setYear] = useState(() => Number(bioLinkMonth(new Date())!.slice(0, 4)))
  const [selected, setSelected] = useState<{ accountId: string; month: string } | null>(null)
  const tracker = useMemo(() => buildBioLinkTracker(submissions), [submissions])
  const months = monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
  const selectedAccount = accounts.find(account => account.id === selected?.accountId)
  const selectedMonth = selected ? tracker.get(selected.accountId)?.get(selected.month) : undefined
  function changeYear(delta: number) { setYear(value => value + delta); setSelected(null) }

  return <section aria-label="Monthly bio-link verification" className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div><h2 className="text-lg font-semibold tracking-tight">Accounts & bio-link consistency</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Open an account for its creator’s account cards, links, and videos. Monthly checks count eligible campaign videos by submission month, in Los Angeles time.</p></div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous year" onClick={() => changeYear(-1)} className="grid size-11 place-items-center rounded-lg hover:bg-zinc-100 focus-visible:outline-sky-500"><ChevronLeft className="size-4" /></button>
        <span aria-live="polite" className="text-sm font-semibold tabular-nums">{year}</span>
        <button type="button" aria-label="Next year" onClick={() => changeYear(1)} className="grid size-11 place-items-center rounded-lg hover:bg-zinc-100 focus-visible:outline-sky-500"><ChevronRight className="size-4" /></button>
      </div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-5 pb-4 text-xs text-zinc-500">
      <span><span className="text-emerald-700">✓ All verified</span></span><span><span className="text-amber-700">◐ Partially verified</span></span><span>0/n Awaiting verification</span><span>— No eligible videos</span>
    </div>
    {accounts.length ? <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
        <caption className="sr-only">Monthly verified video counts by social account. Consistency is the share of active months with every eligible video verified.</caption>
        <thead className="border-y border-zinc-100 bg-zinc-50 text-zinc-500"><tr><th scope="col" className="min-w-60 px-5 py-3 font-medium">Social account</th><th scope="col" className="px-4 py-3 font-medium" title="Creator’s last recorded portal visit, shared across their accounts">Last active</th>{monthNames.map(month => <th key={month} scope="col" className="px-1 py-3 text-center font-medium">{month}</th>)}<th scope="col" className="px-5 py-3 text-right font-medium">Consistency</th></tr></thead>
        <tbody className="divide-y divide-zinc-100">{accounts.map(account => {
          const history = tracker.get(account.id)
          const active = months.flatMap(month => history?.get(month) ? [history.get(month)!] : [])
          const complete = active.filter(month => month.verified === month.submissions.length).length
          return <tr key={account.id}>
            <th scope="row" className="px-4 py-3 font-medium"><button type="button" onClick={() => onSelectAccount(account)} aria-label={`View ${creatorAccountLabel(account)} and all linked accounts`} className="flex min-h-11 w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-zinc-50 focus-visible:outline-sky-500">
              <Avatar.Root className="grid size-9 shrink-0 overflow-hidden rounded-full bg-zinc-100"><Avatar.Image src={account.avatarUrl || undefined} alt="" className="size-full object-cover" /><Avatar.Fallback className="grid size-full place-items-center text-zinc-500">{creatorAccountLabel(account).replace(/^@/, '').charAt(0).toUpperCase()}</Avatar.Fallback></Avatar.Root>
              <span><span className="block">{creatorAccountLabel(account)}</span><span className="mt-1 block font-normal text-zinc-500">{account.creatorName} · {account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span><span className="mt-1 block text-[10px] font-normal text-zinc-400">{account.status === 'approved' ? 'Approved' : account.status === 'missing_information' ? 'Needs information' : 'Pending review'}</span></span>
            </button></th>
            <td className="whitespace-nowrap px-4 py-3" title={`${activityDate(account.lastActiveAt)} · creator portal activity`}><span className="block font-medium">{lastActiveLabel(account.lastActiveAt)}</span>{account.lastActiveAt ? <span className="mt-1 block text-[10px] text-zinc-400">Creator portal</span> : null}</td>
            {months.map((month, index) => {
              const entry = history?.get(month)
              const total = entry?.submissions.length || 0
              const verified = entry?.verified || 0
              const label = `${creatorAccountLabel(account)}, ${monthNames[index]} ${year}: ${total ? `${verified} of ${total} videos verified` : 'no eligible videos'}`
              return <td key={month} className="px-1 py-3 text-center">{total ? <button type="button" aria-label={label} aria-pressed={selected?.accountId === account.id && selected.month === month} onClick={() => setSelected({ accountId: account.id, month })} className={cn('flex min-h-11 w-full min-w-12 flex-col items-center justify-center rounded-lg border text-[11px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500', verified === total ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : verified ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-zinc-50 text-zinc-500', selected?.accountId === account.id && selected.month === month ? 'ring-2 ring-zinc-800 ring-offset-1' : '')}>
                {verified === total ? <Check aria-hidden="true" className="size-3.5" /> : null}<span>{verified}/{total}</span>
              </button> : <span aria-label={label} className="inline-flex text-zinc-300"><Minus aria-hidden="true" className="size-3.5" /></span>}</td>
            })}
            <td className="whitespace-nowrap px-5 py-4 text-right">{active.length ? <><span className="font-semibold tabular-nums">{Math.round(complete / active.length * 100)}%</span><span className="mt-1 block text-[11px] text-zinc-500">{complete}/{active.length} active months</span></> : <span className="text-zinc-400">No activity</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div> : <p className="px-5 pb-5 text-sm text-zinc-500">Connect a social account to start tracking verification.</p>}
    {selectedAccount && selectedMonth && selected ? <div className="border-t border-zinc-200 p-5">
      <h3 className="text-sm font-semibold">{creatorAccountLabel(selectedAccount)} · {monthNames[Number(selected.month.slice(5)) - 1]} {year}</h3>
      <p className="mt-1 text-xs text-zinc-500">{selectedMonth.verified} of {selectedMonth.submissions.length} videos verified. Unchecked videos still need verification; they do not prove a missing link.</p>
      <ul className="mt-3 divide-y divide-zinc-100">{selectedMonth.submissions.map(submission => <li key={submission.id}><button type="button" onClick={() => onSelectSubmission(submission)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-zinc-50 focus-visible:outline-sky-500"><span className="min-w-0"><span className="block text-sm font-medium">{submission.title}</span><span className="mt-1 block text-xs text-zinc-500">{submission.sprintName || 'Campaign video'}</span></span><span className={cn('shrink-0 text-xs', submission.exclusivityConfirmed ? 'text-emerald-700' : 'text-zinc-500')}>{submission.exclusivityConfirmed ? '✓ Verified' : 'Awaiting verification'}</span></button></li>)}</ul>
    </div> : null}
  </section>
}
