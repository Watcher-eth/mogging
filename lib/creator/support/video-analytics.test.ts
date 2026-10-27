import { expect, test } from 'bun:test'
import { conversionQuery, conversionWindow, groundedAnalyticsAnswer, isConversionQuestion, supportVideoAnalytics, videoAnalyticsText } from './video-analytics'
import { createDemoDataSource } from './demo'
import { runSupportAgent } from './agent'
import { supportScope } from './scope'
import type { CreatorConversionReport, CreatorConversionVideo } from '../conversion-report'
const metrics = (conversions:number) => ({linkPresses:100,downloads:20,conversions,revenueCents:conversions*1000})
const window = conversionWindow({period:'this-week'},new Date('2026-10-28T12:00:00Z'))
const video = (id:string,postedAt:string|null,conversions:number):CreatorConversionVideo => ({...metrics(conversions),id,title:`Video ${id}`,platform:'tiktok',postUrl:null,postedAt,submittedAt:'2026-10-27T10:00:00Z',attributionExpiresAt:null,paidAmountCents:0,direct:metrics(conversions),estimated:{linkPresses:0,downloads:0,conversions:0,revenueCents:0},daily:[{day:'2026-10-27',linkPresses:100,downloads:20,conversions,revenue:conversions*10}]})
const report:CreatorConversionReport={bonusesAvailable:false,daily:[{day:'2026-10-27',linkPresses:300,downloads:60,conversions:9,revenue:90}],totals:{linkPresses:300,downloads:60,conversions:9,revenueCents:9000},unassigned:{linkPresses:0,downloads:0,conversions:0,revenueCents:0},videos:[video('a','2026-10-27T10:00:00Z',5),video('b','2026-10-20T10:00:00Z',3),video('c',null,1)]}
test('calendar weeks are Monday-based, exclusive-ended UTC windows including month boundaries',()=>{
 expect(window).toMatchObject({start:'2026-10-26T00:00:00.000Z',end:'2026-10-29T00:00:00.000Z',days:3})
 expect(conversionWindow({period:'last-week'},new Date('2026-11-02T01:00:00Z'))).toMatchObject({start:'2026-10-26T00:00:00.000Z',end:'2026-11-02T00:00:00.000Z',days:7})
 expect(conversionWindow({period:'this-week'},new Date('2026-10-26T01:00:00Z')).days).toBe(1)
})
test('real phrasing admits convert, recognizes this week, and does not turn pure definitions into account queries',()=>{
 expect(supportScope('How well did my video convert this week?')).toBe('creator')
 expect(isConversionQuestion('How well did my video convert this week?')).toBe(true)
 expect(conversionQuery('How well did my video convert this week?')).toMatchObject({period:'this-week',postedInPeriod:false})
 expect(conversionQuery('Which videos posted this week converted best?').postedInPeriod).toBe(true)
 expect(isConversionQuestion('What is a conversion?')).toBe(false)
})
test('specific video and posted-date cohorts get their own totals and chart, never account-wide or lifetime metrics',()=>{
 const one=supportVideoAnalytics(report,window,{submissionId:'a'})
 expect(one.totals.conversions).toBe(5)
 expect(one.daily.reduce((n,r)=>n+r.conversions,0)).toBe(5)
 const posted=supportVideoAnalytics(report,window,{postedInPeriod:true})
 expect(posted.videos.map(v=>v.id)).toEqual(['a'])
 expect(posted.unknownPostDates).toBe(1)
 expect(posted.totals.conversions).toBe(5)
 const missing=supportVideoAnalytics(report,window,{submissionId:'someone-elses-post'})
 expect(missing.selection).toBe('missing');expect(missing.totals.conversions).toBe(0);expect(missing.videos).toEqual([])
})
test('title matching, zero denominator, and unassigned conversions stay explicit',()=>{
 expect(supportVideoAnalytics(report,window,{search:'How did Video b convert this week?'}).videos.map(v=>v.id)).toEqual(['b'])
 const empty=supportVideoAnalytics({...report,totals:{...metrics(0),linkPresses:0},videos:[]},window,{})
 expect(empty.conversionsPer100Presses).toBeNull()
 expect(videoAnalyticsText(empty)).toContain('cannot be calculated')
 const unassigned=supportVideoAnalytics({...report,unassigned:{...metrics(2),linkPresses:0}},window,{})
 expect(videoAnalyticsText(unassigned)).toContain('2 conversions could not be assigned')
})
test('exact reported failure retrieves and renders per-video data before any model call, with a useful no-key explanation',async()=>{
 const source=createDemoDataSource();let queries=0;const original=source.videoAnalytics
 source.videoAnalytics=async query=>{queries++;expect(query.period).toBe('this-week');return original(query)}
 const answer=await runSupportAgent({input:{message:'How well did my video convert this week?'},memory:[],source,sampleData:true})
 expect(queries).toBe(1);expect(answer.artifacts.some(a=>a.type==='video-analytics')).toBe(true)
 expect(answer.text).toContain('conversions');expect(answer.text).toContain('direct');expect(answer.text).toContain('estimated')
 expect(answer.text).not.toContain('suggest checking');expect(answer.usage.modelCalls).toBe(0)
})
test('signed video context carries through an analytics period followup',async()=>{
 const answer=await runSupportAgent({input:{message:'What about last week?'},memory:[{role:'assistant',content:'Portal references: Conversion analytics: This week | Video sample-post-1: Your next level starts here'},{role:'user',content:'Show my conversions'}],source:createDemoDataSource(),sampleData:true})
 const artifact=answer.artifacts.find(a=>a.type==='video-analytics')
 expect(artifact?.report.window.label).toBe('Last week');expect(artifact?.report.selection).toBe('video');expect(artifact?.report.videos[0].id).toBe('sample-post-1')
})

test('unsupported cohort percentages, raw cents, and benchmark claims fall back to the factual explanation',()=>{
 const data=supportVideoAnalytics(report,window,{})
 for(const draft of ['This was strong performance.','Your videos performed well this week.','You converted 3% of link presses.','Your revenue was 9000 cents.']) expect(groundedAnalyticsAnswer(draft,data)).toBe(videoAnalyticsText(data))
 const factual='You recorded 9 conversions. Video a led with 5 conversions.'
 expect(groundedAnalyticsAnswer(factual,data)).toBe(factual)
})
