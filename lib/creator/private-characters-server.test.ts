import {afterAll,beforeAll,expect,test} from 'bun:test'
import postgres from 'postgres'
import sharp from 'sharp'
import {readFile} from 'node:fs/promises'
const url=process.env.PRIVATE_STUDIO_TEST_DATABASE_URL
if(url&&!/^postgres(?:ql)?:\/\/[^/]*@127\.0\.0\.1:\d+\//.test(url))throw new Error('Use an explicit disposable localhost database for private Studio integration tests')
const integration=url?test:test.skip
const {privateLibrary,requirePrivateWorkspace,reservePrivateCharacter,getPrivateCharacter,retryPrivateCharacter}=url?await import('./private-characters-server'):{} as typeof import('./private-characters-server')
const client=postgres(url??'postgres://test@127.0.0.1:1/unused',{prepare:false,max:5})
let image:Record<string,unknown>
beforeAll(async()=>{
 if(!url)return
 await client.unsafe(`create table users(id text primary key,email text);create table creator_profiles(id text primary key,user_id text,auth_status text,social_handle text);create table creator_social_accounts(id text,creator_profile_id text,handle text);insert into users values ('owner','owner@example.test'),('admin','w@mogging.com'),('other','other@example.test');insert into creator_profiles values ('rizzlord-profile','owner','verified','rizzlord.ratings'),('other-profile','other','verified','somebody');`)
 await client.unsafe(await readFile(new URL('../../drizzle/0071_creator_private_characters.sql',import.meta.url),'utf8'))
 const bytes=await sharp({create:{width:256,height:320,channels:3,background:'#bbb'}}).jpeg().toBuffer()
 image={id:'test-front',name:'Test portrait',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),width:256,height:320,status:'ready',landmarks:{version:1,source:'mediapipe-face-landmarker',confidence:.9,image:{width:256,height:320},anchors:{leftPupil:{x:.4,y:.4},rightPupil:{x:.6,y:.4}}}}
})
afterAll(async()=>{await client.end();await (globalThis as {postgresClient?:{end:()=>Promise<void>}}).postgresClient?.end()})
integration('the pinned creator and named admin share one workspace; later handle claims grant no access',async()=>{
 expect(await requirePrivateWorkspace('owner')).toBe('rizzlord');expect(await requirePrivateWorkspace('admin')).toBe('rizzlord')
 await client`update creator_profiles set social_handle='rizzlord.ratings' where id='other-profile'`
 await expect(requirePrivateWorkspace('other')).rejects.toMatchObject({status:403})
})
integration('concurrent creation permits exactly three per UTC day; retrying uses the same saved person and no extra slot',async()=>{
 const attempts=await Promise.allSettled(Array.from({length:5},()=>reservePrivateCharacter('rizzlord',{id:crypto.randomUUID(),name:'Follower',images:[image],consent:true})))
 const saved=attempts.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
 expect(saved).toHaveLength(3)
 for(const attempt of attempts)if(attempt.status==='rejected')expect(attempt.reason.status).toBe(429)
 expect((await privateLibrary('rizzlord')).remaining).toBe(0)
 await client`update creator_private_characters set status='failed' where id=${saved[0]}`
 expect(await retryPrivateCharacter('rizzlord',saved[0])).toBe(saved[0])
 expect((await privateLibrary('rizzlord')).remaining).toBe(0)
 await expect(reservePrivateCharacter('rizzlord',{id:saved[0],name:'Replacement',images:[image],consent:true})).rejects.toMatchObject({status:409})
 await expect(getPrivateCharacter('another-workspace',saved[0])).rejects.toMatchObject({status:404})
 await client`update creator_private_characters set quota_day=current_date-1`
 expect((await privateLibrary('rizzlord')).remaining).toBe(3)
})
integration('interrupted work becomes recoverable while active voice jobs retain their lease',async()=>{
 await client`update creator_private_characters set status='speaking',updated_at=now()-interval '7 minutes'`
 const library=await privateLibrary('rizzlord');expect(library.characters.every(character=>character.status==='draft')).toBe(true)
})
