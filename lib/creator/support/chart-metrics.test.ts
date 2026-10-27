import {expect,test} from 'bun:test'
import {chartMetricRows} from '@/components/creator/support/chart-metrics'
test('stacked bars expose every metric with common activity scale and separate USD units',()=>{
 const rows=chartMetricRows({linkPresses:200,downloads:50,conversions:10,revenueCents:12345})
 expect(rows.map(r=>r.key)).toEqual(['linkPresses','downloads','conversions','revenue'])
 expect(rows.map(r=>r.fraction)).toEqual([1,.25,.05,1])
 expect(rows[3].formatted).toBe('$123.45')
 expect(rows[3].value).toBe(123.45)
})
test('empty windows and net refunds retain exact values without invalid or negative bar widths',()=>{
 expect(chartMetricRows({linkPresses:0,downloads:0,conversions:0,revenueCents:0}).every(row=>row.fraction===0)).toBe(true)
 const refund=chartMetricRows({linkPresses:10,downloads:0,conversions:0,revenueCents:-1250}).at(-1)!
 expect(refund.formatted).toBe('-$12.50');expect(refund.fraction).toBe(1)
})
