import { expect,test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { json,ApiError,handleApiError } from '../api/http'

test('share creation uses mobile bearer identity and keeps the standard data envelope',async()=>{
 const source=readFileSync(new URL('../../pages/api/share/analysis.ts',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^\n]+\n/gm,'').replace(/^export default[^\n]*/gm,'')
 let identity: string|null='mobile-owner';let received:any
 const scope:any={getRequestUserId:async()=>identity,getOrSetAnonymousActorId:()=> 'anonymous',parseBody:(_:unknown,v:unknown)=>v,createAnalysisShareSchema:{},ApiError,handleApiError,json,
 createAnalysisShare:async(input:any)=>{received=input;if(input.ownerUserId!=='mobile-owner')throw new scope.SharingServiceError(403,'Forbidden');return{share:{token:'private-owner-token'},existing:false}},SharingServiceError:class extends Error{constructor(public status:number,message:string){super(message)}},}
 runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.handler=handler'),scope)
 let body:any;const res:any={setHeader:()=>{},status:(s:number)=>{res.statusCode=s;return res},json:(v:any)=>{body=v;return res}}
 await scope.handler({method:'POST',body:{analysisId:'saved-private',ownerUserId:'spoofed-owner'}},res)
 expect(received.ownerUserId).toBe('mobile-owner');expect(body).toEqual({data:{share:{token:'private-owner-token'},existing:false},share:{token:'private-owner-token'}})
 identity=null;await scope.handler({method:'POST',body:{analysisId:'saved-private',ownerUserId:'mobile-owner'}},res)
 expect(res.statusCode).toBe(403);expect(received.ownerUserId).toBeNull();expect(body.data).toBeUndefined()
})
