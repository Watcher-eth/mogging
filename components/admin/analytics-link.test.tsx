import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {AnalyticsLink,AnalyticsPreviewLinks,analyticsPreviewHref} from './analytics-link'
import {adminNavigation,analyticsPreviewPages} from '@/lib/admin/navigation'
test('every analytics page has a local-only navigation counterpart',()=>{
 for(const item of adminNavigation.find(group=>group.label==='Analytics')!.items)expect(analyticsPreviewPages[item.href]).toBeTruthy()
 expect(Object.keys(analyticsPreviewPages)).toHaveLength(18)
})
test('local analytics detail links retain filters and point to their selected preview',()=>{
 expect(analyticsPreviewHref({pathname:'/admin/analytics/scans',query:{days:'90',platform:'ios'}})).toEqual({pathname:'/admin/__product-overview-preview',query:{page:'scans',days:'90',platform:'ios'}})
 const html=renderToStaticMarkup(<AnalyticsPreviewLinks><AnalyticsLink href="/admin/attribution">Creator attribution</AnalyticsLink></AnalyticsPreviewLinks>)
 expect(html).toContain('/admin/__product-overview-preview?page=creator-attribution')
 expect(analyticsPreviewHref('/admin/program-settings')).toBe('/admin/program-settings')
})
test('authenticated analytics links preserve their protected production routes',()=>{
 const html=renderToStaticMarkup(<AnalyticsLink href="/admin/analytics/quality">Data health</AnalyticsLink>)
 expect(html).toContain('href="/admin/analytics/quality"')
 expect(html).not.toContain('__product-overview-preview')
})
