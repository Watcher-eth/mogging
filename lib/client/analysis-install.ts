const analysisWebInstallStorageKey = 'mogging:analysis:web-install-id'

export function ensureAnalysisWebInstallId(preferredInstallId?: string | null) {
  const preferred = preferredInstallId?.trim()
  if (preferred && preferred.length >= 8) {
    window.localStorage.setItem(analysisWebInstallStorageKey, preferred)
    return preferred
  }

  const existing = window.localStorage.getItem(analysisWebInstallStorageKey)
  if (existing && existing.length >= 8) return existing

  const next = `web_analysis_${crypto.randomUUID()}`
  window.localStorage.setItem(analysisWebInstallStorageKey, next)
  return next
}
