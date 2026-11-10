import {generateCreatorSpeech} from '../../lib/creator/video-speech-server'
import {voiceDirection} from '../../lib/creator/video-speech'
import {followerScript,followerSectionsSchema} from '../../lib/creator/private-character'
import {validateProductionScript} from '../../lib/creator/video-production'
// Explicit, one-time release preparation. Provider credentials stay on the build server.
import {readFile} from 'node:fs/promises'
import sharp from 'sharp'
import {eq} from 'drizzle-orm'
import {db,schema} from '../../lib/db'
import {generateFollowerDraft,newPrivateCharacterSchema} from '../../lib/creator/private-characters-server'
if(!process.env.MOONSHOT_API_KEY)throw new Error('Private script preparation requires the existing Moonshot provider')
const input=JSON.parse(await readFile('private/creator/rizzlord-starters.json','utf8')) as unknown[]
if(input.length!==3)throw new Error('This release requires the three approved starter portraits')
const reviews=[]
for(const value of input){
 const person=newPrivateCharacterSchema.parse(value)
 const [existing]=await db.select().from(schema.creatorPrivateCharacters).where(eq(schema.creatorPrivateCharacters.id,person.id))
 if(existing){
  if(existing.workspaceId!=='rizzlord')throw new Error('Starter ID belongs to a different workspace')
  let script=validateProductionScript(existing.payload.script)
  if(existing.status==='draft'&&!existing.payload.recording){
   script=followerScript(followerSectionsSchema.parse(script.cues.map(cue=>({text:cue.text,feature:cue.section?.visuals[0]?.categoryId??'overall'}))))
   await db.update(schema.creatorPrivateCharacters).set({payload:{...existing.payload,script}}).where(eq(schema.creatorPrivateCharacters.id,person.id))
  }
  reviews.push({id:existing.id,title:existing.title,script});continue
 }
 const [workspace]=await db.select().from(schema.creatorPrivateStudioWorkspaces).where(eq(schema.creatorPrivateStudioWorkspaces.id,'rizzlord'))
 if(!workspace)throw new Error('The private workspace has not been installed')
 const recent=reviews.map(row=>row.title)
 const {script,analysis,title}=await generateFollowerDraft(person.id,'',person.images,recent,()=>{},AbortSignal.timeout(270000))
 const first=Buffer.from(person.images[0].dataUrl.split(',')[1],'base64'),avatar='data:image/jpeg;base64,'+(await sharp(first).resize(160,200,{fit:'cover'}).jpeg({quality:75}).toBuffer()).toString('base64')
 await db.insert(schema.creatorPrivateCharacters).values({id:person.id,workspaceId:'rizzlord',name:'',title,avatar,status:'draft',quotaDay:null,payload:{images:person.images,analysis,script}})
 reviews.push({id:person.id,title,script})
}
// Review stays inside the authenticated, owner-scoped library.
console.log('Private starter scripts saved to the owner-scoped library; narration and assessments are not logged.')
console.log('Private Studio: three unnamed starter drafts saved. Daily upload allowance remains three.')
if(process.env.CREATOR_PRIVATE_STUDIO_VOICE_CHECK==='1'){
 const voice=await generateCreatorSpeech('Mogging gives this example 7.5 out of ten.',voiceDirection('editorial'),undefined,AbortSignal.timeout(150000))
 console.log('Private Studio generic voice check:',JSON.stringify({durationMs:voice.durationMs,wordCount:voice.words?.length??0,alignmentAvailable:Boolean(voice.words?.length),timingIssue:voice.alignmentError??null}))
 // Transcription uncertainty uses the existing section-timing fallback; it must not discard valid speech.
}
await db.$client.end()
