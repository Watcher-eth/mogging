import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Panel, Table } from './analytics-ui'
import type { AdminDashboard } from './creator-types'
import { calculateCreatorEconomics, type FunnelMetrics } from '@/lib/admin/creator-economics'
import { apiPatch, apiPost, ApiClientError } from '@/lib/api/client'

const emptyMetrics: FunnelMetrics = { qualifiedViews: 0, linkClicks: 0, installs: 0, firstTimePaidCustomers: 0 }

export function CreatorProgramSettings({ data, onRefresh }: { data: AdminDashboard; onRefresh: () => Promise<void> }) {
  const [monthlyPrice, setMonthlyPrice] = useState((data.settings.monthlySubscriptionCents / 100).toFixed(2))
  const [margin, setMargin] = useState((data.settings.ninetyDayContributionMarginCents / 100).toFixed(2))
  const [saving, setSaving] = useState(false)
  async function saveSettings() {
    const monthlySubscriptionCents = Math.round(Number(monthlyPrice) * 100)
    const ninetyDayContributionMarginCents = Math.round(Number(margin) * 100)
    if (!Number.isFinite(monthlySubscriptionCents) || monthlySubscriptionCents <= 0) return toast.error('Enter the monthly subscription price')
    if (!Number.isFinite(ninetyDayContributionMarginCents) || ninetyDayContributionMarginCents < 0) return toast.error('Enter the 90-day contribution margin')
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/settings', { monthlySubscriptionCents, ninetyDayContributionMarginCents })
      toast.success('Program economics updated')
      await onRefresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update program economics')
    } finally {
      setSaving(false)
    }
  }

  const aggregate = calculateCreatorEconomics(emptyMetrics, [], { ninetyDayContributionMarginCents: data.settings.ninetyDayContributionMarginCents, compensationCapRate: data.rules.compensationCapRate, conversionBonusCapRate: data.rules.conversionBonusCapRate })
  return <div className="max-w-xl"><ProgramSettings monthlyPrice={monthlyPrice} margin={margin} setMonthlyPrice={setMonthlyPrice} setMargin={setMargin} saving={saving} onSave={() => void saveSettings()} data={data} aggregate={aggregate} /><Disclosure className="admin-data-details"><DisclosureSummary>Manage App Store campaign imports</DisclosureSummary><AccordionContent><StoreCampaignImport rows={data.creatorCoverage?.storeCampaigns || []} /></AccordionContent></Disclosure></div>
}

function ProgramSettings({ monthlyPrice, margin, setMonthlyPrice, setMargin, saving, onSave, data, aggregate }: { monthlyPrice: string; margin: string; setMonthlyPrice: (value: string) => void; setMargin: (value: string) => void; saving: boolean; onSave: () => void; data: AdminDashboard; aggregate: ReturnType<typeof calculateCreatorEconomics> }) {
  return <div className="admin-section"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Settings2 className="size-4" /></span><div><p className="text-sm font-semibold">Program assumptions</p><p className="text-xs text-zinc-500">Planning assumptions and conversion-bonus limits.</p></div></div><div className="mt-5 grid gap-4"><MoneyInput label="Monthly subscription" value={monthlyPrice} onChange={setMonthlyPrice} hint="USD per month" /><MoneyInput label="90-day contribution margin/customer" value={margin} onChange={setMargin} hint={`90-day gross revenue is ${formatMoney(data.settings.monthlySubscriptionCents * 3)}`} /></div><p className="mt-4 text-xs leading-5 text-zinc-500">Enter revenue after refunds, payment fees, hosting, and other variable costs—not gross subscription revenue. These assumptions are not treated as realized revenue in Creator Economics.</p><Button className="mt-5 h-10 w-full rounded-xl" onClick={onSave} disabled={saving}>{saving ? <Save className="animate-pulse" /> : <Save />}{saving ? 'Saving…' : 'Save assumptions'}</Button><div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs"><span className="text-zinc-500">Conversion bonus ceiling</span><span className="font-semibold">{formatMoney(aggregate.maxConversionBonusCents)} / paid customer</span></div></div>
}

function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: string }) { return <label className="grid gap-2"><span className="flex items-center justify-between text-sm font-medium"><span>{label}</span><span className="text-[11px] font-normal text-zinc-400">{hint}</span></span><span className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 pl-7 pr-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></span></label> }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) }

function StoreCampaignImport({ rows }: { rows: Array<Record<string, unknown>> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function upload(file: File | undefined) {
    if (!file || busy) return
    if (file.size > 900_000) { setMessage('Choose an export smaller than 900 KB'); return }
    setBusy(true); setMessage('')
    try { const result = await apiPost<{ rows: number }>('/api/admin/creator/store-campaigns', { csv: await file.text() }); setMessage(`${result.rows} aggregate rows imported. Refresh to see them.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import export') }
    finally { setBusy(false) }
  }
  return <Panel title="App Store campaign cross-check" description="Import aggregate App Store campaign exports using date,campaign,territory,downloads,sales,currency columns. Dates must use YYYY-MM-DD. Blank or suppressed values remain unknown. These rows never assign individual customers or change creator payments.">
    <label className="mb-4 grid gap-2 text-sm">{busy ? 'Importing…' : 'Upload campaign CSV or TSV'}<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={busy} onChange={event => void upload(event.target.files?.[0])} /></label>
    <p role="status" className="mb-4 text-xs text-zinc-500">{message || 'Use the stable c- campaign token from the creator’s App Store destination. Imports preserve currency and territory separately.'}</p>
    <Table rows={scalarRows(rows)} columns={['handle','campaign','day','territory','downloads','sales','currency']} />
  </Panel>
}

function scalarRows(rows: Array<Record<string, unknown>>) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? null : typeof value === 'number' ? value : String(value)]))) as Array<Record<string, string | number | null>>
}
