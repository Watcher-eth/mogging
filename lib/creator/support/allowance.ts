export const SUPPORT_DAILY_MESSAGES = 4
export type SupportAllowance = { limit: number | null; remaining: number | null; resetsAt: string; unlimited?: true }
export function supportDay(now = Date.now()) {
  const date = new Date(now)
  const day = date.toISOString().slice(0, 10)
  const resetsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  return { day, resetsAt }
}
export function supportAllowance(count: number, now = Date.now()): SupportAllowance {
  return { limit: SUPPORT_DAILY_MESSAGES, remaining: Math.max(0, SUPPORT_DAILY_MESSAGES - count), resetsAt: new Date(supportDay(now).resetsAt).toISOString() }
}
export function unlimitedSupportAllowance(now = Date.now()): SupportAllowance {
  return { limit: null, remaining: null, unlimited: true, resetsAt: new Date(supportDay(now).resetsAt).toISOString() }
}
