import { Ban } from 'lucide-react'
import { CELEBRITY_EDIT_POLICY, creatorRestrictionGroups } from '@/lib/creator/content-policy'

export function ContentRestrictions({ rules }: { rules: readonly string[] }) {
  const { penalties, forbidden } = creatorRestrictionGroups(rules)
  return <div className="divide-y divide-[#e7e9ec]">
    {penalties.length ? <section className="pb-6 text-[#27292d]">
      <p className="text-xs leading-5 text-[#52565c]">These violations can result in a payout reduction where applicable.</p>
      <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 marker:text-[#9a5b12]">{penalties.map(rule => <li key={rule} className="pl-1">{rule}</li>)}</ul>
    </section> : null}
    {forbidden.length ? <section className="pt-6 first:pt-0 text-[#27292d]">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Ban className="size-4 shrink-0 text-[#b42332]" aria-hidden="true" />Forbidden · submission rejected</h3>
      <p className="mt-2 text-xs leading-5 text-[#52565c]">Submissions containing forbidden content or fraudulent evidence will be rejected. The narrow exception for other celebrity edits below still requires review.</p>
      <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 marker:text-[#b42332]">{forbidden.map(rule => <li key={rule} className="pl-1">{rule === CELEBRITY_EDIT_POLICY ? <><span className="font-semibold">Smallville and Tom Welling posts are not allowed.</span>{rule.slice('Smallville and Tom Welling posts are not allowed.'.length)}</> : rule}</li>)}</ul>
    </section> : null}
  </div>
}
