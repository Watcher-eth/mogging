import { useId } from 'react'

export function TikTokAnchorPriorityCheckbox({ checked, onChange }: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const labelId = useId()
  const hintId = useId()
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <input
        type="checkbox"
        checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      />
      <span className="grid gap-1">
        <span id={labelId} className="text-sm font-semibold text-zinc-950">I published this post with the Mogging Anchor on TikTok</span>
        <span id={hintId} className="text-xs leading-5 text-zinc-600">Check this box if you used the Anchor. These posts are reviewed first in this campaign.</span>
      </span>
    </label>
  )
}
