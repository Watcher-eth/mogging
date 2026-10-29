import {expect,mock,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
let snapshot:any={data:undefined,error:undefined,mutate:async()=>{}}
mock.module('swr',()=>({default:()=>snapshot}))
const {ReleaseCohortsDashboard}=await import('./release-cohorts-dashboard')
test('release loading, missing data and immature cohorts do not become zero outcome rates',()=>{
 const loading=renderToStaticMarkup(<ReleaseCohortsDashboard days={14}/>)
 expect(loading).toContain('Loading release outcomes')
 snapshot={...snapshot,error:Error('unavailable')}
 expect(renderToStaticMarkup(<ReleaseCohortsDashboard days={14}/>)).toContain('Release outcomes could not refresh')
 snapshot={...snapshot,error:undefined,data:{generatedAt:new Date().toISOString(),rows:[{release:'1.48(87)',platform:'ios',first_opens:4,paywall_devices:0,verified_buyers:0,eligible24:0,eligible7:0}]}}
 const html=renderToStaticMarkup(<ReleaseCohortsDashboard days={14}/>)
 expect(html).toContain('No paywall exposure')
 expect(html).toContain('Not exposed')
 expect(html).not.toContain('0.0%')
})
