import { CELEBRITY_EDIT_POLICY, creatorRestrictionGroups } from '@/lib/creator/content-policy'

export function ContentRestrictions({ rules }: { rules: readonly string[] }) {
  const { penalties, forbidden } = creatorRestrictionGroups(rules)
  return <div className="grid gap-3">
    {penalties.length ? <section className="rounded-2xl border border-dashed border-red-300 p-5 text-red-950">
      <h3 className="text-sm font-semibold">Not allowed · payout penalties</h3>
      <p className="mt-1 text-xs leading-5 text-red-800">These violations can result in a payout reduction where applicable.</p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6">{penalties.map(rule => <li key={rule}>{rule}</li>)}</ul>
    </section> : null}
    {forbidden.length ? <section className="rounded-2xl bg-[#F33232] p-5 text-white">
      <h3 className="text-sm font-semibold">Forbidden · submission rejected</h3>
      <p className="mt-1 text-xs leading-5 text-red-100">Submissions containing forbidden content or fraudulent evidence will be rejected. The narrow exception for other celebrity edits below still requires review.</p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6">{forbidden.map(rule => <li key={rule}>{rule === CELEBRITY_EDIT_POLICY ? <><span className="font-semibold">Smallville and Tom Welling posts are not allowed.</span>{rule.slice('Smallville and Tom Welling posts are not allowed.'.length)}</> : rule}</li>)}</ul>
    </section> : null}
  </div>
}
