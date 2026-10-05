import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export type CategoryRow = { label: string; values: Array<number | null>; detail?: string }
type Series = { label: string; color: string }
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function CategoryChart({ rows, series, format = number, maximum }: { rows: CategoryRow[]; series: Series[]; format?: (value: number) => string; maximum?: number }) {
  if (!rows.length) return <p className="admin-empty">No observations in this window.</p>
  const config: ChartConfig = Object.fromEntries(series.map((item, index) => [`value${index}`, item]))
  const data = rows.map(row => ({ ...row, ...Object.fromEntries(row.values.map((value, index) => [`value${index}`, value])) }))
  return <div>
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(160, rows.length * (series.length > 1 ? 56 : 44) + 56) }} aria-label="Category comparison. Exact values and measurement notes are available below.">
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 12, top: 8, bottom: 8 }} barGap={3}>
        <CartesianGrid horizontal={false} stroke="#eef0f3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={format} domain={maximum ? [0, maximum] : [Math.min(0, ...rows.flatMap(row => row.values.map(value => value ?? 0))), 'auto']} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={130} tickFormatter={value => String(value).length > 22 ? `${String(value).slice(0, 21)}…` : String(value)} />
        <ChartTooltip cursor={{ fill: '#f4f6f8' }} content={<ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload.label} formatter={(value, name, item) => <div className="grid gap-1"><span>{config[String(name)]?.label}: <strong>{format(Number(value))}</strong></span>{item.payload.detail ? <span className="text-xs text-muted-foreground">{item.payload.detail}</span> : null}</div>} />} />
        {series.map((item, index) => <Bar key={item.label} dataKey={`value${index}`} fill={`var(--color-value${index})`} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />)}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </BarChart>
    </ChartContainer>
    <details className="admin-data-details"><summary>View chart values</summary><div className="admin-table-scroll mt-4"><table className="admin-table"><thead><tr><th scope="col">Category</th>{series.map(item => <th key={item.label} scope="col">{item.label}</th>)}<th scope="col">Details</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index}>{value == null ? '—' : format(value)}</td>)}<td>{row.detail || '—'}</td></tr>)}</tbody></table></div></details>
  </div>
}

const distributionColors = ['#00A8EF', '#9b83e5', '#40a88a', '#db9474', '#52565c']
export function DistributionChart({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (!total) return <p className="admin-empty">No observations in this window.</p>
  const data = rows.map((row, index) => ({ ...row, key: `slice${index}`, fill: distributionColors[index % distributionColors.length] }))
  const config: ChartConfig = Object.fromEntries(data.map(row => [row.key, { label: row.label, color: row.fill }]))
  return <div>
    <ChartContainer config={config} className="mx-auto aspect-square h-64" aria-label="Cancellation timing distribution">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={(value, _, item) => <span>{item.payload.label}: <strong>{number(Number(value))}</strong> ({(Number(value) / total * 100).toFixed(1)}%)</span>} />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={68} outerRadius={100} paddingAngle={2} isAnimationActive={false}>{data.map(row => <Cell key={row.key} fill={row.fill} />)}</Pie>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-[#181a1d] text-2xl font-medium">{number(total)}</text>
      </PieChart>
    </ChartContainer>
    <ul className="grid gap-3 text-sm">{data.map(row => <li key={row.key} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: row.fill }} /><span className="flex-1 text-[#73777d]">{row.label}</span><span className="tabular-nums">{number(row.value)} · {(row.value / total * 100).toFixed(1)}%</span></li>)}</ul>
  </div>
}
