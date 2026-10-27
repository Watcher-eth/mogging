import { expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
import { EMPTY_CREATOR_CONVERSION_REPORT } from '../conversion-report'
const dialect = new PgDialect()
let query:{sql:string;params:unknown[]}|undefined
mock.module('@/lib/db',()=>({schema,db:{query:{creatorProfiles:{findFirst:async()=>({id:'authenticated-owner',authStatus:'verified'})}},execute:async(sql:Parameters<typeof dialect.sqlToQuery>[0])=>{query=dialect.sqlToQuery(sql);return [{report:EMPTY_CREATOR_CONVERSION_REPORT}]}}}))
const {getCreatorConversionReport}=await import('../conversion-service')
test('windowed report scopes both click and event credits at activity time without resetting first-customer history',async()=>{
 await getCreatorConversionReport('signed-in-user',{start:new Date('2026-10-26T00:00:00Z'),end:new Date('2026-10-29T00:00:00Z')})
 expect(query?.params).toContain('authenticated-owner')
 expect(query?.params.filter(p=>p==='2026-10-26T00:00:00.000Z')).toHaveLength(4)
 expect(query?.params.filter(p=>p==='2026-10-29T00:00:00.000Z')).toHaveLength(4)
 expect(query?.sql).toContain('video_days')
 expect(query?.sql).toContain('not p.is_draft')
 const history=query!.sql.slice(query!.sql.indexOf('first_customers as'),query!.sql.indexOf('daily_activity as'))
 expect(history).not.toContain('created_at >=')
 const credits=query!.sql.slice(query!.sql.indexOf('credits as'),query!.sql.indexOf('video_days as'))
 expect(credits).toContain('c.created_at >=');expect(credits).toContain('e.created_at >=')
})
test('existing all-time report has no date restriction; invalid windows fail before reading data',async()=>{
 await getCreatorConversionReport('signed-in-user')
 expect(query?.sql).not.toContain('c.created_at >=')
 await expect(getCreatorConversionReport('signed-in-user',{start:new Date('bad'),end:new Date()})).rejects.toThrow('Invalid conversion window')
})
