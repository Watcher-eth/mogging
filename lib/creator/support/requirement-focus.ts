/** Match concepts, not generic words such as "content" or "requirements". */
const concepts = [
  /\b(cta|call.to.action|invitation|invite|seconds|slides?|early)\b/i,
  /\b(hook|opening|intro|first few)\b/i,
  /\b(product|app|scan)\b/i,
  /\b(tag|caption|@moggingcom)\b/i,
  /\b(public|private|original|copyright)\b/i,
  /\b(connect(?:ed)?|account)\b/i,
  /\b(looks|looksmaxxing|ascension|transformation|appearance|features|celebrity|attractive|audience|niche|sports|anime|smallville|welling)\b/i,
  /\b(analytic|analytics|recording|record|device|screenshots?|evidence|cuts|screen)\b/i,
  /\b(fake|fraud|genuine|botting|engagement)\b/i,
]
export function relevantRequirementIds(question: string, rows: { id: string; title: string; detail?: string }[]) {
  const relevant = concepts.filter(pattern => pattern.test(question))
  const ids = new Set<string>()
  for (const pattern of relevant) {
    const titles = rows.filter(row => pattern.test(row.title))
    for (const row of titles.length ? titles : rows.filter(row => pattern.test(row.detail ?? ''))) ids.add(row.id)
  }
  return rows.filter(row => ids.has(row.id)).map(row => row.id)
}
