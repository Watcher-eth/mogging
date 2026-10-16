import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import postgres, { type Sql } from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
const address=process.env.TEST_PUSH_DATABASE_URL

test.skipIf(!address)('earned reward delivery deduplicates concurrent sends, retries definite rejection and preserves uncertain transport',async()=>{
 if(!address||new URL(address).hostname!=='127.0.0.1'||new URL(address).port!=='55448')throw Error('Use isolated local push test database')
 const client=postgres(address,{max:1,prepare:false});const rollback=Error('rollback');
 try{await client.begin(async tx=>{
  const user=crypto.randomUUID();await tx`insert into users(id,email) values(${user},${user+'@example.invalid'})`;
  const device={userId:user,installId:crypto.randomUUID(),token:'a'.repeat(64),environment:'sandbox',timezone:'UTC',protocolDays:[],sessionExpiresAt:new Date(Date.now()+86400000),updatedAt:new Date()};
  await tx`insert into push_devices(install_id,user_id,token,environment,timezone,session_expires_at) values(${device.installId},${user},${device.token},'sandbox','UTC',${device.sessionExpiresAt})`;
  let sends=0;let status=200;let transportFailure=false;let configured=true;const messages:any[]=[];
  const context:any={db:drizzle(Object.assign(tx,{options:client.options}) as unknown as Sql),schema,and,eq,console:{error(){}},prepareApplePush:async()=>{if(!configured)throw Error('config')},prepareAndroidPush:async()=>{},
   sendApplePush:async(input:unknown)=>{sends++;messages.push(input);if(transportFailure)throw Error('connection');return {status}},sendAndroidPush:async()=>{throw Error('wrong transport')}};
  const source=readFileSync(new URL('./delivery.ts',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
  runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.deliver=deliverPush'),context);
  const message={kind:'referral_reward',slot:'earned-credit',title:'Your free scan is unlocked',body:'Your scan is ready.',target:'scan_reward',ttlSeconds:86400};
  expect(await Promise.all([context.deliver(device,message),context.deliver(device,message)])).toEqual(['sent','duplicate']);expect(sends).toBe(1);expect(messages[0].ttlSeconds).toBe(86400);
  status=503;expect(await context.deliver(device,{...message,slot:'retry'})).toBe('failed');status=200;expect(await context.deliver(device,{...message,slot:'retry'})).toBe('sent');
  transportFailure=true;expect(await context.deliver(device,{...message,slot:'uncertain'})).toBe('failed');transportFailure=false;expect(await context.deliver(device,{...message,slot:'uncertain'})).toBe('duplicate');
  configured=false;expect(await context.deliver(device,{...message,slot:'unconfigured'})).toBe('failed');configured=true;expect(await context.deliver(device,{...message,slot:'unconfigured'})).toBe('sent');
  const rows=await tx`select count(*)::int n from push_deliveries where user_id=${user}`;expect(rows[0].n).toBe(4);
  throw rollback;
 })}catch(error){if(error!==rollback)throw error}finally{await client.end()}
})
