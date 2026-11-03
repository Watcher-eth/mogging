import type {NextApiRequest,NextApiResponse} from 'next'
import {z} from 'zod'
import {getAuthSession} from '@/lib/auth/session'
import {ApiError,handleApiError,json,methodNotAllowed} from '@/lib/api/http'
import {enforceRateLimit} from '@/lib/api/rateLimit'
import {getPrivateCharacter,privateLibrary,requirePrivateWorkspace,reservePrivateCharacter,retryPrivateCharacter,writePrivateCharacter,speakPrivateCharacter} from '@/lib/creator/private-characters-server'
import type {PrivateCharacterEvent} from '@/lib/creator/private-character'

export const config={api:{bodyParser:{sizeLimit:'12mb'},responseLimit:'16mb'},maxDuration:300}
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  res.setHeader('Cache-Control','private, no-store')
  try{
    if(!['GET','POST'].includes(req.method??''))return methodNotAllowed(res,['GET','POST'])
    const session=await getAuthSession(req,res)
    if(!session?.user?.id)throw new ApiError(401,'Authentication required')
    const workspace=await requirePrivateWorkspace(session.user.id)
    if(req.method==='GET'){
      const id=req.query.id===undefined?undefined:z.string().uuid().parse(req.query.id)
      return json(res,200,id?await getPrivateCharacter(workspace,id):await privateLibrary(workspace))
    }
    if(![ `https://${req.headers.host}`,`http://${req.headers.host}`].includes(req.headers.origin??''))throw new ApiError(403,'Same-origin requests required')
    await enforceRateLimit(req,res,{key:`private-studio:${session.user.id}`,limit:12,windowMs:3600000})
    const speaking=req.body?.action==='speak'
    const speech=speaking?z.object({action:z.literal('speak'),id:z.string().uuid(),revision:z.string().max(80)}).strict().parse(req.body):null
    const retry=req.body?.action==='retry'?z.object({action:z.literal('retry'),id:z.string().uuid()}).strict().parse(req.body):null
    const id=speech?.id??(retry?await retryPrivateCharacter(workspace,retry.id):await reservePrivateCharacter(workspace,req.body))
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),285000)
    res.once('close',()=>{if(!res.writableEnded)controller.abort()})
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('X-Accel-Buffering','no');res.flushHeaders()
    const emit=(event:PrivateCharacterEvent)=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(event)}\n\n`)}
    const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': working\n\n')},10000)
    try{
      if(speech)await speakPrivateCharacter(workspace,id,speech.revision,emit,controller.signal)
      else await writePrivateCharacter(workspace,id,emit,controller.signal)
    }catch(error){emit({stage:'error',message:error instanceof ApiError?error.message:'Generation was interrupted. Your saved character is preserved; reopen it to retry.'})}
    finally{clearTimeout(timer);clearInterval(heartbeat);res.end()}
  }catch(error){return handleApiError(error,res)}
}
