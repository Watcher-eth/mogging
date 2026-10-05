import { useId, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
const CategoryChart = dynamic(() => import('./category-chart').then(module => module.CategoryChart), { ssr: false })
import type { MetricRow } from '@/lib/admin/analytics'

export const count = (value: unknown) => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const percent = (numerator: number, denominator: number) => denominator > 0 ? `${(numerator / denominator * 100).toFixed(1)}%` : '—'
export const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
export const money = (value: unknown, currency: string) => value == null ? '—' : /^[A-Z]{3}$/.test(currency) && currency !== 'UNKNOWN'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value)) : `${count(value)} ${currency}`

export function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="admin-notice">{children}</div>
}
export function Stat({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="admin-metric"><p className="text-xs text-[#73777d]">{title}</p><p className="mt-3 text-[32px] font-medium tabular-nums tracking-[-0.045em] text-[#181a1d]">{value}</p><p className="mt-2 text-xs leading-5 text-[#858a91]">{note}</p></div>
}
export function Panel({ title, description, note, children, action }: { title: string; description?: string; note?: string; children: ReactNode; action?: ReactNode }) {
  const id = useId()
  return <section aria-labelledby={id} className="admin-section"><header className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h2 id={id} className="text-lg font-medium tracking-[-0.025em]">{title}</h2>{description ? <p className="mt-1.5 text-sm leading-6 text-[#73777d]">{description}</p> : null}</div>{action}</header>{children}{note ? <details className="admin-methodology"><summary>How this is measured</summary><p>{note}</p></details> : null}</section>
}
const labels: Record<string, string> = {
  events: 'Events', accounts: 'Accounts', actors: 'Devices / browsers', unlinked_events: 'Unlinked billing events', flows: 'Flows', attempts: 'Attempts', unique_ids: 'Distinct IDs', clock_skew_events: 'Clock skew events', provider_type: 'Provider event type', first_opens: 'First app opens', purchase_completions: 'Purchase completions',
  purchase_actors: 'Purchasing devices', median_ms: 'Median time', p90_ms: '90th percentile time',
  median_evaluation_ms: 'Median scan time', evaluation_failures: 'Scan failures', evaluations_started: 'Scans started',
  continuation: 'Continued %', drop_off: 'Drop-off %', affected_devices: 'Affected devices', missing_amount_events: 'Unknown amounts',
}
export function Table({ rows, columns }: { rows: MetricRow[]; columns: string[] }) {
  if (!rows.length) return <p className="admin-empty">No observations in this window.</p>
  return <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Report data"><table className="admin-table"><thead><tr>{columns.map(column => <th key={column} scope="col">{labels[column] || label(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] == null ? '—' : column.endsWith('_ms') ? `${count(Number(row[column]) / 1000)} s` : typeof row[column] === 'number' ? count(row[column]) : String(row[column])}</td>)}</tr>)}</tbody></table></div>
}
export function DataDetails({ children }: { children: ReactNode }) {
  return <details className="admin-data-details"><summary>View underlying data</summary><div className="mt-4">{children}</div></details>
}
export function ComparisonBars({ rows, series }: { rows: Array<{ label: string; values: number[]; detail?: string }>; series: Array<{ label: string; color: string }> }) {
  return <CategoryChart rows={rows} series={series} format={count} />
}
export function Bars({ rows, format = count, maximum }: { rows: Array<{ label: string; value: number | null; detail?: string }>; format?: (value: number) => string; maximum?: number }) {
  return <CategoryChart rows={rows.map(({ value, ...row }) => ({ ...row, values: [value] }))} series={[{ label: 'Observed', color: '#00A8EF' }]} format={format} maximum={maximum} />
}
