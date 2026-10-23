/** Calendar groups follow the creator's local day, including daylight-saving changes. */
export function groupSubmissionDays<T extends { createdAt: string }>(submissions: T[], now = new Date()) {
  const keyFor = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const days = new Map<string, { key: string; label: string; submissions: T[] }>()
  for (const submission of [...submissions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const date = new Date(submission.createdAt)
    const key = keyFor(date)
    if (!days.has(key)) days.set(key, { key, label: key === keyFor(now) ? 'Today' : key === keyFor(yesterday) ? 'Yesterday' : date.toLocaleDateString('en-GB'), submissions: [] })
    days.get(key)!.submissions.push(submission)
  }
  return [...days.values()]
}

export function submissionAge(value: string, now = new Date()) {
  const uploaded = new Date(value)
  const today = new Date(now)
  uploaded.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const days = Math.max(0, Math.round((today.getTime() - uploaded.getTime()) / 86_400_000))
  if (days === 0) return 'Today'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}W ago`
  if (days < 365) return `${Math.floor(days / 30)}M ago`
  return `${Math.floor(days / 365)}Y ago`
}
