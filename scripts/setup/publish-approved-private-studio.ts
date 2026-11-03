import {readFile} from 'node:fs/promises'
import {and,eq,sql} from 'drizzle-orm'
import {db,schema} from '../../lib/db'
import {restoreProductionRecording,validateProductionScript} from '../../lib/creator/video-production'
const allowed=new Set(['5e5e4ef2-9388-4827-b2b7-6d0d3805d6b3','3898eef4-7fc2-4855-9650-cab5cdea10d5','c3709ea3-e3fd-4b25-bf53-832cff2d4e8c'])
const rows=JSON.parse(await readFile('private/creator/rizzlord-approved-recordings.json','utf8'))
if(rows.length!==3||new Set(rows.map((row:{id:string})=>row.id)).size!==3)throw new Error('Expected exactly three approved recordings')
await db.transaction(async tx=>{
 for(const row of rows){
  if(!allowed.has(row.id)||row.name!=='')throw new Error('Unexpected private character')
  const script=validateProductionScript(row.script),recording=restoreProductionRecording(row.recording)
  if(recording.script.revision!==script.revision||recording.clips.size!==script.cues.length||recording.voice.voice!=='en-us-koda')throw new Error('Approved recording is incomplete')
  if(row.editorialRatings.length!==2||row.editorialRatings.some((rating:{score:number})=>!Number.isFinite(rating.score)||rating.score<0||rating.score>10))throw new Error('Invalid editorial ratings')
  const payload=JSON.stringify({script,recording:row.recording,editorialRatings:row.editorialRatings})
  const saved=await tx.update(schema.creatorPrivateCharacters).set({name:'',title:row.title,status:'ready',payload:sql`${schema.creatorPrivateCharacters.payload} || ${payload}::jsonb`,updatedAt:new Date()}).where(and(eq(schema.creatorPrivateCharacters.id,row.id),eq(schema.creatorPrivateCharacters.workspaceId,'rizzlord'))).returning({id:schema.creatorPrivateCharacters.id})
  if(saved.length!==1)throw new Error('Approved character was not found in its private workspace')
 }
})
console.log('Three approved private scripts and complete Koda recordings saved. No private narration or assessments are logged.')
await db.$client.end()
