import type {NextApiRequest,NextApiResponse} from 'next'
import {unstable_cache} from 'next/cache'
import {z} from 'zod'
import {db} from '@/lib/db'
import {releaseCohortsQuery} from '@/lib/admin/release-cohorts'
import {requireCreatorAdmin} from '@/lib/admin/creator-auth'
import {handleApiError,json,methodNotAllowed} from '@/lib/api/http'
import {enforceRateLimit} from '@/lib/api/rateLimit'
const report=unstable_cache(async(days:number)=>({generatedAt:new Date().toISOString(),rows:await db.execute(releaseCohortsQuery(days))}),['release-cohorts-v1'],{revalidate:60})
export const config={maxDuration:30}
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store')
 try{
  if(req.method!=='GET')return methodNotAllowed(res,['GET'])
  await requireCreatorAdmin(req,res)
  await enforceRateLimit(req,res,{key:'admin_release_cohorts',limit:30,windowMs:60_000})
  const days=z.enum(['7','14','30','90']).default('30').parse(req.query.days)
  return json(res,200,await report(Number(days)))
 }catch(error){return handleApiError(error,res)}
}
